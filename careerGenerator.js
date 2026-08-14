// ============================================
// 职业路径生成器（稳定版 v3.1）
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

const userPathCache = {};
const EXTENDED_ICONS = ['📚', '📝', '💡', '👥', '🏆', '🌐', '🎯', '🌟', '🏛️', '💎'];

// ============================================
// 过滤无效技能关键词
// ============================================
const INVALID_KEYWORDS = ['根据', '结合', '搜索', '用户', '建议', '以下', '如下', '结果', '信息', '推荐', '核心', '相关', '适合', '需要', '可以', '应该', '包括', '以上', '这些', '那些', '其中', '比如', '例如', '以及', '或者'];

function filterValidSkills(skills) {
  if (!Array.isArray(skills)) return [];
  return skills.filter(s => {
    const trimmed = String(s).trim();
    if (trimmed.length < 2 || trimmed.length > 12) return false;
    if (/^[0-9]+$/.test(trimmed)) return false;
    if (INVALID_KEYWORDS.some(k => trimmed.includes(k))) return false;
    return true;
  });
}

// ============================================
// 处理兴趣文本
// ============================================
function getInterestText(interest) {
  const invalidValues = ['无', '没有', '暂无', '无兴趣', '无特别兴趣', '无特别爱好', '无特别', '无特殊', '无特殊兴趣', '没什么', '没有特别'];
  if (!interest || invalidValues.includes(interest.trim())) return '';
  return interest.substring(0, 30);
}

// ============================================
// 处理目标职业
// ============================================
function getGoalContent(goal) {
  if (!goal || goal === '无' || goal === '暂无' || goal === '暂无目标') return null;
  
  const goalMap = {
    '店长': { finalTitle: '店长之路', finalMilestone: '晋升店长' },
    '经理': { finalTitle: '管理之路', finalMilestone: '晋升经理' },
    '总监': { finalTitle: '总监之路', finalMilestone: '晋升总监' },
    '专家': { finalTitle: '专家之路', finalMilestone: '成为专家' },
    '工程师': { finalTitle: '工程师之路', finalMilestone: '成为工程师' },
    '创业者': { finalTitle: '创业之路', finalMilestone: '成功创业' },
    '负责人': { finalTitle: '负责人之路', finalMilestone: '成为负责人' },
    '主管': { finalTitle: '主管之路', finalMilestone: '晋升主管' },
    '老师': { finalTitle: '教师之路', finalMilestone: '成为优秀教师' },
    '教师': { finalTitle: '教师之路', finalMilestone: '成为优秀教师' },
    '医生': { finalTitle: '名医之路', finalMilestone: '成为资深医生' },
    '护士': { finalTitle: '护理专家之路', finalMilestone: '成为护理专家' },
    '律师': { finalTitle: '大律师之路', finalMilestone: '成为资深律师' },
    '设计师': { finalTitle: '设计大师之路', finalMilestone: '成为设计专家' },
    '分析师': { finalTitle: '分析专家之路', finalMilestone: '成为资深分析师' },
  };
  
  for (const [key, value] of Object.entries(goalMap)) {
    if (goal.includes(key)) return value;
  }
  return null;
}

// ============================================
// 知识图谱查询
// ============================================
function queryKnowledgeGraph(job, goal) {
  if (!KNOWLEDGE_GRAPH.nodes[job]) return null;
  const edges = KNOWLEDGE_GRAPH.edges[job] || [];
  if (edges.includes(goal)) {
    return { source: 'knowledge_graph', path: [job, goal], skills: KNOWLEDGE_GRAPH.skills[goal] || [], milestone: KNOWLEDGE_GRAPH.milestones[goal] || '' };
  }
  for (const mid of edges) {
    const midEdges = KNOWLEDGE_GRAPH.edges[mid] || [];
    if (midEdges.includes(goal)) {
      return { source: 'knowledge_graph', path: [job, mid, goal], skills: KNOWLEDGE_GRAPH.skills[mid] || [], milestone: KNOWLEDGE_GRAPH.milestones[mid] || '' };
    }
  }
  return null;
}

// ============================================
// 协同过滤查询
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
    return { source: 'collaborative_filter', path: bestPath, confidence: maxCount / entries.length };
  }
  return null;
}

