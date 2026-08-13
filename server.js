const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

// 导入职业生成器
const { generateCareerTree } = require('./careerGenerator.js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ==========================================
// 百宝箱API配置
// ==========================================
const TBOX_CONFIG = {
  apiUrl: 'https://api.tbox.cn/api/chat',
  apiKey: process.env.TBOX_API_KEY || 'inc-ak1e56da43c93029e7f6f13a63fe5b0cadf0deff0351694f5e1998cb4f590cb005',
};

// ============================================
// 工具函数：解析AI回复
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
// 缓存
// ============================================
const treeCache = new Map();

// ============================================
// 1. 咨询AI接口（完整版）
// ============================================
app.post('/api/consult-ai', async (req, res) => {
  try {
    const { message, context } = req.body;
    console.log('📨 收到咨询请求:', message.substring(0, 50) + '...');

    let query = message;
    if (message.length > 1500) {
      const lines = message.split('\n');
      const important = lines.filter(line => 
        line.includes('背景') || line.includes('目标') || 
        line.includes('风格') || line.includes('技能') ||
        line.includes('请回答') || line.includes('建议') ||
        line.includes('用户信息') || line.includes('职业')
      );
      query = important.join('\n').substring(0, 1500);
    }

    const requestData = {
      appId: '202607APmEQJ20464969',
      query: query,
      userId: 'user_' + Date.now(),
      stream: false,
    };

    const response = await axios.post(
      TBOX_CONFIG.apiUrl,
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': TBOX_CONFIG.apiKey,
        },
        timeout: 600000,
      }
    );

    const reply = parseAIResponse(response.data) || 'AI未返回有效内容';

    res.json({
      success: true,
      reply: reply
    });

  } catch (error) {
    console.error('❌ AI咨询失败:', error.message);
    res.json({
      success: false,
      error: error.message || 'AI服务暂时不可用'
    });
  }
});

// ============================================
// 2. 快速咨询接口
// ============================================
app.post('/api/consult-ai-fast', async (req, res) => {
  try {
    const { message, context } = req.body;
    console.log('⚡ 快速咨询');

    let query = message;
    if (message.length > 500) {
      const lines = message.split('\n');
      const important = lines.filter(line => 
        line.includes('我是') || line.includes('职业') || 
        line.includes('目标') || line.includes('兴趣') ||
        line.includes('技能') || line.includes('建议') ||
        line.includes('计划') || line.includes('年')
      );
      query = important.join('\n').substring(0, 500);
      
      if (query.length < 50) {
        query = message.substring(0, 300);
      }
    }

    const requestData = {
      appId: '202607APmEQJ20464969',
      query: query,
      userId: 'user_' + Date.now(),
      stream: false,
    };

    const response = await axios.post(
      TBOX_CONFIG.apiUrl,
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': TBOX_CONFIG.apiKey,
        },
        timeout: 250000,
      }
    );

    const reply = parseAIResponse(response.data) || 'AI未返回有效内容';

    res.json({ success: true, reply });

  } catch (error) {
    console.error('❌ 快速咨询失败:', error.message);
    res.json({
      success: false,
      error: 'AI服务响应超时，请稍后重试'
    });
  }
});

// ============================================
// 3. 技能推荐接口
// ============================================
app.post('/api/recommend-skills', async (req, res) => {
  try {
    const { job, education, goal, interest, style } = req.body;
    console.log('🎯 技能推荐:', job);

    const styleMap = {
      'default': '稳妥',
      'cross': '跨界',
      'ideal': '创新',
      'balanced': '均衡'
    };
    
    const prompt = `职业:${job},教育:${education},目标:${goal},兴趣:${interest},风格:${styleMap[style]||'稳妥'}。推荐8-12项核心技能，只返回技能名称用逗号分隔`;

    const requestData = {
      appId: '202607APmEQJ20464969',
      query: prompt,
      userId: 'user_' + Date.now(),
      stream: false,
    };

    const response = await axios.post(
      TBOX_CONFIG.apiUrl,
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': TBOX_CONFIG.apiKey,
        },
        timeout: 150000,
      }
    );

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

    res.json({
      success: true,
      skills: skills
    });

  } catch (error) {
    console.error('❌ 技能推荐失败:', error.message);
    res.json({
      success: true,
      skills: ['专业技能', '沟通协作', '问题解决', '持续学习', '团队合作'],
      fallback: true
    });
  }
});

