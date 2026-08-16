const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const { generateCareerTree } = require('./careerGenerator.js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const TBOX_CONFIG = {
  apiUrl: 'https://api.tbox.cn/api/chat',
  apiKey: process.env.TBOX_API_KEY || 'inc-ak1e56da43c93029e7f6f13a63fe5b0cadf0deff0351694f5e1998cb4f590cb005',
};

// ============================================
// 工具函数
// ============================================
function parseAIResponse(data) {
  if (!data || !data.data) return '';
  let reply = '';
  const result = data.data.result;
  if (Array.isArray(result)) {
    for (const item of result) {
      if (item.chunk) {
        if (item.mediaType === 'text') {
          reply += item.chunk;
        } else {
          try {
            const chunkData = JSON.parse(item.chunk);
            reply += chunkData.text || chunkData.content || '';
          } catch (e) {
            reply += item.chunk;
          }
        }
      }
    }
  }
  return reply;
}

// ============================================
// 检测是否为在校学生（修复版）
// ============================================
function isStudentJob(job) {
  if (!job) return false;
  
  // 先排除明显不是学生的职业身份
  const teacherKeywords = ['教师', '老师', '教授', '讲师', '导师', '辅导员', '班主任'];
  const doctorKeywords = ['医生', '医师', '护士', '医护', '大夫'];
  const staffKeywords = ['教务', '行政', '管理', '职员', '员工', '助理'];
  
  const allStaffKeywords = [...teacherKeywords, ...doctorKeywords, ...staffKeywords];
  for (const keyword of allStaffKeywords) {
    if (job.includes(keyword)) {
      return false;
    }
  }
  
  // 只有明确的学生身份才返回 true
  const studentKeywords = [
    '学生', '初中生', '初中', '高中生', '高中', 
    '大学生', '研究生', '硕士', '博士', '应届',
    '中学生', '本科生', '专科生', '大专生',
    '职高', '中专', '技校'
  ];
  
  return studentKeywords.some(keyword => job.includes(keyword));
}

// ============================================
// 检测是否跨行业转型（新增）
// ============================================
function detectCrossIndustry(job, goal) {
  if (!job || !goal) return false;
  
  const industryMap = {
    '教育': ['教师', '老师', '教授', '讲师', '导师', '辅导员', '班主任', '教务', '教育', '高校', '中学', '小学'],
    '医疗': ['医生', '医师', '护士', '医护', '大夫', '临床', '医学', '医院', '护理', '药学', '检验'],
    'IT': ['程序员', '工程师', '开发', '前端', '后端', '算法', '数据', 'AI', '人工智能', '机器学习', '深度学习', '网络安全', '渗透测试', '运维', '产品经理', '运营', '测试', '架构', '云计算', '大数据', '物联网', '区块链'],
    '设计': ['设计师', 'UI', 'UX', '视觉', '交互', '平面', '产品设计', '动画', '游戏设计'],
    '管理': ['经理', '总监', '主管', '管理', '行政', '人力资源', 'HR', 'CEO', 'CTO', 'COO', '校长', '院长'],
    '法律': ['律师', '法务', '法律', '诉讼', '司法', '检察官', '法官'],
    '金融': ['金融', '银行', '证券', '投资', '保险', '基金', '理财', '风控', '审计', '会计', '财务'],
    '餐饮': ['厨师', '店长', '餐饮', '奶茶', '咖啡', '烘焙', '餐厅', '酒店'],
    '建筑': ['建筑师', '工程师', '施工', '设计', '结构', '土木', '室内设计', '园林'],
    '媒体': ['记者', '编辑', '编导', '传媒', '新闻', '出版', '广告', '公关', '文案', '策划'],
    '销售': ['销售', '市场', '商务', 'BD', '客户经理', '销售代表', '渠道']
  };
  
  function getIndustry(text) {
    if (!text) return null;
    for (const [industry, keywords] of Object.entries(industryMap)) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          return industry;
        }
      }
    }
    return null;
  }
  
  const jobIndustry = getIndustry(job);
  const goalIndustry = getIndustry(goal);
  
  if (jobIndustry && goalIndustry && jobIndustry !== goalIndustry) {
    return true;
  }
  
  const transitionKeywords = ['转行', '转型', '转岗', '跨行', '跨界', '换行'];
  if (transitionKeywords.some(kw => goal.includes(kw))) {
    if (goalIndustry) return true;
  }
  
  return false;
}