// ============================================
// 马尔可夫链
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
    if (prob > maxProb) { maxProb = prob; nextState = state; }
  }
  return { nextState, probability: maxProb };
}

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
  if (JOB_CATEGORY_MAP[job]) return JOB_CATEGORY_MAP[job];
  for (const [key, value] of Object.entries(JOB_CATEGORY_MAP)) {
    if (job.includes(key) || key.includes(job)) return value;
  }
  if (job.includes('安全') || job.includes('网络')) return 'technology';
  if (job.includes('学生')) return 'student';
  if (job.includes('教师') || job.includes('老师')) return 'education';
  if (job.includes('产品')) return 'product';
  if (job.includes('医生') || job.includes('护士')) return 'medical';
  if (job.includes('金融') || job.includes('会计')) return 'finance';
  if (job.includes('管理') || job.includes('运营')) return 'management';
  if (job.includes('店') || job.includes('餐饮') || job.includes('奶茶') || job.includes('咖啡')) return 'management';
  return 'other';
}

// ============================================
// 获取技能
// ============================================
function getSkills(category, year, interest) {
  const yearSkills = SKILLS[category]?.[year] || SKILLS.other?.[year] || SKILLS.other[1];
  let extraSkills = [];
  for (const [key, value] of Object.entries(INTEREST_SKILLS)) {
    if (interest && interest.includes(key)) { extraSkills = value; break; }
  }
  const combined = [...yearSkills, ...extraSkills].slice(0, 5);
  return filterValidSkills(combined);
}

// ============================================
// 获取标题
// ============================================
function getTitle(category, year, style) {
  const titles = TITLES[category] || TITLES.other;
  let title;
  if (year <= 5) {
    title = titles[year - 1] || `第${year}年`;
  } else {
    const extendedTitles = {
      'student': ['职业发展', '专业深化', '行业影响', '管理进阶', '成为领袖'],
      'education': ['教育创新', '学术引领', '教育改革', '教育管理', '教育领袖'],
      'technology': ['技术战略', '架构演进', '技术创新', '技术管理', '技术领袖'],
      'product': ['产品创新', '生态构建', '产品战略', '组织管理', '行业领袖'],
      'medical': ['专科深化', '科研突破', '医疗创新', '学科建设', '医学领袖'],
      'finance': ['投资策略', '资产管理', '金融创新', '团队管理', '金融领袖'],
      'management': ['战略管理', '组织变革', '管理创新', '高层管理', '行业领袖'],
      'other': ['专业深化', '跨界拓展', '创新突破', '管理进阶', '行业领袖']
    };
    const extTitles = extendedTitles[category] || extendedTitles.other;
    title = extTitles[year - 6] || `第${year}年`;
  }
  return (STYLE_PREFIX[style] || '') + title;
}

// ============================================
// 获取里程碑
// ============================================
function getMilestone(category, year) {
  const milestones = MILESTONES[category] || MILESTONES.other;
  if (year <= 5) {
    return milestones[year - 1] || `第${year}年里程碑`;
  } else {
    const extendedMilestones = {
      'student': ['获得晋升', '成为骨干', '建立影响力', '晋升管理层', '成为行业领袖'],
      'education': ['完成教改项目', '发表核心论文', '主持课题', '晋升管理岗', '成为教育专家'],
      'technology': ['主导技术项目', '完成架构升级', '技术创新突破', '晋升技术管理', '成为技术领袖'],
      'product': ['完成产品迭代', '构建产品生态', '制定产品战略', '晋升管理岗', '成为行业领袖'],
      'medical': ['完成专科进修', '发表SCI论文', '开展新技术', '晋升科室主任', '成为学科带头人'],
      'finance': ['完成投资组合', '建立分析体系', '创新金融产品', '晋升团队管理', '成为金融专家'],
      'management': ['完成战略规划', '推动组织变革', '创新管理模式', '晋升高层管理', '成为行业领袖'],
      'other': ['完成专业认证', '拓展业务领域', '创新突破', '晋升管理岗', '成为行业专家']
    };
    const extMilestones = extendedMilestones[category] || extendedMilestones.other;
    return extMilestones[year - 6] || `第${year}年里程碑`;
  }
}

