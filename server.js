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
// 技能推荐
// ============================================
app.post('/api/recommend-skills', async (req, res) => {
  try {
    const { job, education, goal, interest, style } = req.body;
    console.log('🎯 技能推荐:', job);
    const styleMap = { 'default': '稳妥', 'cross': '跨界', 'ideal': '创新', 'balanced': '均衡' };
    const prompt = `职业:${job},教育:${education},目标:${goal},兴趣:${interest},风格:${styleMap[style]||'稳妥'}。推荐8-12项核心技能，只返回技能名称用逗号分隔`;
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
      const matches = reply.match(/[\u4e00-\u9fa5]{2,6}/g);
      if (matches && matches.length > 0) {
        skills = matches.slice(0, 12);
      } else {
        skills = reply.split(/[,，、\s]+/).filter(s => {
          const trimmed = s.trim();
          return trimmed.length > 0 && trimmed.length < 15 && !/^[0-9]+$/.test(trimmed);
        }).slice(0, 12);
      }
    }
    if (skills.length < 4) {
      skills = ['专业技能', '沟通协作', '问题解决', '持续学习', '团队合作'];
    }
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
  console.log('🚀 服务已启动 (稳定版 v3.1)');
  console.log(`📡 端口: ${PORT}`);
  console.log(`🌐 访问: http://localhost:${PORT}`);
  console.log('='.repeat(55));
});
