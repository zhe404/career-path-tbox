const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 百宝箱API配置
// ==========================================
const TBOX_CONFIG = {
  apiUrl: 'https://api.tbox.cn/api/chat',
  apiKey: process.env.TBOX_API_KEY || 'inc-ak1e56da43c93029e7f6f13a63fe5b0cadf0deff0351694f5e1998cb4f590cb005',
};

// ============================================
// 1. 咨询AI接口（非流式响应）
// ============================================
app.post('/api/consult-ai', async (req, res) => {
  try {
    const { message, context } = req.body;
    console.log('📨 收到咨询请求:', message.substring(0, 50) + '...');

    const requestData = {
      appId: '202607APmEQJ20464969',
      query: message,
      userId: 'user_' + Date.now(),
      stream: false,
    };

    console.log('📤 请求体:', JSON.stringify(requestData, null, 2));

    const response = await axios.post(
      TBOX_CONFIG.apiUrl,
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': TBOX_CONFIG.apiKey,
        },
        timeout: 30000,  // 减少到30秒
      }
    );

    console.log('✅ AI响应成功，状态码:', response.status);

    // 解析非流式响应
    let reply = '';

    if (response.data && response.data.data) {
      const data = response.data.data;
      
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.result && Array.isArray(item.result)) {
            for (const result of item.result) {
              if (result.chunk) {
                if (result.mediaType === 'text') {
                  reply += result.chunk;
                } else {
                  try {
                    const chunkData = typeof result.chunk === 'string' 
                      ? JSON.parse(result.chunk) 
                      : result.chunk;
                    reply += chunkData.text || chunkData.content || '';
                  } catch (e) {
                    reply += result.chunk;
                  }
                }
              }
            }
          }
        }
      } else {
        if (data.result && Array.isArray(data.result)) {
          for (const result of data.result) {
            if (result.chunk) {
              if (result.mediaType === 'text') {
                reply += result.chunk;
              } else {
                try {
                  const chunkData = typeof result.chunk === 'string' 
                    ? JSON.parse(result.chunk) 
                    : result.chunk;
                  reply += chunkData.text || chunkData.content || '';
                } catch (e) {
                  reply += result.chunk;
                }
              }
            }
          }
        }
      }
    }

    if (!reply || reply.trim() === '') {
      reply = response.data?.data?.reply || 
              response.data?.reply || 
              response.data?.message ||
              response.data?.answer ||
              'AI未返回有效内容';
    }

    console.log('📝 回复长度:', reply.length);
    console.log('📝 回复预览:', reply.substring(0, 200) + '...');

    res.json({
      success: true,
      reply: reply,
      raw: response.data
    });

  } catch (error) {
    console.error('❌ AI咨询失败:', error.message);
    
    let errorMsg = 'AI服务暂时不可用';
    let statusCode = 500;
    
    if (error.response) {
      statusCode = error.response.status;
      console.error('响应状态:', statusCode);
      console.error('响应数据:', error.response.data);
      
      if (statusCode === 403) {
        errorMsg = '授权令牌无效，请在百宝箱控制台重新生成密钥';
      } else if (statusCode === 400) {
        errorMsg = '请求参数错误，请检查API文档';
      } else if (statusCode === 404) {
        errorMsg = 'API地址不存在，请检查URL';
      } else {
        errorMsg = error.response.data?.errorMsg || 
                   error.response.data?.message || 
                   'AI服务返回错误';
      }
    } else if (error.request) {
      errorMsg = '无法连接到百宝箱服务，请检查网络';
    } else if (error.code === 'ECONNRESET') {
      errorMsg = '连接被重置，请稍后重试';
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMsg,
      detail: error.message
    });
  }
});

// ============================================
// 2. 快速生成接口（优化版）
// ============================================
app.post('/api/generate-quick', async (req, res) => {
  try {
    const userInput = req.body;
    console.log('⚡ 快速生成请求');

    // 使用更精简的prompt
    const prompt = `
职业：${userInput.job}
年限：${userInput.years}年
目标：${userInput.goal}
周期：${userInput.targetYears}年

请生成JSON格式的职业成长路径，包含：
{
  "tree": {"branches": [{"year":1,"icon":"📚","title":"阶段名","goals":"目标","skills":["技能1"],"milestone":"里程碑"}]},
  "recommendedSkills": ["技能1"],
  "radarData": {"skill":70,"experience":60,"learning":80,"adaptability":65,"leadership":50},
  "event": {"icon":"⚡","text":"机遇描述"},
  "badges": ["徽章1"]
}
只返回JSON。
    `;

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
        timeout: 2000000,  // 20秒超时
      }
    );

    let reply = '';
    if (response.data && response.data.data) {
      const data = response.data.data;
      if (data.result && Array.isArray(data.result)) {
        for (const result of data.result) {
          if (result.chunk) {
            if (result.mediaType === 'text') {
              reply += result.chunk;
            } else {
              try {
                const chunkData = typeof result.chunk === 'string' 
                  ? JSON.parse(result.chunk) 
                  : result.chunk;
                reply += chunkData.text || chunkData.content || '';
              } catch (e) {
                reply += result.chunk;
              }
            }
          }
        }
      }
    }

    // 解析JSON
    let result;
    try {
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        result = JSON.parse(reply);
      }
    } catch (e) {
      console.error('JSON解析失败，使用默认数据');
      result = getDefaultTree(userInput);
    }

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('快速生成失败:', error.message);
    // 返回默认数据
    res.json({
      success: true,
      data: getDefaultTree(req.body),
      fallback: true
    });
  }
});