// ============================================
// 雷达图数据
// ============================================
function getRadarData(category, years, skillsCount, style) {
  const base = RADAR_BASE[category] || RADAR_BASE.other;
  const workYears = parseInt(years) || 0;
  if (workYears === 0) {
    return {
      skill: Math.min(40, Math.round(base.skill * 0.5)),
      experience: 0,
      learning: Math.min(90, base.learning + 10),
      adaptability: Math.min(80, base.adaptability + 5),
      leadership: 0
    };
  }
  const experienceBonus = Math.min(15, workYears * 2);
  const skillBonus = Math.min(10, skillsCount);
  const leadershipBonus = Math.min(20, workYears * 2);
  const styleBonus = {
    '跨界融合': { adaptability: 10 },
    '理想主义': { learning: 10 },
    '均衡发展': { leadership: 5 },
    '稳妥晋升': { experience: 5 }
  };
  const bonus = styleBonus[style] || {};
  return {
    skill: Math.min(100, base.skill + skillBonus + (bonus.experience || 0)),
    experience: Math.min(100, base.experience + experienceBonus + (bonus.experience || 0)),
    learning: Math.min(100, base.learning + (bonus.learning || 0) - Math.min(5, workYears)),
    adaptability: Math.min(100, base.adaptability + (bonus.adaptability || 0)),
    leadership: Math.min(100, base.leadership + leadershipBonus + (bonus.leadership || 0))
  };
}

function getChallenge(category, job, skillsCount, years) {
  let text = CHALLENGES[category] || CHALLENGES.other;
  const workYears = parseInt(years) || 0;
  if (workYears === 0) {
    text = `作为职场新人，需要快速学习和积累经验。${text}`;
  } else if (category === 'student') {
    text = `从"${job || '学生'}"到"职场人"的转变是最大挑战，需要在理论学习与实践应用之间找到平衡`;
  } else {
    text = `作为${job || '职场人'}，` + text;
  }
  if (skillsCount > 8) text += '，已有较强技能基础，可向更高层次突破';
  else if (skillsCount < 4) text += '，需要先夯实基础技能，再寻求突破';
  return text;
}

function getBadges(category, style, interest, years) {
  const baseBadges = BADGES[category] || BADGES.other;
  const workYears = parseInt(years) || 0;
  if (workYears === 0) return ['🌟 初入职场', '🚀 快速成长', '💪 潜力无限'];
  let extraBadges = [];
  for (const [key, value] of Object.entries(INTEREST_BADGES)) {
    if (interest && interest.includes(key)) { extraBadges = value; break; }
  }
  const styleBadge = {
    '跨界融合': '🌉 跨界先锋',
    '理想主义': '✨ 理想主义者',
    '均衡发展': '⚖️ 均衡大师',
    '稳妥晋升': '🌱 稳扎稳打'
  };
  return [...baseBadges.slice(0, 2), ...extraBadges, styleBadge[style] || '🏆 成长之星'].slice(0, 3);
}

// ============================================
// 从路径构建树
// ============================================
function buildTreeFromPath(pathResult, userInput) {
  const { job, years, targetYears, interest, goal, style, skills: userSkills } = userInput;
  const path = pathResult.path;
  const maxYears = Math.min(parseInt(targetYears) || 5, 10);
  const workYears = parseInt(years) || 0;
  const category = getCategory(job);
  const interestText = getInterestText(interest);
  const goalContent = getGoalContent(goal);
  
  const branches = [];
  for (let i = 0; i < Math.min(maxYears, path.length); i++) {
    const node = path[i];
    const title = i === 0 ? job : node;
    const prefix = STYLE_PREFIX[style] || '';
    const isLastYear = i === Math.min(maxYears, path.length) - 1;
    const finalTitle = isLastYear && goalContent ? goalContent.finalTitle : title;
    const finalMilestone = isLastYear && goalContent ? goalContent.finalMilestone : (KNOWLEDGE_GRAPH.milestones[node] || getMilestone(category, i + 1));
    const goalsText = isLastYear && goal && goal !== '无' && goal !== '暂无' ? `达成目标：${goal}` : (interestText ? `${title} · ${interestText}` : title);
    branches.push({
      year: i + 1,
      icon: EXTENDED_ICONS[i] || '📌',
      title: prefix + finalTitle,
      goals: goalsText,
      skills: KNOWLEDGE_GRAPH.skills[node] || getSkills(category, Math.min(i + 1, 5), interest),
      milestone: finalMilestone
    });
  }
  
  while (branches.length < maxYears) {
    const i = branches.length;
    const yearNum = i + 1;
    const title = getTitle(category, yearNum, style);
    const isLastYear = i === maxYears - 1;
    const finalTitle = isLastYear && goalContent ? goalContent.finalTitle : title;
    const finalMilestone = isLastYear && goalContent ? goalContent.finalMilestone : getMilestone(category, yearNum);
    const goalsText = isLastYear && goal && goal !== '无' && goal !== '暂无' ? `达成目标：${goal}` : (interestText ? `${title} · ${interestText}` : title);
    branches.push({
      year: yearNum,
      icon: EXTENDED_ICONS[i] || '📌',
      title: finalTitle,
      goals: goalsText,
      skills: getSkills(category, Math.min(yearNum, 5), interest),
      milestone: finalMilestone
    });
  }
  
  return {
    tree: { branches },
    recommendedSkills: ['AI应用', '数据分析', '项目管理', '沟通协作', '领导力'],
    radarData: getRadarData(category, workYears, userSkills.length, style),
    challenges: { icon: '⚡', text: getChallenge(category, job, userSkills.length, workYears) },
    badges: getBadges(category, style, interest, workYears),
    _source: pathResult.source || 'knowledge_graph'
  };
}

