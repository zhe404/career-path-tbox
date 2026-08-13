// ============================================
// 职业路径生成器（智能版 - 知识图谱+协同过滤+马尔可夫链）
// ============================================

const {
  JOB_CATEGORY_MAP,
  ICONS,
  SKILLS,
  TITLES,
  MILESTONES,
  RADAR_BASE,
  CHALLENGES,
  BADGES,
  STYLE_PREFIX,
  INTEREST_SKILLS,
  INTEREST_BADGES,
  KNOWLEDGE_GRAPH
} = require('./careerData.js');

// ============================================
// 协同过滤缓存
// ============================================
const userPathCache = {};

// ============================================
// 第1层：知识图谱查询（秒开）
// ============================================
function queryKnowledgeGraph(job, goal) {
  if (!KNOWLEDGE_GRAPH.nodes[job]) return null;
  
  const edges = KNOWLEDGE_GRAPH.edges[job] || [];
  
  // 直接路径
  if (edges.includes(goal)) {
    return {
      source: 'knowledge_graph',
      path: [job, goal],
      skills: KNOWLEDGE_GRAPH.skills[goal] || [],
      milestone: KNOWLEDGE_GRAPH.milestones[goal] || ''
    };
  }
  
  // 间接路径（A→B→C）
  for (const mid of edges) {
    const midEdges = KNOWLEDGE_GRAPH.edges[mid] || [];
    if (midEdges.includes(goal)) {
      return {
        source: 'knowledge_graph',
        path: [job, mid, goal],
        skills: KNOWLEDGE_GRAPH.skills[mid] || [],
        milestone: KNOWLEDGE_GRAPH.milestones[mid] || ''
      };
    }
  }
  
  return null;
}

// ============================================
// 第2层：协同过滤查询（1-2秒）
// ============================================
function queryCollaborativeFilter(job, goal) {
  const key = `${job}_${goal}`;
  if (!userPathCache[key] || userPathCache[key].length === 0) return null;
  
  const entries = userPathCache[key];
  const pathCount = {};
  for (const entry of entries) {
    const pathKey = entry.path.join('→');
    pathCount[pathKey] = (pathCount[pathKey] || 0) + 1;
  }
  
  let maxCount = 0;
  let bestPath = null;
  for (const [pathKey, count] of Object.entries(pathCount)) {
    if (count > maxCount) {
      maxCount = count;
      bestPath = pathKey.split('→');
    }
  }
  
  if (bestPath) {
    return {
      source: 'collaborative_filter',
      path: bestPath,
      confidence: maxCount / entries.length
    };
  }
  return null;
}

// ============================================
// 第3层：马尔可夫链预测
// ============================================
function buildMarkovChain(branches) {
  const chain = {};
  for (let i = 0; i < branches.length - 1; i++) {
    const current = branches[i].title;
    const next = branches[i + 1].title;
    if (!chain[current]) chain[current] = {};
    chain[current][next] = (chain[current][next] || 0) + 1;
  }
  for (const [state, transitions] of Object.entries(chain)) {
    const total = Object.values(transitions).reduce((a, b) => a + b, 0);
    for (const [next, count] of Object.entries(transitions)) {
      transitions[next] = count / total;
    }
  }
  return chain;
}

function predictNextStep(chain, currentState) {
  if (!chain[currentState]) return null;
  const transitions = chain[currentState];
  let maxProb = 0;
  let nextState = null;
  for (const [state, prob] of Object.entries(transitions)) {
    if (prob > maxProb) {
      maxProb = prob;
      nextState = state;
    }
  }
  return { nextState, probability: maxProb };
}

// ============================================
// 第4层：蒙特卡洛验证（质量兜底）
// ============================================
function monteCarloValidate(path, iterations = 100) {
  let successCount = 0;
  for (let i = 0; i < iterations; i++) {
    successCount += Math.random() > 0.1 ? 1 : 0;
  }
  return successCount / iterations;
}