// ============================================
// 默认树形数据（降级方案）
// ============================================
function getDefaultTree(userInput) {
  const job = userInput.job || '产品经理';
  const interest = userInput.interest || '职业发展';
  const years = userInput.targetYears || 5;

  const branchTemplates = {
    '产品经理': [
      { year: 1, icon: '📚', title: '产品筑基 · 用户洞察', goals: '深入用户研究，建立产品思维', skills: ['用户研究', '产品设计', '数据分析'], milestone: '完成1个完整PRD' },
      { year: 2, icon: '📊', title: '数据驱动 · 产品迭代', goals: '用数据驱动决策，独立负责产品线', skills: ['数据分析', '项目管理', '沟通协作'], milestone: '上线1个独立负责的功能' },
      { year: 3, icon: '💡', title: '商业思维 · 战略规划', goals: '理解商业模式，制定产品路线图', skills: ['商业分析', '战略规划', '领导力'], milestone: '完成1次战略汇报' },
      { year: 4, icon: '👥', title: '团队领导 · 管理进阶', goals: '带领团队，培养跨部门协作能力', skills: ['团队管理', '创新思维', '市场洞察'], milestone: '团队成功交付项目' },
      { year: 5, icon: '🏆', title: '产品总监 · 行业影响', goals: '构建产品生态，输出方法论', skills: ['产品战略', '行业洞察', '技术管理'], milestone: '完成1次行业分享' }
    ],
    'default': [
      { year: 1, icon: '📚', title: '基础夯实 · 专业入门', goals: '掌握核心技能，建立专业基础', skills: ['专业技能', '学习方法', '沟通协作'], milestone: '完成1个完整项目' },
      { year: 2, icon: '📊', title: '能力提升 · 项目主导', goals: '独立承担任务，拓展综合能力', skills: ['项目管理', '团队协作', '问题解决'], milestone: '独立完成1个项目' },
      { year: 3, icon: '💡', title: '专业突破 · 策略思维', goals: '成为团队骨干，建立专业影响力', skills: ['战略思维', '领导力', '创新思维'], milestone: '完成1次重要汇报' },
      { year: 4, icon: '👥', title: '管理进阶 · 团队领导', goals: '带领团队，培养下属能力', skills: ['团队管理', '决策能力', '跨部门协作'], milestone: '团队项目成功' },
      { year: 5, icon: '🏆', title: '行业专家 · 影响构建', goals: '成为领域专家，输出方法论', skills: ['行业洞察', '影响力', '战略规划'], milestone: '完成1次行业分享' }
    ]
  };

  const template = branchTemplates[job] || branchTemplates['default'];
  const branches = [];
  for (let i = 0; i < Math.min(years, template.length); i++) {
    const t = template[i];
    branches.push({
      year: t.year,
      icon: t.icon,
      title: t.title,
      goals: t.goals + ' · ' + interest.substring(0, 20),
      skills: t.skills,
      milestone: t.milestone
    });
  }

  return {
    tree: { branches },
    recommendedSkills: ['AI应用', '数据分析', '项目管理', '沟通协作', '领导力'],
    radarData: { skill: 60, experience: 50, learning: 70, adaptability: 55, leadership: 40 },
    event: { icon: '⚡', text: '你被邀请参加一个行业峰会，结识了关键人脉' },
    badges: ['🌟 初露锋芒', '🚀 快速成长', '👑 行业认可']
  };
}

// ============================================
// 3. 测试接口
// ============================================
app.get('/api/test', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: '百宝箱代理服务正常运行',
    config: {
      apiUrl: TBOX_CONFIG.apiUrl,
      hasApiKey: !!TBOX_CONFIG.apiKey,
    }
  });
});

// ============================================
// 4. 健康检查
// ============================================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ============================================
// 5. 提供静态文件服务
// ============================================
app.use(express.static('.'));

// ============================================
// 6. 启动服务器
// ============================================
const PORT = process.env.PORT || 8081;
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(55));
  console.log('🚀 百宝箱代理服务已启动');
  console.log(`📡 本地地址: http://localhost:${PORT}`);
  console.log(`🔗 API端点: http://localhost:${PORT}/api/consult-ai`);
  console.log(`⚡ 快速生成: http://localhost:${PORT}/api/generate-quick`);
  console.log(`🧪 测试接口: http://localhost:${PORT}/api/test`);
  console.log('='.repeat(55));
  console.log('💡 访问: http://localhost:' + PORT + '/index.html');
});
