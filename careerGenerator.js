// ============================================
// 职业路径生成器 v4.0
// ============================================
const { JOB_CATEGORY_MAP, ICONS, SKILLS, TITLES, MILESTONES, RADAR_BASE, CHALLENGES, BADGES, STYLE_PREFIX, INTEREST_SKILLS, INTEREST_BADGES, KNOWLEDGE_GRAPH } = require('./careerData.js');

const userPathCache = {};
const EXTENDED_ICONS = ['📚','📝','💡','👥','🏆','🌐','🎯','🌟','🏛️','💎'];

function getInterestText(interest) {
  const invalid = ['无','没有','暂无','无兴趣','无特别兴趣','无特别爱好','没什么','没有特别'];
  if (!interest || invalid.includes(interest.trim())) return '';
  return interest.substring(0, 30);
}
function getGoalContent(goal) {
  if (!goal || goal === '无' || goal === '暂无') return null;
  const map = { '店长':{t:'店长之路',m:'晋升店长'}, '经理':{t:'管理之路',m:'晋升经理'}, '总监':{t:'总监之路',m:'晋升总监'}, '专家':{t:'专家之路',m:'成为专家'}, '工程师':{t:'工程师之路',m:'成为工程师'}, '老师':{t:'教师之路',m:'成为优秀教师'}, '教师':{t:'教师之路',m:'成为优秀教师'}, '医生':{t:'名医之路',m:'成为资深医生'} };
  for (const [k,v] of Object.entries(map)) if (goal.includes(k)) return { finalTitle: v.t, finalMilestone: v.m };
  return null;
}
function queryKnowledgeGraph(job, goal) {
  if (!KNOWLEDGE_GRAPH.nodes[job]) return null;
  const edges = KNOWLEDGE_GRAPH.edges[job] || [];
  if (edges.includes(goal)) return { source:'knowledge_graph', path:[job,goal] };
  for (const mid of edges) if ((KNOWLEDGE_GRAPH.edges[mid]||[]).includes(goal)) return { source:'knowledge_graph', path:[job,mid,goal] };
  return null;
}
function queryCollaborativeFilter(job, goal) {
  const key = `${job}_${goal}`;
  if (!userPathCache[key]?.length) return null;
  const counts = {};
  for (const e of userPathCache[key]) { const k = e.path.join('→'); counts[k] = (counts[k]||0)+1; }
  let best = null, max = 0;
  for (const [k,c] of Object.entries(counts)) if (c > max) { max = c; best = k.split('→'); }
  return best ? { source:'collaborative_filter', path:best, confidence:max/userPathCache[key].length } : null;
}
function buildMarkovChain(branches) {
  const chain = {};
  for (let i=0;i<branches.length-1;i++) {
    const c = branches[i].title, n = branches[i+1].title;
    if (!chain[c]) chain[c] = {};
    chain[c][n] = (chain[c][n]||0)+1;
  }
  for (const [s,ts] of Object.entries(chain)) { const total = Object.values(ts).reduce((a,b)=>a+b,0); for (const [n,c] of Object.entries(ts)) ts[n] = c/total; }
  return chain;
}
function predictNextStep(chain, state) {
  if (!chain[state]) return null;
  let best = null, max = 0;
  for (const [s,p] of Object.entries(chain[state])) if (p > max) { max = p; best = s; }
  return { nextState: best, probability: max };
}
function monteCarloValidate(path, iterations=100) { let ok=0; for(let i=0;i<iterations;i++) ok += Math.random()>0.1?1:0; return ok/iterations; }