// ============================================
// 4. 生成成长树接口（秒开版 + 百宝箱API）
// ============================================
app.post('/api/generate-tree', async (req, res) => {
  try {
    const userInput = req.body;
    console.log('🌳 生成成长树:', userInput.job);

    // 1. 配置驱动生成模板（<1ms，不调API）
    const templateData = generateCareerTree(userInput);
    templateData._isTemplate = true;
    templateData._status = 'AI优化中';

    // 生成sessionId
    const sessionId = 'tree_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    templateData._sessionId = sessionId;
    
    // 存储到缓存
    treeCache.set(sessionId, {
      data: templateData,
      userInput: userInput,
      optimized: false,
      timestamp: Date.now()
    });

    // 2. 立即返回模板（<1秒）
    res.json({
      success: true,
      data: templateData,
      template: true,
      sessionId: sessionId
    });

    // 3. 后台异步调用百宝箱API
    setTimeout(async () => {
      try {
        console.log('🔄 后台AI优化开始... sessionId:', sessionId);
        
        const prompt = `职业:${userInput.job},${userInput.years}年,目标:${userInput.goal},风格:${userInput.styleLabel},兴趣:${userInput.interest},技能:${(userInput.skills || []).join(',')}。
生成${userInput.targetYears || 5}年职业路径JSON:
{"branches":[{"year":1,"icon":"📚","title":"阶段名","goals":"具体目标","skills":["技能"],"milestone":"里程碑"}],
"radarData":{"skill":0-100,"experience":0-100,"learning":0-100,"adaptability":0-100,"leadership":0-100},
"challenges":{"icon":"⚡","text":"基于用户背景的挑战与机遇，用'可能面临'、'需要应对'等措辞"},
"badges":["徽章1","徽章2","徽章3"]}
只返回JSON`;

        const requestData = {
          appId: '202607APmEQJ20464969',
          query: prompt,
          userId: 'user_' + Date.now(),
          stream: false,
        };

        const response = await axios.post(
          TBOX_CONFIG.apiUrl,
          requestData,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': TBOX_CONFIG.apiKey,
            },
            timeout: 250000,
          }
        );

        let reply = parseAIResponse(response.data);
        if (reply) {
          const jsonMatch = reply.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            if (result.branches && result.branches.length > 0) {
              const optimizedData = {
                tree: { branches: result.branches },
                recommendedSkills: result.recommendedSkills || ['AI应用', '数据分析', '项目管理'],
                radarData: result.radarData || templateData.radarData,
                challenges: result.challenges || templateData.challenges,
                badges: result.badges || templateData.badges,
                _isTemplate: false,
                _sessionId: sessionId,
                _status: '已优化 ✓'
              };
              
              treeCache.set(sessionId, {
                data: optimizedData,
                userInput: userInput,
                optimized: true,
                timestamp: Date.now()
              });
              
              console.log('✅ 后台AI优化成功，sessionId:', sessionId);
            }
          }
        }
      } catch (aiError) {
        console.log('⏱️ 后台AI优化失败:', aiError.message);
      }
    }, 100);

  } catch (error) {
    console.error('❌ 生成树失败:', error.message);
    const defaultData = generateCareerTree(req.body);
    defaultData._fallback = true;
    res.json({
      success: true,
      data: defaultData,
      fallback: true
    });
  }
});

// ============================================
// 5. 获取优化结果
// ============================================
app.get('/api/get-optimized-tree/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const cached = treeCache.get(sessionId);
    
    if (!cached) {
      return res.json({
        success: false,
        error: 'sessionId不存在或已过期'
      });
    }
    
    if (cached.optimized) {
      return res.json({
        success: true,
        data: cached.data,
        optimized: true
      });
    } else {
      return res.json({
        success: true,
        data: cached.data,
        optimized: false,
        message: 'AI仍在优化中，请稍后再试'
      });
    }
    
  } catch (error) {
    console.error('❌ 获取优化结果失败:', error.message);
    res.json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// 6. 健康检查
// ============================================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: '服务正常运行',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/api/test', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'API服务正常运行',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// 7. 静态文件服务
// ============================================
app.use(express.static(path.join(__dirname, '/')));

// ============================================
// 8. 启动服务器
// ============================================
const PORT = process.env.PORT || 8081;
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(55));
  console.log('🚀 服务已启动');
  console.log(`📡 端口: ${PORT}`);
  console.log(`🌐 访问: http://localhost:${PORT}`);
  console.log('='.repeat(55));
});