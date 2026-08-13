const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

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
// 工具函数：提取JSON
// ============================================
function extractJSON(text) {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch (e) {
      return null;
    }
  }
  return null;
}

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
// 1. 咨询AI接口（完整版）
// ============================================
app.post('/api/consult-ai', async (req, res) => {
  try {
    const { message, context } = req.body;
    console.log('📨 收到咨询请求:', message.substring(0, 50) + '...');

    // 智能截取
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
        timeout: 60000,
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
// 2. 快速咨询接口（优化版）
// ============================================
app.post('/api/consult-ai-fast', async (req, res) => {
  try {
    const { message, context } = req.body;
    console.log('⚡ 快速咨询');

    // 智能精简消息
    let query = message;
    if (message.length > 500) {
      // 提取关键信息
      const lines = message.split('\n');
      const important = lines.filter(line => 
        line.includes('我是') || line.includes('职业') || 
        line.includes('目标') || line.includes('兴趣') ||
        line.includes('技能') || line.includes('建议') ||
        line.includes('计划') || line.includes('年')
      );
      query = important.join('\n').substring(0, 500);
      
      // 如果提取后太短，保留前300字符
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
        timeout: 25000, // 25秒超时
      }
    );

    const reply = parseAIResponse(response.data) || 'AI未返回有效内容';

    res.json({ success: true, reply });

  } catch (error) {
    console.error('❌ 快速咨询失败:', error.message);
    res.json({
      success: false,
      error: error.message || '服务暂时不可用'
    });
  }
});

// ============================================
// 3. 技能推荐接口（新增 - 极速版）
// ============================================
app.post('/api/recommend-skills', async (req, res) => {
  try {
    const { job, education, goal, interest, style } = req.body;
    console.log('🎯 技能推荐:', job);

    // 构建精简的prompt
    const styleDesc = {
      'default': '稳扎稳打，注重基础',
      'cross': '跨界融合，多元发展',
      'ideal': '创新突破，追求极致',
      'balanced': '全面均衡，综合成长'
    };

    const prompt = `职业：${job}，教育：${education}，目标：${goal}，兴趣：${interest}，风格：${styleDesc[style] || '稳扎稳打'}。
请推荐8-12项核心技能，只返回技能名称，用逗号分隔，不要其他文字。`;

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
        timeout: 15000, // 15秒超时（技能推荐应该更快）
      }
    );

    let reply = parseAIResponse(response.data);
    
    // 解析技能列表
    let skills = [];
    if (reply) {
      // 尝试提取中文技能
      const matches = reply.match(/[\u4e00-\u9fa5]{2,6}/g);
      if (matches && matches.length > 0) {
        skills = matches.slice(0, 12);
      } else {
        // 按逗号分割
        skills = reply.split(/[,，、\s]+/).filter(s => {
          const trimmed = s.trim();
          return trimmed.length > 0 && trimmed.length < 15 && !/^[0-9]+$/.test(trimmed);
        }).slice(0, 12);
      }
    }

    if (skills.length < 4) {
      // 如果AI返回的技能太少，使用备选
      skills = getFallbackSkills(job, education, goal, interest, style);
    }

    res.json({
      success: true,
      skills: skills
    });

  } catch (error) {
    console.error('❌ 技能推荐失败:', error.message);
    // 返回备选技能
    const { job, education, goal, interest, style } = req.body;
    const skills = getFallbackSkills(job, education, goal, interest, style);
    res.json({
      success: true,
      skills: skills,
      fallback: true
    });
  }
});