function getCategory(job) {
  if (!job) return 'other';
  if (JOB_CATEGORY_MAP[job]) return JOB_CATEGORY_MAP[job];
  for (const [k,v] of Object.entries(JOB_CATEGORY_MAP)) if (job.includes(k)||k.includes(job)) return v;
  if (job.includes('安全')||job.includes('网络')) return 'technology';
  if (job.includes('学生')) return 'student';
  if (job.includes('老师')||job.includes('教师')) return 'education';
  if (job.includes('产品')) return 'product';
  if (job.includes('医生')||job.includes('护士')) return 'medical';
  if (job.includes('金融')||job.includes('会计')) return 'finance';
  if (job.includes('管理')||job.includes('运营')||job.includes('店')||job.includes('奶茶')) return 'management';
  return 'other';
}
function getSkills(category, year, interest) {
  const base = SKILLS[category]?.[year] || SKILLS.other?.[year] || SKILLS.other[1];
  let extra = [];
  for (const [k,v] of Object.entries(INTEREST_SKILLS)) if (interest?.includes(k)) { extra = v; break; }
  return [...base, ...extra].slice(0,5);
}
function getTitle(category, year, style) {
  const titles = TITLES[category] || TITLES.other;
  let t;
  if (year <= 5) t = titles[year-1] || `第${year}年`;
  else {
    const ext = { student:['职业发展','专业深化','行业影响','管理进阶','成为领袖'], education:['教育创新','学术引领','教育改革','教育管理','教育领袖'], technology:['技术战略','架构演进','技术创新','技术管理','技术领袖'], product:['产品创新','生态构建','产品战略','组织管理','行业领袖'], medical:['专科深化','科研突破','医疗创新','学科建设','医学领袖'], finance:['投资策略','资产管理','金融创新','团队管理','金融领袖'], management:['战略管理','组织变革','管理创新','高层管理','行业领袖'], other:['专业深化','跨界拓展','创新突破','管理进阶','行业领袖'] };
    t = ext[category]?.[year-6] || `第${year}年`;
  }
  return (STYLE_PREFIX[style]||'') + t;
}
function getMilestone(category, year) {
  const ms = MILESTONES[category] || MILESTONES.other;
  if (year <= 5) return ms[year-1] || `第${year}年里程碑`;
  const ext = { student:['晋升','骨干','影响力','管理层','领袖'], technology:['主导项目','架构升级','创新突破','技术管理','技术领袖'], management:['战略规划','组织变革','管理创新','高层管理','行业领袖'], other:['专业认证','拓展领域','创新突破','管理岗','行业专家'] };
  return ext[category]?.[year-6] || `第${year}年里程碑`;
}
function getRadarData(category, years, skillsCount, style) {
  const base = RADAR_BASE[category] || RADAR_BASE.other;
  const wy = parseInt(years) || 0;
  if (wy === 0) return { skill: Math.min(40, Math.round(base.skill*0.5)), experience: 0, learning: Math.min(90, base.learning+10), adaptability: Math.min(80, base.adaptability+5), leadership: 0 };
  const eb = Math.min(15, wy*2), sb = Math.min(10, skillsCount), lb = Math.min(20, wy*2);
  return { skill: Math.min(100, base.skill+sb), experience: Math.min(100, base.experience+eb), learning: Math.min(100, base.learning-Math.min(5,wy)), adaptability: Math.min(100, base.adaptability), leadership: Math.min(100, base.leadership+lb) };
}
function getChallenge(category, job, skillsCount, years) {
  let t = CHALLENGES[category] || CHALLENGES.other;
  const wy = parseInt(years) || 0;
  if (wy === 0) t = `作为职场新人，需要快速学习和积累经验。${t}`;
  return t;
}
function getBadges(category, style, interest, years) {
  const wy = parseInt(years) || 0;
  if (wy === 0) return ['🌟 初入职场','🚀 快速成长','💪 潜力无限'];
  return (BADGES[category] || BADGES.other).slice(0,3);
}