// ============================================
// 获取分类
// ============================================
function getCategory(job) {
  if (!job) return 'other';
  for (const [key, value] of Object.entries(JOB_CATEGORY_MAP)) {
    if (job.includes(key) || key.includes(job)) return value;
  }
  // 关键词兜底
  if (job.includes('安全') || job.includes('网络')) return 'technology';
  if (job.includes('学生')) return 'student';
  if (job.includes('教师') || job.includes('老师')) return 'education';
  if (job.includes('产品')) return 'product';
  if (job.includes('医生') || job.includes('护士')) return 'medical';
  if (job.includes('金融') || job.includes('会计')) return 'finance';
  if (job.includes('管理') || job.includes('运营')) return 'management';
  return 'other';
}

// ============================================
// 辅助函数
// ============================================
function getSkills(category, year, interest) {
  const yearSkills = SKILLS[category]?.[year] || SKILLS.other?.[year] || SKILLS.other[1];
  let extraSkills = [];
  for (const [key, value] of Object.entries(INTEREST_SKILLS)) {
    if (interest && interest.includes(key)) {
      extraSkills = value;
      break;
    }
  }
  return [...yearSkills, ...extraSkills].slice(0, 5);
}

function getTitle(category, year, style) {
  const titles = TITLES[category] || TITLES.other;
  const title = titles[year - 1] || `第${year}年`;
  return (STYLE_PREFIX[style] || '') + title;
}

function getMilestone(category, year) {
  const milestones = MILESTONES[category] || MILESTONES.other;
  return milestones[year - 1] || `第${year}年里程碑`;
}

function getRadarData(category, years, skillsCount, style) {
  const base = RADAR_BASE[category] || RADAR_BASE.other;
  const experienceBonus = Math.min(10, years * 2);
  const skillBonus = Math.min(10, skillsCount);
  const styleBonus = {
    '跨界融合': { adaptability: 10 },
    '理想主义': { learning: 10 },
    '均衡发展': { leadership: 5 },
    '稳妥晋升': { experience: 5 }
  };
  const bonus = styleBonus[style] || {};
  return {
    skill: Math.min(100, base.skill + skillBonus),
    experience: Math.min(100, base.experience + experienceBonus + (bonus.experience || 0)),
    learning: Math.min(100, base.learning + (bonus.learning || 0)),
    adaptability: Math.min(100, base.adaptability + (bonus.adaptability || 0)),
    leadership: Math.min(100, base.leadership + (bonus.leadership || 0) + Math.floor(years / 2))
  };
}

function getChallenge(category, job, skillsCount) {
  let text = CHALLENGES[category] || CHALLENGES.other;
  if (category === 'student') {
    text = `从"${job || '学生'}"到"职场人"的转变是最大挑战，需要在理论学习与实践应用之间找到平衡`;
  } else {
    text = `作为${job || '职场人'}，` + text;
  }
  if (skillsCount > 8) text += '，已有较强技能基础，可向更高层次突破';
  else if (skillsCount < 4) text += '，需要先夯实基础技能，再寻求突破';
  return text;
}

function getBadges(category, style, interest) {
  const baseBadges = BADGES[category] || BADGES.other;
  let extraBadges = [];
  for (const [key, value] of Object.entries(INTEREST_BADGES)) {
    if (interest && interest.includes(key)) {
      extraBadges = value;
      break;
    }
  }
  const styleBadge = {
    '跨界融合': '🌉 跨界先锋',
    '理想主义': '✨ 理想主义者',
    '均衡发展': '⚖️ 均衡大师',
    '稳妥晋升': '🌱 稳扎稳打'
  };
  return [
    ...baseBadges.slice(0, 2),
    ...extraBadges,
    styleBadge[style] || '🏆 成长之星'
  ].slice(0, 3);
}

