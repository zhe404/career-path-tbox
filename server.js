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

// 本地生成树（兜底方案）
function generateLocalTreeEnhanced(userInput) {
  const targetYears = parseInt(userInput.targetYears) || 5;
  const workYears = parseInt(userInput.years) || 0;
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
      title: `第${i}年 · ${userInput.job || '职业成长'}`,
      goals: goals[idx] || '持续成长',
      skills: ['专业技能', '沟通协作', '持续学习'].slice(0, Math.min(3, i)),
      milestone: milestones[idx] || `第${i}年里程碑`
    });
  }
  
  return {
    tree: { branches },
    radarData: { 
      skill: Math.min(90, 40 + workYears * 8 + targetYears * 2), 
      experience: Math.min(95, workYears * 12 + targetYears * 3), 
      learning: 85, 
      adaptability: 70, 
      leadership: Math.min(80, workYears * 5 + targetYears * 3) 
    },
    challenges: { 
      icon: '⚡', 
      text: '持续学习，把握机遇，在变化中成长' 
    },
    badges: ['🎯 目标清晰', '📈 持续成长', '💪 潜力无限', '🌟 未来可期'],
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
// 接口2: 技能推荐
// ============================================
app.post('/api/recommend-skills', async (req, res) => {
  try {
    const { job, education, goal, interest, style, gender, age } = req.body;
    console.log('🎯 技能推荐:', job);
    
    const styleDesc = {
      'default': '稳扎稳打',
      'cross': '跨界融合',
      'ideal': '理想主义',
      'balanced': '均衡发展'
    };
    
    const prompt = `请直接输出8-12个技能名称，用逗号分隔。不要任何解释、不要复述、不要前缀。\n\n职业:${job}\n教育:${education||''}\n目标:${goal||''}\n兴趣:${interest||''}\n风格:${styleDesc[style]||''}\n\n直接输出：`;
    
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
    res.json({ success: true, skills });
  } catch (error) {
    console.error('❌ 技能推荐失败:', error.message);
    const fallback = getFallbackSkills(req.body.job, req.body.education, req.body.goal, req.body.interest, req.body.style);
    res.json({ success: true, skills: fallback, fallback: true });
  }
});

function getFallbackSkills(job, education, goal, interest, style) {
  const baseMap = {
    '学生': ['学习方法', '时间管理', '专业知识', '学术写作', '沟通表达', '研究能力', '团队协作', '持续学习'],
    '老师': ['教学设计', '课堂管理', '教育心理学', '学科知识', '沟通表达', '评估反馈', '教育技术', '学生指导'],
    '教师': ['教学设计', '课堂管理', '教育心理学', '学科知识', '沟通表达', '评估反馈', '教育技术', '学生指导'],
    '网络安全': ['网络协议', '渗透测试', '安全防护', '漏洞挖掘', '应急响应', '日志分析', '安全策略', '系统安全'],
    '产品经理': ['用户研究', '产品设计', '数据分析', '项目管理', '商业分析', '沟通协作', '需求分析', '竞品分析'],
    '医生': ['临床诊断', '医疗技术', '医患沟通', '循证医学', '医疗管理', '团队协作', '持续学习', '病例分析'],
    '护士': ['护理技术', '患者关怀', '医疗记录', '急救技能', '沟通协作', '健康宣教', '药物管理', '病情观察'],
    '运营': ['用户运营', '数据分析', '增长策略', '内容策划', '项目管理', '沟通协作', '活动策划', '市场洞察'],
    '设计师': ['UI设计', 'UX研究', '设计工具', '设计思维', '用户测试', '创意表达', '视觉传达', '交互设计'],
    '奶茶店': ['团队管理', '门店运营', '排班调度', '营销推广', '客户服务', '库存管理', '成本核算', '培训带教'],
    '程序员': ['编程语言', '算法', '数据结构', '系统设计', '调试测试', '代码审查', '数据库', '版本控制'],
    '律师': ['法律研究', '法律写作', '诉讼技巧', '谈判能力', '客户沟通', '法律伦理', '案例分析', '法律检索'],
  };
  let baseSkills = ['专业技能', '沟通协作', '问题解决', '持续学习', '团队合作'];
  for (const [key, value] of Object.entries(baseMap)) {
    if (job && job.includes(key)) { baseSkills = value; break; }
  }
  let goalSkills = [];
  if (goal) {
    if (goal.includes('管理') || goal.includes('经理') || goal.includes('总监') || goal.includes('店长')) {
      goalSkills = ['团队管理', '战略规划', '决策能力', '领导力'];
    }
    if (goal.includes('专家') || goal.includes('工程师')) {
      goalSkills = ['深度研究', '技术创新', '专业认证', '行业洞察'];
    }
  }
  let interestSkills = [];
  if (interest && interest !== '无' && interest !== '没有') {
    if (interest.includes('AI') || interest.includes('数据')) interestSkills = ['数据分析', 'AI应用', '机器学习'];
    if (interest.includes('管理') || interest.includes('领导')) interestSkills = ['团队管理', '领导力', '组织发展'];
    if (interest.includes('安全') || interest.includes('网络')) interestSkills = ['网络安全', '渗透测试', '安全防护'];
  }
  return [...new Set([...baseSkills, ...goalSkills, ...interestSkills])].slice(0, 12);
}

// ============================================
// 接口3: 生成成长树
// ============================================
app.post('/api/generate-tree', async (req, res) => {
  try {
    const userInput = req.body;
    console.log('🌳 生成成长树:', userInput.job);
    
    const sessionId = 'tree_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    
    // 立即返回本地模板
    const templateData = generateCareerTree(userInput);
    templateData._sessionId = sessionId;
    templateData._status = '⏳ AI优化中...';
    templateData._isTemplate = true;
    
    treeCache.set(sessionId, {
      data: templateData,
      userInput,
      optimized: false,
      timestamp: Date.now(),
      retryCount: 0,
      lastAttempt: Date.now()
    });
    
    res.json({ 
      success: true, 
      data: templateData, 
      sessionId, 
      template: true,
      message: '初始版本已生成，AI正在后台优化...'
    });
    
    // 异步优化（后台执行）
    setTimeout(() => optimizeInBackground(sessionId), 500);
    
  } catch (error) {
    console.error('❌ 生成失败:', error.message);
    const fallback = generateLocalTreeEnhanced(req.body);
    res.json({ success: true, data: fallback, fallback: true });
  }
});

// ============================================
// 后台优化函数（带重试）
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
    
    console.log(`🔄 AI优化 (尝试 ${retryCount + 1}/${maxRetries})...`);
    
    const prompt = `职业:${userInput.job},工作${workYears}年,性别:${userInput.gender||''},年龄:${userInput.age||''}岁,目标:${userInput.goal},兴趣:${userInput.interest},技能:${(userInput.skills||[]).join(',')}。生成${targetYears}年职业路径JSON:{"branches":[{"year":年份,"icon":"图标","title":"标题","goals":"目标","skills":["技能"],"milestone":"里程碑"}],"radarData":{"skill":数值,"experience":数值,"learning":数值,"adaptability":数值,"leadership":数值},"challenges":{"icon":"图标","text":"挑战描述"},"badges":["徽章1","徽章2"]}只返回JSON，不要任何解释。`;
    
    const reply = await callAIWithRetry(prompt, 2, 90000);
    
    if (reply) {
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        if (result.branches && result.branches.length > 0) {
          // 确保分支数量匹配目标年数
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
          
          const optimizedData = {
            tree: { branches },
            radarData: result.radarData || cached.data.radarData,
            challenges: result.challenges || cached.data.challenges,
            badges: result.badges || cached.data.badges,
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
          return;
        }
      }
    }
    throw new Error('AI返回数据无效');
    
  } catch (error) {
    console.log(`⚠️ 优化失败 (尝试 ${retryCount + 1}): ${error.message}`);
    // 指数退避重试
    const delay = 3000 * Math.pow(2, retryCount);
    setTimeout(() => optimizeInBackground(sessionId, retryCount + 1), delay);
  }
}

// ============================================
// 接口4: 获取优化结果（轮询）
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
  
  // 更新缓存时间，延长生命周期
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
  
  // 计算预估剩余时间
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
  console.log(`🚀 服务已启动 v8.0 端口:${PORT}`);
  console.log(`📊 缓存容量: ${treeCache.size}`);
});