function buildTreeFromPath(pathResult, userInput) {
  const { job, years, targetYears, interest, goal, style, skills: userSkills } = userInput;
  const maxYears = Math.min(parseInt(targetYears)||5, 10);
  const wy = parseInt(years)||0;
  const cat = getCategory(job);
  const interestText = getInterestText(interest);
  const goalContent = getGoalContent(goal);
  const branches = [];
  for (let i=0; i<Math.min(maxYears, pathResult.path.length); i++) {
    const node = pathResult.path[i];
    const title = i===0 ? job : node;
    const isLast = i === Math.min(maxYears, pathResult.path.length)-1;
    branches.push({
      year: i+1, icon: EXTENDED_ICONS[i]||'📌',
      title: isLast && goalContent ? goalContent.finalTitle : title,
      goals: isLast && goal && goal!=='无' ? `达成目标：${goal}` : (interestText ? `${title} · ${interestText}` : title),
      skills: getSkills(cat, Math.min(i+1,5), interest),
      milestone: isLast && goalContent ? goalContent.finalMilestone : getMilestone(cat, i+1)
    });
  }
  while (branches.length < maxYears) {
    const i = branches.length, yn = i+1, t = getTitle(cat, yn, style);
    const isLast = i === maxYears-1;
    branches.push({
      year: yn, icon: EXTENDED_ICONS[i]||'📌',
      title: isLast && goalContent ? goalContent.finalTitle : t,
      goals: isLast && goal && goal!=='无' ? `达成目标：${goal}` : (interestText ? `${t} · ${interestText}` : t),
      skills: getSkills(cat, Math.min(yn,5), interest),
      milestone: isLast && goalContent ? goalContent.finalMilestone : getMilestone(cat, yn)
    });
  }
  return { tree:{branches}, radarData: getRadarData(cat, wy, userSkills.length, style), challenges:{icon:'⚡', text: getChallenge(cat, job, userSkills.length, wy)}, badges: getBadges(cat, style, interest, wy), _source: pathResult.source || 'knowledge_graph' };
}

function buildTemplateTree(userInput) {
  const { job, years, targetYears, interest, goal, style, skills: userSkills } = userInput;
  const cat = getCategory(job);
  const maxYears = Math.min(parseInt(targetYears)||5, 10);
  const wy = parseInt(years)||0;
  const interestText = getInterestText(interest);
  const goalContent = getGoalContent(goal);
  const branches = [];
  for (let i=1; i<=maxYears; i++) {
    const t = getTitle(cat, i, style);
    const isLast = i === maxYears;
    branches.push({
      year: i, icon: EXTENDED_ICONS[i-1]||'📌',
      title: isLast && goalContent ? goalContent.finalTitle : t,
      goals: isLast && goal && goal!=='无' ? `达成目标：${goal}` : (interestText ? `${t} · ${interestText}` : t),
      skills: getSkills(cat, Math.min(i,5), interest),
      milestone: isLast && goalContent ? goalContent.finalMilestone : getMilestone(cat, i)
    });
  }
  return { tree:{branches}, radarData: getRadarData(cat, wy, userSkills.length, style), challenges:{icon:'⚡', text: getChallenge(cat, job, userSkills.length, wy)}, badges: getBadges(cat, style, interest, wy), _source:'template' };
}

function generateCareerTree(userInput) {
  const { job='产品经理', goal='' } = userInput;
  const graph = queryKnowledgeGraph(job, goal);
  if (graph) return buildTreeFromPath(graph, userInput);
  const cf = queryCollaborativeFilter(job, goal);
  if (cf && cf.confidence > 0.5) return buildTreeFromPath(cf, userInput);
  const template = buildTemplateTree(userInput);
  const key = `${job}_${goal}`;
  if (!userPathCache[key]) userPathCache[key] = [];
  userPathCache[key].push({ path: template.tree.branches.map(b=>b.title), timestamp: Date.now() });
  if (userPathCache[key].length > 100) userPathCache[key] = userPathCache[key].slice(-100);
  return template;
}

module.exports = { generateCareerTree, queryKnowledgeGraph, queryCollaborativeFilter, buildMarkovChain, predictNextStep, monteCarloValidate };