// AI调用带重试
async function callAIWithRetry(query, maxRetries = 3, timeout = 90000) {
  let lastError = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`📡 AI调用 (尝试 ${i+1}/${maxRetries})...`);
      const requestData = { 
        appId: '202607APmEQJ20464969', 
        query, 
        userId: 'user_' + Date.now(), 
        stream: false 
      };
      const response = await axios.post(TBOX_CONFIG.apiUrl, requestData, {
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': TBOX_CONFIG.apiKey 
        },
        timeout: timeout,
      });
      const reply = parseAIResponse(response.data);
      if (reply && reply.length > 10) {
        console.log(`✅ AI调用成功 (尝试 ${i+1})`);
        return reply;
      }
      throw new Error('AI返回内容过短');
    } catch (error) {
      lastError = error;
      console.log(`⚠️ AI调用失败 (尝试 ${i+1}): ${error.message}`);
      if (i < maxRetries - 1) {
        const delay = 2000 * Math.pow(2, i);
        console.log(`⏳ 等待 ${delay}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw new Error(`AI调用失败 ${maxRetries} 次: ${lastError?.message || '未知错误'}`);
}

// ============================================
// 本地生成树（增强版 - 支持学生检测）
// ============================================
function generateLocalTreeEnhanced(userInput) {
  const targetYears = parseInt(userInput.targetYears) || 5;
  const workYears = parseInt(userInput.years) || 0;
  const job = userInput.job || '';
  const isStudent = isStudentJob(job);
  
  const icons = ['📚','📝','💡','👥','🏆','🌐','🎯','🌟','🏛️','💎'];
  const milestones = [
    '建立基础能力',
    '独立承担项目', 
    '成为团队骨干',
    '带领小团队',
    '独当一面',
    '拓展影响力',
    '行业专家',
    '战略视野',
    '引领创新',
    '成就卓越'
  ];
  const goals = [
    '掌握核心技能，适应职场节奏',
    '深化专业能力，建立个人品牌',
    '拓展人脉资源，提升影响力',
    '培养管理能力，开始带团队',
    '成为领域专家，输出方法论',
    '跨界学习，拓宽职业边界',
    '建立行业影响力',
    '战略思维与全局观',
    '引领行业创新',
    '实现职业理想'
  ];
  
  const branches = [];
  for (let i = 1; i <= targetYears; i++) {
    const idx = Math.min(i - 1, goals.length - 1);
    branches.push({
      year: i,
      icon: icons[idx % icons.length],
      title: `第${i}年 · ${job || '职业成长'}`,
      goals: goals[idx] || '持续成长',
      skills: ['专业技能', '沟通协作', '持续学习'].slice(0, Math.min(3, i)),
      milestone: milestones[idx] || `第${i}年里程碑`
    });
  }
  
  let radarData;
  if (isStudent) {
    radarData = {
      skill: 30,
      experience: 0,
      learning: 85,
      adaptability: 60,
      leadership: 5
    };
    console.log('🎓 学生模式：生成学生专属雷达图');
  } else if (workYears === 0) {
    radarData = {
      skill: 25,
      experience: 5,
      learning: 85,
      adaptability: 65,
      leadership: 3
    };
  } else if (workYears <= 2) {
    radarData = {
      skill: 40,
      experience: 25,
      learning: 80,
      adaptability: 65,
      leadership: 15
    };
  } else if (workYears <= 5) {
    radarData = {
      skill: 60,
      experience: 50,
      learning: 80,
      adaptability: 70,
      leadership: 35
    };
  } else {
    radarData = {
      skill: 75,
      experience: 75,
      learning: 80,
      adaptability: 70,
      leadership: 50
    };
  }
  
  return {
    tree: { branches },
    radarData: radarData,
    challenges: isStudent ? { 
      icon: '📚', 
      text: '从校园到职场是重要转折，需要将理论知识转化为实践能力，同时建立职业规划意识' 
    } : { 
      icon: '⚡', 
      text: '持续学习，把握机遇，在变化中成长' 
    },
    badges: isStudent ? ['🎓 在校学生', '📚 学习成长', '💪 潜力无限'] : 
            (workYears === 0 ? ['🎓 应届生', '🚀 潜力新星', '💪 快速成长'] : 
            ['🎯 目标清晰', '📈 持续成长', '💪 潜力无限', '🌟 未来可期']),
    _isTemplate: false,
    _status: '📋 本地生成',
    _source: 'local'
  };
}

// ============================================
// getFallbackSkills（修复版 - 支持跨行业）
// ============================================
function getFallbackSkills(job, education, goal, interest, style) {
  const isCrossIndustry = detectCrossIndustry(job, goal);
  const primaryJob = isCrossIndustry ? goal : job;
  
  const baseMap = {
    '学生': ['学习方法', '时间管理', '专业知识', '学术写作', '沟通表达', '研究能力', '团队协作', '持续学习'],
    '初中': ['学习方法', '时间管理', '基础知识', '阅读能力', '写作能力', '数学思维', '英语基础', '科学素养'],
    '高中': ['学习方法', '时间管理', '学科知识', '考试技巧', '自主学习', '研究能力', '团队协作', '持续学习'],
    '大学生': ['专业知识', '学术写作', '研究方法', '沟通表达', '团队协作', '时间管理', '职业规划', '持续学习'],
    '研究生': ['学术研究', '论文写作', '实验设计', '数据分析', '文献综述', '学术表达', '批判性思维', '持续学习'],
    '教师': ['教学设计', '课堂管理', '教育心理学', '学科知识', '沟通表达', '评估反馈', '教育技术', '学生指导'],
    '老师': ['教学设计', '课堂管理', '教育心理学', '学科知识', '沟通表达', '评估反馈', '教育技术', '学生指导'],
    '教授': ['学术研究', '教学指导', '科研管理', '学术写作', '学术交流', '团队领导', '教育创新', '学科建设'],
    '讲师': ['教学设计', '课堂管理', '学科知识', '学术研究', '沟通表达', '教育技术', '学生指导', '持续学习'],
    '辅导员': ['学生管理', '心理咨询', '生涯规划', '沟通表达', '活动组织', '危机干预', '家校沟通', '思政教育'],
    '网络安全': ['网络协议', '渗透测试', '安全防护', '漏洞挖掘', '应急响应', '日志分析', '安全策略', '系统安全'],
    '渗透测试': ['渗透测试', '漏洞挖掘', '安全工具', '代码审计', '网络协议', '社会工程', '报告撰写', '持续学习'],
    '程序员': ['编程语言', '算法', '数据结构', '系统设计', '调试测试', '代码审查', '数据库', '版本控制'],
    '前端': ['HTML/CSS', 'JavaScript', '框架', '性能优化', '响应式', '浏览器原理', '工程化', 'Web安全'],
    '后端': ['编程语言', '数据库', 'API设计', '系统架构', '性能优化', '微服务', '缓存', '消息队列'],
    '算法': ['数据结构', '算法设计', '数学基础', '机器学习', '深度学习', '数据分析', '代码实现', '论文阅读'],
    'AI': ['机器学习', '深度学习', 'Python', '数据分析', '算法设计', '模型优化', '工程部署', '论文阅读'],
    '数据分析': ['数据清洗', '统计分析', 'SQL', 'Python/R', '数据可视化', '业务分析', '数据建模', '报告撰写'],
    '运维': ['Linux', '网络管理', '自动化', '监控告警', '容器技术', '故障排查', '安全加固', '性能优化'],
    '产品经理': ['用户研究', '产品设计', '数据分析', '项目管理', '商业分析', '沟通协作', '需求分析', '竞品分析'],
    '运营': ['用户运营', '数据分析', '增长策略', '内容策划', '项目管理', '沟通协作', '活动策划', '市场洞察'],
    '测试': ['测试设计', '自动化测试', '性能测试', '安全测试', '缺陷管理', 'CI/CD', '质量意识', '沟通协作'],
    '设计师': ['UI设计', 'UX研究', '设计工具', '设计思维', '用户测试', '创意表达', '视觉传达', '交互设计'],
    'UI设计': ['UI设计', '视觉设计', '设计工具', '设计规范', '用户研究', '原型制作', '设计系统', '沟通协作'],
    'UX设计': ['用户研究', '交互设计', '可用性测试', '原型设计', '数据分析', '设计思维', '沟通表达', '持续学习'],
    '医生': ['临床诊断', '医疗技术', '医患沟通', '循证医学', '医疗管理', '团队协作', '持续学习', '病例分析'],
    '护士': ['护理技术', '患者关怀', '医疗记录', '急救技能', '沟通协作', '健康宣教', '药物管理', '病情观察'],
    '医师': ['临床诊断', '医疗技术', '医患沟通', '循证医学', '医疗管理', '团队协作', '持续学习', '病例分析'],
    '经理': ['团队管理', '目标管理', '决策能力', '沟通协作', '项目管理', '绩效评估', '人才发展', '战略思维'],
    '总监': ['战略规划', '组织管理', '领导力', '决策能力', '资源管理', '团队建设', '行业洞察', '商业思维'],
    '管理': ['团队管理', '沟通协作', '目标管理', '项目管理', '决策能力', '绩效管理', '人才发展', '组织能力'],
    '律师': ['法律研究', '法律写作', '诉讼技巧', '谈判能力', '客户沟通', '法律伦理', '案例分析', '法律检索'],
    '金融': ['财务分析', '风险管理', '投资分析', '数据分析', '金融产品', '合规管理', '市场洞察', '沟通表达'],
    '会计': ['会计核算', '财务报表', '税务知识', '审计技能', '财务软件', '合规意识', '数据分析', '沟通协作'],
    '销售': ['客户开发', '沟通技巧', '谈判能力', '销售策略', '客户关系', '市场分析', '产品知识', '目标管理'],
    '市场': ['市场分析', '营销策划', '品牌管理', '数字营销', '数据洞察', '内容创作', '项目管理', '沟通表达'],
    '奶茶店': ['团队管理', '门店运营', '排班调度', '营销推广', '客户服务', '库存管理', '成本核算', '培训带教'],
    '餐饮': ['门店管理', '成本控制', '服务管理', '营销推广', '团队建设', '食品安全', '供应链管理', '客户满意'],
    '厨师': ['烹饪技术', '食材知识', '菜品创新', '厨房管理', '食品安全', '成本控制', '团队协作', '时间管理'],
    '记者': ['新闻采编', '采访技巧', '写作能力', '媒体素养', '沟通表达', '调查研究', '剪辑制作', '持续学习'],
    '编辑': ['内容策划', '审稿能力', '写作能力', '选题策划', '团队管理', '行业洞察', '沟通表达', '质量控制'],
    '建筑师': ['建筑设计', '结构知识', '材料应用', '空间规划', '制图表达', '项目管理', '沟通协作', '审美能力'],
    '应届': ['专业技能', '沟通表达', '团队协作', '持续学习', '职业素养', '问题解决', '时间管理', '适应能力'],
  };
  
  let baseSkills = ['专业技能', '沟通协作', '问题解决', '持续学习', '团队合作'];
  for (const [key, value] of Object.entries(baseMap)) {
    if (primaryJob && primaryJob.includes(key)) {
      baseSkills = value;
      break;
    }
  }
  
  let goalSkills = [];
  if (goal) {
    if (goal.includes('管理') || goal.includes('经理') || goal.includes('总监') || goal.includes('店长') || goal.includes('校长') || goal.includes('院长')) {
      goalSkills = ['团队管理', '战略规划', '决策能力', '领导力'];
    }
    if (goal.includes('专家') || goal.includes('工程师') || goal.includes('技师')) {
      goalSkills = ['深度研究', '技术创新', '专业认证', '行业洞察'];
    }
    if (goal.includes('创业') || goal.includes('创始人') || goal.includes('老板')) {
      goalSkills = ['商业思维', '创业管理', '财务基础', '市场营销', '团队建设'];
    }
    if (goal.includes('教师') || goal.includes('老师') || goal.includes('教授') || goal.includes('讲师')) {
      goalSkills = ['教学能力', '课程开发', '学术研究', '教育技术'];
    }
    if (goal.includes('安全') || goal.includes('渗透') || goal.includes('防护')) {
      goalSkills = ['网络安全', '渗透测试', '安全防护', '漏洞分析'];
    }
    if (goal.includes('AI') || goal.includes('人工智能') || goal.includes('机器学习')) {
      goalSkills = ['机器学习', '深度学习', 'Python', '数据分析'];
    }
  }
  
  let interestSkills = [];
  if (interest && interest !== '无' && interest !== '没有') {
    if (interest.includes('AI') || interest.includes('数据') || interest.includes('人工智能') || interest.includes('机器学习')) {
      interestSkills = ['数据分析', 'AI应用', '机器学习', 'Python'];
    }
    if (interest.includes('管理') || interest.includes('领导') || interest.includes('团队')) {
      interestSkills = ['团队管理', '领导力', '组织发展'];
    }
    if (interest.includes('安全') || interest.includes('网络') || interest.includes('渗透')) {
      interestSkills = ['网络安全', '渗透测试', '安全防护'];
    }
    if (interest.includes('设计') || interest.includes('创意') || interest.includes('艺术')) {
      interestSkills = ['设计思维', '创意表达', '视觉传达'];
    }
    if (interest.includes('金融') || interest.includes('投资') || interest.includes('财务')) {
      interestSkills = ['财务分析', '投资理财', '风险管理'];
    }
    if (interest.includes('教育') || interest.includes('教学')) {
      interestSkills = ['教学设计', '教育心理学', '课程开发'];
    }
    if (interest.includes('创业') || interest.includes('商业')) {
      interestSkills = ['商业思维', '创业管理', '市场营销'];
    }
  }
  
  let transitionSkills = [];
  if (isCrossIndustry) {
    transitionSkills = ['行业认知', '知识迁移', '跨界学习', '目标行业基础'];
    console.log(`🔄 跨行业转型，补充过渡技能: ${transitionSkills.join(', ')}`);
  }
  
  const allSkills = [...baseSkills, ...goalSkills, ...interestSkills, ...transitionSkills];
  const uniqueSkills = [...new Set(allSkills)];
  
  return uniqueSkills.slice(0, 12);
}

// ============================================
// 缓存管理
// ============================================
const treeCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of treeCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      treeCache.delete(key);
      console.log(`🧹 清理过期缓存: ${key}`);
    }
  }
}, 60 * 1000);

// ============================================
// 接口1: 快速咨询
// ============================================
app.post('/api/consult-ai-fast', async (req, res) => {
  try {
    const { message } = req.body;
    console.log('⚡ 快速咨询');
    const query = message.length > 500 ? message.substring(0, 500) : message;
    const reply = await callAIWithRetry(query, 2, 30000);
    res.json({ success: true, reply });
  } catch (error) {
    console.error('❌ 快速咨询失败:', error.message);
    res.json({ success: false, error: 'AI服务响应超时，请稍后重试' });
  }
});

// ============================================
// 接口2: 技能推荐（支持跨行业转型）
// ============================================
app.post('/api/recommend-skills', async (req, res) => {
  try {
    const { job, education, goal, interest, style, gender, age } = req.body;
    console.log('🎯 技能推荐:', job);
    console.log('📌 目标:', goal);
    
    const styleDesc = {
      'default': '稳扎稳打',
      'cross': '跨界融合',
      'ideal': '理想主义',
      'balanced': '均衡发展'
    };
    
    const isCrossIndustry = detectCrossIndustry(job, goal);
    if (isCrossIndustry) {
      console.log(`🔄 检测到跨行业转型: ${job} → ${goal}`);
    }
    
    let transitionGuidance = '';
    if (isCrossIndustry) {
      transitionGuidance = `\n⚠️ 重要：用户想从"${job || '当前职业'}"转型到"${goal || '目标职业'}"，这是跨行业转型。请以"${goal}"为核心推荐技能，同时补充2-3个转型过渡技能（如行业认知、知识迁移、跨界学习等）。`;
    } else {
      transitionGuidance = `\n用户想在"${job || '当前职业'}"深耕发展，请以"${job}"为核心推荐进阶技能。`;
    }
    
    const prompt = `请直接输出8-12个技能名称，用逗号分隔。不要任何解释、不要复述、不要前缀。

用户信息：
- 当前职业：${job || '未填写'}
- 教育背景：${education || '未填写'}
- 职业目标：${goal || '未填写'}
- 兴趣方向：${interest || '未填写'}
- 发展风格：${styleDesc[style] || '均衡发展'}
${transitionGuidance}

直接输出技能：`;
    
    const reply = await callAIWithRetry(prompt, 2, 45000);
    
    let skills = [];
    if (reply) {
      const invalidWords = [
        '我直接','为你','分析','不需要','创建','计划','目标','风格',
        '稳扎稳打','项核心','技能：','**','根据','结合','搜索','用户',
        '推荐','以下','如下','建议','结果','信息','核心','相关',
        '适合','需要','可以','应该','包括','以上','这些','那些',
        '其中','比如','例如','以及','或者','技能','能力','方面',
        '领域','知识','经验','直接','返回','名称','列表','输出',
        '格式','请','只','不','要','的','了','是','和','与',
        '或','等','为','在','有','你','我','直接输出','直接',
        '未填写'
      ];
      
      const parts = reply.split(/[,，、\s\n\r\t]+/);
      for (const part of parts) {
        let trimmed = part.trim()
          .replace(/^["'""''【】\[\]()（）]+|["'""''【】\[\]()（）]+$/g, '')
          .replace(/^\*+|\*+$/g, '')
          .replace(/^\d+[.、\)]\s*/, '');
        if (trimmed.length < 2 || trimmed.length > 12) continue;
        if (/^[0-9]+$/.test(trimmed)) continue;
        if (invalidWords.some(w => trimmed.includes(w))) continue;
        skills.push(trimmed);
      }
      skills = [...new Set(skills)].slice(0, 12);
    }
    
    if (skills.length < 4) {
      skills = getFallbackSkills(job, education, goal, interest, style);
    }
    
    console.log('✅ 推荐技能:', skills);
    res.json({ 
      success: true, 
      skills: skills,
      isCrossIndustry: isCrossIndustry || false
    });
  } catch (error) {
    console.error('❌ 技能推荐失败:', error.message);
    const fallback = getFallbackSkills(req.body.job, req.body.education, req.body.goal, req.body.interest, req.body.style);
    res.json({ success: true, skills: fallback, fallback: true });
  }
});

// ============================================
// 接口3: 生成成长树
// ============================================
app.post('/api/generate-tree', async (req, res) => {
  try {
    const userInput = req.body;
    console.log('🌳 生成成长树:', userInput.job);
    console.log(`📊 用户工作年限: ${userInput.years || 0}年`);
    
    const isStudent = isStudentJob(userInput.job || '');
    if (isStudent) {
      console.log('🎓 检测到在校学生，启用学生模式');
    }
    
    const sessionId = 'tree_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    
    const templateData = generateLocalTreeEnhanced(userInput);
    templateData._sessionId = sessionId;
    templateData._status = '⏳ AI优化中...';
    templateData._isTemplate = true;
    
    treeCache.set(sessionId, {
      data: templateData,
      userInput: userInput,
      optimized: false,
      timestamp: Date.now(),
      retryCount: 0
    });
    
    res.json({ 
      success: true, 
      data: templateData, 
      sessionId, 
      template: true,
      message: '初始版本已生成，AI正在后台优化...'
    });
    
    setTimeout(() => optimizeInBackground(sessionId), 500);
    
  } catch (error) {
    console.error('❌ 生成失败:', error.message);
    const fallback = generateLocalTreeEnhanced(req.body);
    res.json({ success: true, data: fallback, fallback: true });
  }
});

// ============================================
// 后台优化函数
// ============================================
async function optimizeInBackground(sessionId, retryCount = 0) {
  const cached = treeCache.get(sessionId);
  if (!cached) {
    console.log(`⚠️ 缓存不存在: ${sessionId}`);
    return;
  }
  
  const maxRetries = 3;
  if (retryCount >= maxRetries) {
    console.log(`❌ 优化失败，使用本地版本: ${sessionId}`);
    const localData = generateLocalTreeEnhanced(cached.userInput);
    localData._status = '📋 本地优化版';
    localData._isTemplate = false;
    treeCache.set(sessionId, {
      ...cached,
      data: localData,
      optimized: true,
      timestamp: Date.now()
    });
    return;
  }
  
  try {
    const { userInput } = cached;
    const targetYears = parseInt(userInput.targetYears) || 5;
    const workYears = parseInt(userInput.years) || 0;
    const job = userInput.job || '';
    const isStudent = isStudentJob(job);
    
    console.log(`🔄 AI优化 (尝试 ${retryCount + 1}/${maxRetries})...`);
    console.log(`📊 用户工作年限: ${workYears}年`);
    if (isStudent) {
      console.log('🎓 学生模式：AI优化将使用学生专属配置');
    }
    
    const prompt = `职业:${job},工作${workYears}年,性别:${userInput.gender||''},年龄:${userInput.age||''}岁,目标:${userInput.goal},兴趣:${userInput.interest},技能:${(userInput.skills||[]).join(',')}。生成${targetYears}年职业路径JSON:{"branches":[{"year":年份,"icon":"图标","title":"标题","goals":"目标","skills":["技能"],"milestone":"里程碑"}],"radarData":{"skill":数值,"experience":数值,"learning":数值,"adaptability":数值,"leadership":数值},"challenges":{"icon":"图标","text":"挑战描述"},"badges":["徽章1","徽章2"]}只返回JSON，不要任何解释。`;
    
    const reply = await callAIWithRetry(prompt, 2, 90000);
    
    if (reply) {
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        if (result.branches && result.branches.length > 0) {
          let branches = result.branches;
          const icons = ['📚','📝','💡','👥','🏆','🌐','🎯','🌟','🏛️','💎'];
          while (branches.length < targetYears) {
            const i = branches.length;
            branches.push({
              year: i + 1,
              icon: icons[i % icons.length] || '📌',
              title: `第${i+1}年 · 持续成长`,
              goals: '积累经验，提升能力',
              skills: ['专业技能', '沟通协作'],
              milestone: `第${i+1}年里程碑`
            });
          }
          if (branches.length > targetYears) branches = branches.slice(0, targetYears);
          
          let radarData = {};
          
          if (isStudent) {
            radarData = {
              skill: 30,
              experience: 0,
              learning: 85,
              adaptability: 60,
              leadership: 5
            };
            console.log('🎓 后端学生模式：强制设置雷达图 (经验=0)');
          } else if (workYears === 0) {
            radarData = {
              skill: Math.min(35, result.radarData?.skill || 25),
              experience: Math.min(10, result.radarData?.experience || 5),
              learning: Math.min(95, Math.max(70, result.radarData?.learning || 85)),
              adaptability: Math.min(80, Math.max(50, result.radarData?.adaptability || 65)),
              leadership: Math.min(8, result.radarData?.leadership || 3)
            };
          } else if (workYears <= 2) {
            radarData = {
              skill: Math.min(55, Math.max(25, result.radarData?.skill || 40)),
              experience: Math.min(35, Math.max(10, result.radarData?.experience || 25)),
              learning: Math.min(95, Math.max(65, result.radarData?.learning || 80)),
              adaptability: Math.min(85, Math.max(50, result.radarData?.adaptability || 65)),
              leadership: Math.min(30, Math.max(5, result.radarData?.leadership || 15))
            };
          } else if (workYears <= 5) {
            radarData = {
              skill: Math.min(80, Math.max(50, result.radarData?.skill || 60)),
              experience: Math.min(70, Math.max(40, result.radarData?.experience || 50)),
              learning: Math.min(95, Math.max(60, result.radarData?.learning || 80)),
              adaptability: Math.min(90, Math.max(50, result.radarData?.adaptability || 70)),
              leadership: Math.min(60, Math.max(20, result.radarData?.leadership || 35))
            };
          } else {
            radarData = {
              skill: Math.min(95, Math.max(60, result.radarData?.skill || 75)),
              experience: Math.min(100, Math.max(60, result.radarData?.experience || 75)),
              learning: Math.min(100, Math.max(60, result.radarData?.learning || 80)),
              adaptability: Math.min(100, Math.max(50, result.radarData?.adaptability || 70)),
              leadership: Math.min(95, Math.max(30, result.radarData?.leadership || 50))
            };
          }
          
          const optimizedData = {
            tree: { branches },
            radarData: radarData,
            challenges: isStudent ? {
              icon: '📚',
              text: '从校园到职场是重要转折，需要将理论知识转化为实践能力，同时建立职业规划意识'
            } : (result.challenges || cached.data.challenges),
            badges: isStudent ? ['🎓 在校学生', '📚 学习成长', '💪 潜力无限'] :
                    (result.badges || cached.data.badges),
            _isTemplate: false,
            _status: '✅ AI优化完成 ✨',
            _source: 'ai'
          };
          
          treeCache.set(sessionId, {
            ...cached,
            data: optimizedData,
            optimized: true,
            timestamp: Date.now()
          });
          
          console.log(`✅ AI优化成功: ${sessionId}`);
          console.log(`📊 最终雷达数据:`, radarData);
          return;
        }
      }
    }
    throw new Error('AI返回数据无效');
    
  } catch (error) {
    console.log(`⚠️ 优化失败 (尝试 ${retryCount + 1}): ${error.message}`);
    const delay = 3000 * Math.pow(2, retryCount);
    setTimeout(() => optimizeInBackground(sessionId, retryCount + 1), delay);
  }
}

// ============================================
// 接口4: 获取优化结果
// ============================================
app.get('/api/get-optimized-tree/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const cached = treeCache.get(sessionId);
  
  if (!cached) {
    return res.json({ 
      success: false, 
      error: 'sessionId不存在或已过期',
      message: '请重新生成成长树'
    });
  }
  
  cached.timestamp = Date.now();
  treeCache.set(sessionId, cached);
  
  if (cached.optimized) {
    return res.json({ 
      success: true, 
      data: cached.data, 
      optimized: true,
      message: '✅ 优化已完成'
    });
  }
  
  const elapsed = (Date.now() - cached.timestamp) / 1000;
  const estimatedTotal = 15 + (cached.retryCount || 0) * 5;
  const remaining = Math.max(0, Math.ceil(estimatedTotal - elapsed));
  
  return res.json({ 
    success: true, 
    data: cached.data, 
    optimized: false,
    remaining: remaining,
    message: `⏳ AI优化中 (预计 ${remaining}秒)` 
  });
});

// ============================================
// 健康检查
// ============================================
app.get('/health', (req, res) => res.json({ status: 'ok', cacheSize: treeCache.size }));

// ============================================
// 静态文件
// ============================================
app.use(express.static(path.join(__dirname, '/')));

const PORT = process.env.PORT || 8081;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 服务已启动 v10.0 端口:${PORT}`);
  console.log(`📊 缓存容量: ${treeCache.size}`);
});