// ============================================
// 构建模板树
// ============================================
function buildTemplateTree(userInput) {
  const { job, years, targetYears, interest, goal, style, skills: userSkills } = userInput;
  const category = getCategory(job);
  const maxYears = Math.min(parseInt(targetYears) || 5, 10);
  const workYears = parseInt(years) || 0;
  const interestText = getInterestText(interest);
  const goalContent = getGoalContent(goal);
  
  const branches = [];
  for (let i = 1; i <= maxYears; i++) {
    const title = getTitle(category, i, style);
    const isLastYear = i === maxYears;
    const finalTitle = isLastYear && goalContent ? goalContent.finalTitle : title;
    const finalMilestone = isLastYear && goalContent ? goalContent.finalMilestone : getMilestone(category, i);
    const goalsText = isLastYear && goal && goal !== '无' && goal !== '暂无' ? `达成目标：${goal}` : (interestText ? `${title} · ${interestText}` : title);
    branches.push({
      year: i,
      icon: EXTENDED_ICONS[i - 1] || '📌',
      title: finalTitle,
      goals: goalsText,
      skills: getSkills(category, Math.min(i, 5), interest),
      milestone: finalMilestone
    });
  }
  
  const chain = buildMarkovChain(branches);
  const lastTitle = branches.length > 0 ? branches[branches.length - 1].title : '';
  const prediction = predictNextStep(chain, lastTitle);
  
  return {
    tree: { branches },
    recommendedSkills: ['AI应用', '数据分析', '项目管理', '沟通协作', '领导力'],
    radarData: getRadarData(category, workYears, userSkills.length, style),
    challenges: { icon: '⚡', text: getChallenge(category, job, userSkills.length, workYears) },
    badges: getBadges(category, style, interest, workYears),
    _source: 'template',
    _prediction: prediction
  };
}

// ============================================
// 主入口
// ============================================
function generateCareerTree(userInput) {
  const { job = '产品经理', goal = '' } = userInput;
  console.log('🔍 [生成树] job:', job, 'goal:', goal);
  
  const graphResult = queryKnowledgeGraph(job, goal);
  if (graphResult) {
    console.log('✅ 命中知识图谱:', graphResult.path.join('→'));
    return buildTreeFromPath(graphResult, userInput);
  }
  
  const cfResult = queryCollaborativeFilter(job, goal);
  if (cfResult && cfResult.confidence > 0.5) {
    console.log('✅ 命中协同过滤:', cfResult.path.join('→'), '置信度:', cfResult.confidence);
    return buildTreeFromPath(cfResult, userInput);
  }
  
  console.log('📋 使用模板数据');
  const templateData = buildTemplateTree(userInput);
  
  const key = `${job}_${goal}`;
  if (!userPathCache[key]) userPathCache[key] = [];
  userPathCache[key].push({ path: templateData.tree.branches.map(b => b.title), timestamp: Date.now() });
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
  monteCarloValidate,
  filterValidSkills
};