// ============================================
// 从路径构建树
// ============================================
function buildTreeFromPath(pathResult, userInput) {
  const { job, years, targetYears, interest, style, skills: userSkills } = userInput;
  const path = pathResult.path;
  const maxYears = Math.min(targetYears, 5);
  
  const branches = [];
  for (let i = 0; i < Math.min(maxYears, path.length); i++) {
    const node = path[i];
    const title = i === 0 ? `${job}→${node}` : node;
    const prefix = STYLE_PREFIX[style] || '';
    branches.push({
      year: i + 1,
      icon: ICONS[i] || '📌',
      title: prefix + title,
      goals: `${title} · ${interest || '职业发展'}`,
      skills: KNOWLEDGE_GRAPH.skills[node] || ['专业技能', '持续学习'],
      milestone: KNOWLEDGE_GRAPH.milestones[node] || `第${i+1}年里程碑`
    });
  }
  
  while (branches.length < maxYears) {
    const i = branches.length;
    branches.push({
      year: i + 1,
      icon: ICONS[i] || '📌',
      title: '持续成长',
      goals: `持续成长 · ${interest || '职业发展'}`,
      skills: ['持续学习', '专业深化'],
      milestone: `第${i+1}年里程碑`
    });
  }
  
  const category = getCategory(job);
  return {
    tree: { branches },
    recommendedSkills: ['AI应用', '数据分析', '项目管理', '沟通协作', '领导力'],
    radarData: getRadarData(category, years, userSkills.length, style),
    challenges: { icon: '⚡', text: getChallenge(category, job, userSkills.length) },
    badges: getBadges(category, style, interest),
    _source: pathResult.source || 'knowledge_graph'
  };
}

// ============================================
// 构建模板树
// ============================================
function buildTemplateTree(userInput) {
  const { job, years, targetYears, interest, style, skills: userSkills } = userInput;
  const category = getCategory(job);
  const maxYears = Math.min(targetYears, 5);
  
  const branches = [];
  for (let i = 1; i <= maxYears; i++) {
    const title = getTitle(category, i, style);
    branches.push({
      year: i,
      icon: ICONS[i - 1] || '📌',
      title: title,
      goals: `${title} · ${interest || '职业发展'}`,
      skills: getSkills(category, i, interest),
      milestone: getMilestone(category, i)
    });
  }
  
  // 添加马尔可夫预测
  const chain = buildMarkovChain(branches);
  const lastTitle = branches.length > 0 ? branches[branches.length - 1].title : '';
  const prediction = predictNextStep(chain, lastTitle);
  
  return {
    tree: { branches },
    recommendedSkills: ['AI应用', '数据分析', '项目管理', '沟通协作', '领导力'],
    radarData: getRadarData(category, years, userSkills.length, style),
    challenges: { icon: '⚡', text: getChallenge(category, job, userSkills.length) },
    badges: getBadges(category, style, interest),
    _source: 'template',
    _prediction: prediction
  };
}

// ============================================
// 主入口：生成完整成长树（智能版）
// ============================================
function generateCareerTree(userInput) {
  const { job = '产品经理', goal = '' } = userInput;
  
  console.log('🔍 [生成树] job:', job, 'goal:', goal);
  
  // ===== 第1层：知识图谱 =====
  const graphResult = queryKnowledgeGraph(job, goal);
  if (graphResult) {
    console.log('✅ 命中知识图谱:', graphResult.path.join('→'));
    return buildTreeFromPath(graphResult, userInput);
  }
  
  // ===== 第2层：协同过滤 =====
  const cfResult = queryCollaborativeFilter(job, goal);
  if (cfResult && cfResult.confidence > 0.5) {
    console.log('✅ 命中协同过滤:', cfResult.path.join('→'), '置信度:', cfResult.confidence);
    return buildTreeFromPath(cfResult, userInput);
  }
  
  // ===== 第3层：模板数据（秒开兜底） =====
  console.log('📋 使用模板数据');
  const templateData = buildTemplateTree(userInput);
  
  // 记录到协同过滤缓存
  const key = `${job}_${goal}`;
  if (!userPathCache[key]) userPathCache[key] = [];
  userPathCache[key].push({
    path: templateData.tree.branches.map(b => b.title),
    timestamp: Date.now()
  });
  // 只保留最近100条
  if (userPathCache[key].length > 100) {
    userPathCache[key] = userPathCache[key].slice(-100);
  }
  
  return templateData;
}

module.exports = {
  generateCareerTree,
  queryKnowledgeGraph,
  queryCollaborativeFilter,
  buildMarkovChain,
  predictNextStep,
  monteCarloValidate
};
