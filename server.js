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

const treeCache = new Map();

// ============================================
// 快速咨询
// ============================================
app.post('/api/consult-ai-fast', async (req, res) => {
  try {
    const { message, context } = req.body;
    console.log('⚡ 快速咨询');
    let query = message;
    if (message.length > 500) {
      query = message.substring(0, 500);
    }
    const requestData = {
      appId: '202607APmEQJ20464969',
      query: query,
      userId: 'user_' + Date.now(),
      stream: false,
    };
    const response = await axios.post(TBOX_CONFIG.apiUrl, requestData, {
      headers: { 'Content-Type': 'application/json', 'Authorization': TBOX_CONFIG.apiKey },
      timeout: 250000,
    });
    const reply = parseAIResponse(response.data) || 'AI未返回有效内容';
    res.json({ success: true, reply });
  } catch (error) {
    console.error('❌ 快速咨询失败:', error.message);
    res.json({ success: false, error: 'AI服务响应超时，请稍后重试' });
  }
});

// ============================================
// 技能推荐（修复版 - 不返回提示词内容）
// ============================================
app.post('/api/recommend-skills', async (req, res) => {
  try {
    const { job, education, goal, interest, style } = req.body;
    console.log('🎯 技能推荐:', job);
    
    const styleMap = { 'default': '稳妥', 'cross': '跨界', 'ideal': '创新', 'balanced': '均衡' };
    
    // 严格提示词：要求只返回技能名称
    const prompt = `你是技能推荐引擎。请直接输出技能名称列表，用逗号分隔。\n禁止输出任何解释、前缀、后缀、复述。\n禁止输出"根据""结合""推荐""以下"等词汇。\n\n用户信息：职业=${job}，教育=${education || '无'}，目标=${goal || '无'}，兴趣=${interest || '无'}，风格=${styleMap[style] || '稳妥'}\n\n输出格式（仅技能名称）：`;
    
    const requestData = {
      appId: '202607APmEQJ20464969',
      query: prompt,
      userId: 'user_' + Date.now(),
      stream: false,
    };
    
    const response = await axios.post(TBOX_CONFIG.apiUrl, requestData, {
      headers: { 'Content-Type': 'application/json', 'Authorization': TBOX_CONFIG.apiKey },
      timeout: 150000,
    });
    
    let reply = parseAIResponse(response.data);
    let skills = [];
    
    if (reply) {
      // 无效短语黑名单
      const invalidPhrases = [
        '根据', '结合', '搜索', '用户', '推荐', '以下', '如下',
        '建议', '结果', '信息', '核心', '相关', '适合', '需要',
        '可以', '应该', '包括', '以上', '这些', '那些', '其中',
        '比如', '例如', '以及', '或者', '技能', '能力', '方面',
        '领域', '知识', '经验', '素质', '特质', '直接', '返回',
        '名称', '列表', '输出', '格式', '仅', '禁止', '解释',
        '前缀', '后缀', '复述', '词汇', '引擎', '用户信息',
        '职业', '教育', '目标', '兴趣', '风格', '无', '稳妥',
        '跨界', '创新', '均衡', '请', '只', '不', '要', '的',
        '了', '是', '和', '与', '或', '等', '为', '在', '有'
      ];
      
      // 按分隔符分割
      const parts = reply.split(/[,，、\s\n\r\t]+/);
      
      for (const part of parts) {
        // 去除引号、括号等包装字符
        const trimmed = part.trim().replace(/^["'""''【】\[\]()（）]+|["'""''【】\[\]()（）]+$/g, '');
        if (trimmed.length < 2 || trimmed.length > 12) continue;
        if (/^[0-9]+$/.test(trimmed)) continue;
        if (invalidPhrases.some(p => trimmed.includes(p))) continue;
        skills.push(trimmed);
      }
      
      // 去重并限制数量
      skills = [...new Set(skills)].slice(0, 12);
    }
    
    // fallback
    if (skills.length < 4) {
      skills = ['专业技能', '沟通协作', '问题解决', '持续学习', '团队合作'];
    }
    
    console.log('✅ 推荐技能:', skills);
    res.json({ success: true, skills });
    
  } catch (error) {
    console.error('❌ 技能推荐失败:', error.message);
    res.json({ success: true, skills: ['专业技能', '沟通协作', '问题解决', '持续学习', '团队合作'], fallback: true });
  }
});

// ============================================
// 生成成长树
// ============================================
app.post('/api/generate-tree', async (req, res) => {
  try {
    const userInput = req.body;
    console.log('🌳 生成成长树:', userInput.job);
    const templateData = generateCareerTree(userInput);
    templateData._isTemplate = true;
    templateData._status = 'AI优化中';
    const sessionId = 'tree_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    templateData._sessionId = sessionId;
    treeCache.set(sessionId, { data: templateData, userInput: userInput, optimized: false, timestamp: Date.now() });
    res.json({ success: true, data: templateData, template: true, sessionId: sessionId, source: templateData._source || 'template' });

    // 后台异步优化
    setTimeout(async () => {
      try {
        console.log('🔄 后台AI优化开始... sessionId:', sessionId);
        const targetYears = parseInt(userInput.targetYears) || 5;
        const workYears = parseInt(userInput.years) || 0;
        const prompt = `职业:${userInput.job},${workYears}年经验,目标:${userInput.goal},风格:${userInput.styleLabel},兴趣:${userInput.interest},技能:${(userInput.skills || []).join(',')}。生成${targetYears}年职业路径JSON:{"branches":[{"year":1,"icon":"📚","title":"阶段名","goals":"具体目标","skills":["技能"],"milestone":"里程碑"}],"radarData":{"skill":0-100,"experience":0-100,"learning":0-100,"adaptability":0-100,"leadership":0-100},"challenges":{"icon":"⚡","text":"挑战"},"badges":["徽章1","徽章2","徽章3"]}只返回JSON，branches数组必须包含${targetYears}个元素`;
        const requestData = {
          appId: '202607APmEQJ20464969',
          query: prompt,
          userId: 'user_' + Date.now(),
          stream: false,
        };
        const response = await axios.post(TBOX_CONFIG.apiUrl, requestData, {
          headers: { 'Content-Type': 'application/json', 'Authorization': TBOX_CONFIG.apiKey },
          timeout: 300000,
        });
        let reply = parseAIResponse(response.data);
        if (reply) {
          const jsonMatch = reply.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            if (result.branches && result.branches.length > 0) {
              let optimizedBranches = result.branches;
              const icons = ['📚', '📝', '💡', '👥', '🏆', '🌐', '🎯', '🌟', '🏛️', '💎'];
              while (optimizedBranches.length < targetYears) {
                const i = optimizedBranches.length;
                optimizedBranches.push({ year: i + 1, icon: icons[i] || '📌', title: `第${i + 1}年成长`, goals: '持续成长与突破', skills: ['专业技能', '持续学习', '创新思维'], milestone: `第${i + 1}年里程碑` });
              }
              if (optimizedBranches.length > targetYears) optimizedBranches = optimizedBranches.slice(0, targetYears);
              let radarData = result.radarData || templateData.radarData;
              if (workYears === 0) {
                radarData = { ...radarData, experience: 0, leadership: 0, skill: Math.min(40, radarData.skill || 30) };
              }
              let badges = result.badges || templateData.badges;
              if (workYears === 0) badges = ['🌟 初入职场', '🚀 快速成长', '💪 潜力无限'];
              let challenges = result.challenges || templateData.challenges;
              if (workYears === 0 && challenges && challenges.text) {
                challenges.text = `作为职场新人，需要快速学习和积累经验。${challenges.text}`;
              }
              const optimizedData = {
                tree: { branches: optimizedBranches },
                recommendedSkills: result.recommendedSkills || ['AI应用', '数据分析', '项目管理'],
                radarData: radarData,
                challenges: challenges,
                badges: badges,
                _isTemplate: false,
                _sessionId: sessionId,
                _status: '已优化 ✓'
              };
              treeCache.set(sessionId, { data: optimizedData, userInput: userInput, optimized: true, timestamp: Date.now() });
              console.log('✅ 后台AI优化成功');
            }
          }
        }
      } catch (aiError) {
        console.log('⏱️ 后台AI优化失败:', aiError.message);
        const cachedData = treeCache.get(sessionId);
        if (cachedData) {
          cachedData.optimized = true;
          cachedData.data._status = 'AI优化失败，使用基础版本';
          cachedData.data._optimizeError = aiError.message;
          treeCache.set(sessionId, cachedData);
        }
      }
    }, 100);
  } catch (error) {
    console.error('❌ 生成树失败:', error.message);
    const defaultData = generateCareerTree(req.body);
    defaultData._fallback = true;
    res.json({ success: true, data: defaultData, fallback: true });
  }
});

// ============================================
// 获取优化结果
// ============================================
app.get('/api/get-optimized-tree/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const cached = treeCache.get(sessionId);
    if (!cached) {
      return res.json({ success: false, error: 'sessionId不存在或已过期' });
    }
    if (cached.optimized) {
      return res.json({ success: true, data: cached.data, optimized: true });
    } else {
      const elapsed = Date.now() - cached.timestamp;
      const remaining = Math.max(0, Math.ceil((15000 - elapsed) / 1000));
      return res.json({ success: true, data: cached.data, optimized: false, message: remaining > 0 ? `⏳ AI优化中（约${remaining}秒）` : '⏳ AI优化中，请稍后重试' });
    }
  } catch (error) {
    console.error('❌ 获取优化结果失败:', error.message);
    res.json({ success: false, error: error.message });
  }
});

// ============================================
// 健康检查
// ============================================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: '服务正常运行', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

app.get('/api/test', (req, res) => {
  res.json({ status: 'ok', message: 'API服务正常运行', timestamp: new Date().toISOString() });
});

app.use(express.static(path.join(__dirname, '/')));

const PORT = process.env.PORT || 8081;
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(55));
  console.log('🚀 服务已启动 (稳定版 v3.2)');
  console.log(`📡 端口: ${PORT}`);
  console.log(`🌐 访问: http://localhost:${PORT}`);
  console.log('='.repeat(55));
});