// ============================================
// 备选技能库
// ============================================
function getFallbackSkills(job, education, goal, interest, style) {
  const baseMap = {
    '计算机老师': ['编程教学', '课程设计', '教育技术', '教学管理', '教育心理学', 'Python编程', '在线教学', '教学研究'],
    '老师': ['教学设计', '课堂管理', '教育心理学', '学科知识', '沟通表达', '评估反馈', '教育技术'],
    '教师': ['教学设计', '课堂管理', '教育心理学', '学科知识', '沟通表达', '评估反馈', '教育技术'],
    '医生': ['临床诊断', '医疗技术', '医患沟通', '循证医学', '医疗管理', '团队协作'],
    '护士': ['护理技术', '患者关怀', '医疗记录', '急救技能', '沟通协作', '健康宣教'],
    '产品经理': ['用户研究', '产品设计', '数据分析', '项目管理', '商业分析', '沟通协作'],
    '软件开发': ['编程语言', '系统设计', '数据库', '算法', '调试测试', '团队协作'],
    '设计师': ['UI设计', 'UX研究', '设计工具', '设计思维', '用户测试', '创意表达'],
    '律师': ['法律研究', '法律写作', '诉讼技巧', '谈判能力', '客户沟通'],
    '金融分析师': ['财务分析', '投资研究', '风险管理', '数据建模', '行业分析'],
    '建筑师': ['建筑设计', '空间规划', '建筑技术', '项目管理', '可持续设计'],
    '人力资源': ['招聘管理', '绩效管理', '人才发展', '员工关系', '组织发展'],
    '运营': ['用户运营', '数据分析', '增长策略', '内容策划', '项目管理'],
    '市场营销': ['品牌营销', '数字营销', '市场分析', '内容创作', '活动策划'],
  };

  let baseSkills = ['专业技能', '沟通协作', '问题解决', '持续学习', '团队合作'];
  for (const [key, value] of Object.entries(baseMap)) {
    if (job && (job.includes(key) || key.includes(job))) {
      baseSkills = value;
      break;
    }
  }

  // 根据兴趣添加技能
  const interestSkills = [];
  if (interest) {
    if (interest.includes('AI') || interest.includes('智能') || interest.includes('数据')) {
      interestSkills.push('数据分析', 'AI应用');
    }
    if (interest.includes('教育') || interest.includes('教学') || interest.includes('学习')) {
      interestSkills.push('教学能力', '教育技术');
    }
    if (interest.includes('管理') || interest.includes('领导')) {
      interestSkills.push('团队管理', '领导力');
    }
    if (interest.includes('编程') || interest.includes('开发')) {
      interestSkills.push('编程能力', '技术架构');
    }
    if (interest.includes('设计') || interest.includes('创新')) {
      interestSkills.push('创新思维', '设计能力');
    }
  }

  // 根据目标添加技能
  const goalSkills = [];
  if (goal) {
    if (goal.includes('管理') || goal.includes('总监') || goal.includes('负责')) {
      goalSkills.push('战略规划', '团队管理');
    }
    if (goal.includes('专家') || goal.includes('研究') || goal.includes('学术')) {
      goalSkills.push('研究能力', '深度思考');
    }
    if (goal.includes('创业') || goal.includes('创始人')) {
      goalSkills.push('商业思维', '资源整合');
    }
  }

  // 根据风格添加技能
  const styleSkills = {
    'cross': ['跨界思维', '资源整合', '创新融合'],
    'ideal': ['创新思维', '自我驱动', '突破常规'],
    'balanced': ['综合能力', '时间管理', '全面视角'],
    'default': ['基础扎实', '专业深耕', '持续进步']
  };

  const allSkills = [
    ...baseSkills, 
    ...interestSkills, 
    ...goalSkills,
    ...(styleSkills[style] || styleSkills['default'])
  ];
  
  const uniqueSkills = [...new Set(allSkills)].filter(s => s && s.length > 0);
  return uniqueSkills.slice(0, 12);
}

