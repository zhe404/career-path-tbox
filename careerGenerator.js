// ============================================
// 职业路径生成器（纯逻辑）
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
  INTEREST_BADGES
} = require('./careerData.js');

function getSkills(category, year, interest) {
  const yearSkills = SKILLS[category]?.[year] || SKILLS.other?.[year] || SKILLS.other[1];
  let extraSkills = [];
  for (const [key, value] of Object.entries(INTEREST_SKILLS)) {
    if (interest && interest.includes(key)) {
      extraSkills = value;
      break;
    }
  }
  const allSkills = [...yearSkills, ...extraSkills];
  return allSkills.slice(0, 5);
}

function getTitle(category, year, style) {
  const titles = TITLES[category] || TITLES.other;
  const title = titles[year - 1] || `第${year}年`;
  const prefix = STYLE_PREFIX[style] || '';
  return prefix + title;
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
  if (skillsCount > 8) {
    text += '，已有较强技能基础，可向更高层次突破';
  } else if (skillsCount < 4) {
    text += '，需要先夯实基础技能，再寻求突破';
  }
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
  const badges = [
    ...baseBadges.slice(0, 2),
    ...extraBadges,
    styleBadge[style] || '🏆 成长之星'
  ];
  return badges.slice(0, 3);
}

/**
 * 主入口：生成完整成长树
 */
function generateCareerTree(userInput) {
  const { 
    job = '产品经理', 
    years = 0, 
    targetYears = 5, 
    interest = '', 
    style = '稳妥晋升',
    skills: userSkills = [] 
  } = userInput;
  
  // ============================================================
  // 🔥 强制分类判断（直接根据 job 关键词）
  // ============================================================
  let category = 'other';
  
  // 1. 安全检查 - 最高优先级
  if (job.includes('安全') || job.includes('网络') || job.includes('渗透') || 
      job.includes('漏洞') || job.includes('防护') || job.includes('攻防') ||
      job.includes('信息安全') || job.includes('防火墙') || job.includes('入侵')) {
    category = 'technology';
  }
  // 2. 学生检查
  else if (job.includes('学生') || job.includes('大学生') || job.includes('研究生') || job.includes('本科生')) {
    category = 'student';
  }
  // 3. 教育检查
  else if (job.includes('教师') || job.includes('老师') || job.includes('教育') || job.includes('教学') || job.includes('教研')) {
    category = 'education';
  }
  // 4. 技术检查
  else if (job.includes('软件') || job.includes('开发') || job.includes('编程') || 
           job.includes('算法') || job.includes('架构') || job.includes('运维') || 
           job.includes('测试') || job.includes('工程师') || job.includes('技术')) {
    category = 'technology';
  }
  // 5. 产品检查
  else if (job.includes('产品') || job.includes('设计') || job.includes('UI') || job.includes('UX') || job.includes('交互')) {
    category = 'product';
  }
  // 6. 医疗检查
  else if (job.includes('医生') || job.includes('护士') || job.includes('医疗') || job.includes('临床') || job.includes('药学')) {
    category = 'medical';
  }
  // 7. 金融检查
  else if (job.includes('金融') || job.includes('会计') || job.includes('审计') || job.includes('财务') || job.includes('投资')) {
    category = 'finance';
  }
  // 8. 管理检查
  else if (job.includes('管理') || job.includes('运营') || job.includes('人力') || job.includes('市场') || job.includes('销售') || job.includes('品牌')) {
    category = 'management';
  }
  // 9. 默认
  else {
    category = 'other';
  }
  
  // 打印日志（Railway 上会显示）
  console.log('🔍 [生成树] job:', job, '→ category:', category);
  
  const maxYears = Math.min(targetYears, 5);
  
  // 生成分支
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
  
  return {
    tree: { branches },
    recommendedSkills: ['AI应用', '数据分析', '项目管理', '沟通协作', '领导力'],
    radarData: getRadarData(category, years, userSkills.length, style),
    challenges: { icon: '⚡', text: getChallenge(category, job, userSkills.length) },
    badges: getBadges(category, style, interest)
  };
}

module.exports = {
  generateCareerTree,
  getSkills,
  getTitle,
  getMilestone,
  getRadarData,
  getChallenge,
  getBadges
};