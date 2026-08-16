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
// 检测是否为在校学生（修复版 - 精确匹配）
// ============================================
function isStudentJob(job) {
  if (!job) return false;
  
  // 1. 先排除明确不是学生的职业（含"大学"但非学生）
  const excludeKeywords = [
    '教师', '教授', '讲师', '副教授', '助教',
    '辅导员', '班主任', '导师',
    '医生', '护士', '医师', '主任', '院长',
    '教务', '行政', '管理', '后勤',
    '研究员', '科研', '实验员'
  ];
  if (excludeKeywords.some(keyword => job.includes(keyword))) {
    return false;
  }
  
  // 2. 匹配学生关键词（精确匹配，不含"大学"）
  const studentKeywords = [
    '初中生', '高中生', '中学生',
    '本科生', '硕士生', '博士生', '研究生',
    '应届生', '专科生',
    '学生',      // 兜底，但已被排除词优先过滤
    '大学生'     // 只精确匹配"大学生"，不匹配"大学教师"
  ];
  
  if (studentKeywords.some(keyword => job.includes(keyword))) {
    return true;
  }
  
  // 3. 额外检查：如果包含"大学"但不含排除词，且不含学生关键词，则不是学生
  if (job.includes('大学')) {
    return false;
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
  
  // ==========================================
  // 根据职业类型设置雷达图
  // ==========================================
  let radarData;
  if (isStudent) {
    // 在校学生：没有工作经验，以学习能力为主
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
// 缓存管理
// ============================================
const treeCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟

// 定期清理过期缓存
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
// 接口2: 技能推荐（修复版 - 基于目标职业）
// ============================================
app.post('/api/recommend-skills', async (req, res) => {
  try {
    const { job, education, goal, interest, style, gender, age } = req.body;
    console.log('🎯 当前职业:', job);
    console.log('🎯 目标职业:', goal);
    
    // ========== 核心修复：基于目标职业推荐技能 ==========
    // 用户填核心技能是为了让AI知道ta为了转行已经掌握了哪些基础
    // 所以应该基于目标职业推荐，而不是当前职业
    
    // 如果用户没有填目标职业，才基于当前职业推荐
    const targetForRecommend = goal && goal.length > 0 ? goal : job;
    console.log(`📌 基于"${targetForRecommend}"推荐技能`);
    
    const prompt = `用户当前是"${job}"，目标是成为"${targetForRecommend}"。请根据目标职业"${targetForRecommend}"，推荐该岗位从业者通常需要具备的8-12项核心技能名称。

要求：
1. 只推荐目标职业"${targetForRecommend}"相关的技能
2. 直接输出技能名称，用逗号分隔
3. 不要任何解释、不要序号、不要前缀

直接输出：`;
    
    console.log('📝 提示词:', prompt.substring(0, 200) + '...');
    
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
        '或','等','为','在','有','你','我','直接输出','直接'
      ];
      
      const invalidPhrases = [
        '根据搜索结果', '结合用户', '为您推荐', '以下技能', 
        '建议如下', '核心技能', '能力分析', '职业匹配',
        '根据您', '结合您', '为您提供', '我建议', '推荐如下',
        '搜索结果', '搜索', '用户信息', '综合分析'
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
        if (invalidPhrases.some(p => trimmed.includes(p))) continue;
        skills.push(trimmed);
      }
      skills = [...new Set(skills)].slice(0, 12);
    }
    
    if (skills.length < 4) {
      console.log('⚠️ AI返回技能不足，使用fallback');
      skills = getFallbackSkills(targetForRecommend);
    }
    
    console.log('✅ 推荐技能:', skills);
    res.json({ success: true, skills });
  } catch (error) {
    console.error('❌ 技能推荐失败:', error.message);
    const fallback = getFallbackSkills(req.body.goal || req.body.job);
    res.json({ success: true, skills: fallback, fallback: true });
  }
});

function getFallbackSkills(target) {
  // 基于目标职业查找
  const baseMap = {
    '网络安全': ['计算机网络基础', 'TCP/IP协议', '操作系统安全', '防火墙技术', '入侵检测', '漏洞扫描', '安全审计', '渗透测试基础', '密码学基础', '安全运维'],
    '安全': ['计算机网络基础', 'TCP/IP协议', '操作系统安全', '防火墙技术', '入侵检测', '漏洞扫描', '安全审计', '渗透测试基础'],
    '全栈': ['JavaScript', 'Python', 'React', 'Node.js', '数据库', 'API设计', 'Docker', 'Git', '前端工程化', '后端架构'],
    '前端': ['HTML', 'CSS', 'JavaScript', 'React', 'Vue', '前端工程化', '性能优化', 'UI组件', '浏览器调试'],
    '后端': ['Java', 'Python', 'Go', 'Spring Boot', 'Django', '数据库', 'API设计', '微服务', '系统架构'],
    '产品经理': ['用户研究', '产品设计', '数据分析', '项目管理', '商业分析', '沟通协作', '需求分析', '竞品分析'],
    '设计师': ['UI设计', 'UX研究', '设计工具', '设计思维', '用户测试', '创意表达', '视觉传达', '交互设计'],
    '运营': ['用户运营', '数据分析', '增长策略', '内容策划', '项目管理', '沟通协作', '活动策划', '市场洞察'],
    '人力资源': ['招聘管理', '员工关系', '薪酬福利', '绩效管理', '培训发展', '劳动法规', '组织发展', 'HRIS系统'],
    '教师': ['教学设计', '课堂管理', '教育心理学', '学科知识', '沟通表达', '评估反馈', '教育技术', '学生指导'],
    '辅导员': ['学生管理', '心理健康教育', '职业规划指导', '沟通协调', '危机干预', '活动组织', '班级管理', '思政教育'],
    '医生': ['临床诊断', '医疗技术', '医患沟通', '循证医学', '医疗管理', '团队协作', '持续学习', '病例分析'],
    '律师': ['法律研究', '法律写作', '诉讼技巧', '谈判能力', '客户沟通', '法律伦理', '案例分析', '法律检索'],
    '学生': ['学习方法', '时间管理', '专业知识', '学术写作', '沟通表达', '研究能力', '团队协作', '持续学习'],
    '初中生': ['学习方法', '时间管理', '基础知识', '阅读能力', '写作能力', '数学思维', '英语基础', '科学素养'],
    '高中生': ['学习方法', '时间管理', '学科知识', '考试技巧', '自主学习', '研究能力', '团队协作', '持续学习'],
    '大学生': ['学习方法', '时间管理', '专业知识', '学术写作', '沟通表达', '研究能力', '团队协作', '持续学习'],
  };
  
  let baseSkills = ['专业技能', '沟通协作', '问题解决', '持续学习', '团队合作'];
  for (const [key, value] of Object.entries(baseMap)) {
    if (target && target.includes(key)) { baseSkills = value; break; }
  }
  
  return [...new Set(baseSkills)].slice(0, 12);
}

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
    
    // 立即返回本地模板（使用增强版）
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
    
    // 异步优化
    setTimeout(() => optimizeInBackground(sessionId), 500);
    
  } catch (error) {
    console.error('❌ 生成失败:', error.message);
    const fallback = generateLocalTreeEnhanced(req.body);
    res.json({ success: true, data: fallback, fallback: true });
  }
});

// ============================================
// 后台优化函数（修复版 - 支持学生检测）
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
          
          // ==========================================
          // 核心修复：根据职业类型强制设置雷达图
          // ==========================================
          let radarData = {};
          
          if (isStudent) {
            // 在校学生：忽略AI返回，使用固定值
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
          
          // 构建优化数据
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
  
  // 更新缓存时间
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
  console.log(`🚀 服务已启动 v9.2 端口:${PORT}`);
  console.log(`📊 缓存容量: ${treeCache.size}`);
});