// ============================================
// 4. 流式咨询接口
// ============================================
app.post('/api/consult-ai-stream', async (req, res) => {
  try {
    const { message, context } = req.body;
    console.log('📨 流式咨询开始');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    let query = message;
    if (message.length > 800) {
      const lines = message.split('\n');
      const important = lines.filter(line => 
        line.includes('我是') || line.includes('目标') || 
        line.includes('风格') || line.includes('技能') ||
        line.includes('请回答') || line.includes('建议')
      );
      query = important.join('\n').substring(0, 800);
    }

    const requestData = {
      appId: '202607APmEQJ20464969',
      query: query,
      userId: 'user_' + Date.now(),
      stream: true,
    };

    const response = await axios({
      method: 'post',
      url: TBOX_CONFIG.apiUrl,
      data: requestData,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': TBOX_CONFIG.apiKey,
      },
      responseType: 'stream',
      timeout: 120000,
    });

    let fullReply = '';
    let hasContent = false;

    response.data.on('data', (chunk) => {
      try {
        const text = chunk.toString();
        const lines = text.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            if (data === '[DONE]') continue;
            
            try {
              const json = JSON.parse(data);
              let content = '';
              
              if (json.data && json.data.result) {
                for (const result of json.data.result) {
                  if (result.chunk) {
                    if (result.mediaType === 'text') {
                      content += result.chunk;
                    } else {
                      try {
                        const chunkData = JSON.parse(result.chunk);
                        content += chunkData.text || chunkData.content || '';
                      } catch (e) {
                        content += result.chunk;
                      }
                    }
                  }
                }
              }
              
              if (content) {
                hasContent = true;
                fullReply += content;
                res.write(`data: ${JSON.stringify({ content })}\n\n`);
              }
            } catch (e) {}
          }
        }
      } catch (e) {}
    });

    response.data.on('end', () => {
      if (!hasContent) {
        fullReply = 'AI未返回有效内容，请稍后重试';
        res.write(`data: ${JSON.stringify({ content: fullReply })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ done: true, fullReply })}\n\n`);
      res.end();
      console.log('✅ 流式完成，长度:', fullReply.length);
    });

    response.data.on('error', (error) => {
      console.error('流式错误:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    });

  } catch (error) {
    console.error('❌ 流式失败:', error.message);
    res.write(`data: ${JSON.stringify({ error: '服务暂时不可用，请稍后重试' })}\n\n`);
    res.end();
  }
});

// ============================================
// 5. 生成成长树接口（优化版）
// ============================================
app.post('/api/generate-tree', async (req, res) => {
  try {
    const userInput = req.body;
    console.log('🌳 生成成长树:', userInput.job);

    const styleDesc = {
      'default': '稳扎稳打，按部就班，注重基础技能的扎实掌握和稳步晋升',
      'cross': '跨界融合，破圈成长，注重多元化技能和跨领域能力，打破职业边界',
      'ideal': '追随热爱，追求极致，注重创新能力和理想追求，不拘一格',
      'balanced': '全面开花，综合成长，注重各方面均衡发展，兼顾广度与深度'
    };

    const prompt = `你是一位顶级的职业规划专家。请根据以下用户信息，生成一份个性化的职业成长树路径。

用户信息：
- 姓名：${userInput.name}
- 当前职业：${userInput.job}
- 工作年限：${userInput.years}年
- 教育背景：${userInput.education}
- 职业目标（5年后）：${userInput.goal}
- 职业兴趣：${userInput.interest}
- 已有技能：${(userInput.skills || []).join('、')}
- 规划周期：${userInput.targetYears || 5}年
- 路径风格：${userInput.styleLabel || '稳妥晋升'} - ${styleDesc[userInput.style] || '稳扎稳打'}

请生成一份${userInput.targetYears || 5}年的职业发展路径，以树形结构展示。

要求：
1. 每个阶段包含：年份、阶段标题（有创意）、阶段目标（具体可执行）、核心技能（3-5个）、里程碑事件
2. 根据用户的职业兴趣，将兴趣融入到每个阶段的描述中
3. 路径风格必须体现在每个阶段的标题、目标和技能中
4. 推荐3-5个用户应该学习的新技能
5. 生成5个维度的能力评估值（专业技能、工作经验、学习能力、适应能力、领导力），范围0-100
6. 生成一个"意外事件"（一个职业机遇或挑战）
7. 生成3个成就徽章

输出格式为 JSON，结构如下：
{
  "tree": {
    "branches": [
      {"year": 1, "icon": "📚", "title": "阶段标题", "goals": "阶段目标", "skills": ["技能1", "技能2"], "milestone": "里程碑"}
    ]
  },
  "recommendedSkills": ["推荐技能1", "推荐技能2"],
  "radarData": {"skill": 60, "experience": 50, "learning": 70, "adaptability": 55, "leadership": 40},
  "event": {"icon": "⚡", "text": "机遇描述"},
  "badges": ["徽章1", "徽章2", "徽章3"]
}

只返回JSON，不要其他文字。`;

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
        timeout: 90000,
      }
    );

    let reply = parseAIResponse(response.data);
    
    if (!reply) {
      throw new Error('AI未返回有效内容');
    }

    // 提取JSON
    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    let result;
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[0]);
    } else {
      result = JSON.parse(reply);
    }

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ 生成树失败:', error.message);
    res.json({
      success: false,
      error: error.message || 'AI生成失败，请重试'
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
