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
        timeout: 25000,
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
// 3. 技能推荐接口（极速版）
// ============================================
app.post('/api/recommend-skills', async (req, res) => {
  try {
    const { job, education, goal, interest, style } = req.body;
    console.log('🎯 技能推荐:', job);

    // 极简prompt - 只传用户填写的信息
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
        timeout: 15000,
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
      skills = getFallbackSkills(job, education, goal, interest, style);
    }

    res.json({
      success: true,
      skills: skills
    });

  } catch (error) {
    console.error('❌ 技能推荐失败:', error.message);
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

  const styleSkills = {
    'cross': ['跨界思维', '资源整合', '创新融合'],
    'ideal': ['创新思维', '自我驱动', '突破常规'],
    'balanced': ['综合能力', '时间管理', '全面视角'],
    'default': ['基础扎实', '专业深耕', '持续进步']
  };

  const allSkills = [...baseSkills, ...(styleSkills[style] || styleSkills['default'])];
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
// 5. 生成成长树接口（极速版 - 只传用户信息）
// ============================================
app.post('/api/generate-tree', async (req, res) => {
  try {
    const userInput = req.body;
    console.log('🌳 生成成长树:', userInput.job);

    // 极简prompt - 只传用户填写的信息，不要任何多余描述
    const prompt = `职业:${userInput.job},年限:${userInput.years}年,目标:${userInput.goal},风格:${userInput.styleLabel},兴趣:${userInput.interest},技能:${(userInput.skills || []).join(',')}。生成${userInput.targetYears || 5}年职业路径JSON，只返回JSON`;

    const requestData = {
      appId: '202607APmEQJ20464969',
      query: prompt,
      userId: 'user_' + Date.now(),
      stream: false,
    };

    // 超时20秒
    const response = await axios.post(
      TBOX_CONFIG.apiUrl,
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': TBOX_CONFIG.apiKey,
        },
        timeout: 20000,
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

    // 确保数据结构完整
    const finalData = {
      tree: { branches: result.branches || [] },
      recommendedSkills: result.recommendedSkills || [],
      radarData: result.radarData || { skill: 60, experience: 50, learning: 70, adaptability: 55, leadership: 40 },
      event: result.event || { icon: '⚡', text: '抓住机遇，持续成长！' },
      badges: result.badges || ['🌟 初露锋芒', '🚀 快速成长', '👑 行业认可']
    };

    res.json({
      success: true,
      data: finalData
    });

  } catch (error) {
    console.error('❌ 生成树失败:', error.message);
    // 返回快速模板
    const defaultData = getFastDefaultTree(req.body);
    res.json({
      success: true,
      data: defaultData,
      fallback: true
    });
  }
});

// ============================================
// 快速默认树（不依赖AI，秒返回）
// ============================================
function getFastDefaultTree(userInput) {
  const job = userInput.job || '产品经理';
  const years = userInput.targetYears || 5;
  
  const templates = {
    '计算机老师': [
      { year: 1, icon: '📚', title: '教学筑基', goals: '掌握教学方法，建立课堂管理', skills: ['教学设计', '课堂管理', '编程教学'], milestone: '完成1轮完整课程' },
      { year: 2, icon: '💻', title: '技术融合', goals: '编程技术与教学深度融合', skills: ['教育技术', '在线教学', '课程开发'], milestone: '开发1门在线课程' },
      { year: 3, icon: '📊', title: '教学研究', goals: '开展教学研究，形成个人特色', skills: ['教育研究', '学术写作', '数据驱动'], milestone: '完成1篇研究论文' },
      { year: 4, icon: '👥', title: '团队引领', goals: '带领学科团队，推动课程改革', skills: ['团队管理', '学科建设', '教学管理'], milestone: '完成1个教改项目' },
      { year: 5, icon: '🏆', title: '学科带头人', goals: '成为学科带头人，推动教育创新', skills: ['学科引领', '教育战略', '行业影响'], milestone: '完成1次学术报告' }
    ],
    '产品经理': [
      { year: 1, icon: '📚', title: '产品筑基', goals: '深入用户研究，建立产品思维', skills: ['用户研究', '产品设计', '数据分析'], milestone: '完成1个完整PRD' },
      { year: 2, icon: '📊', title: '数据驱动', goals: '数据驱动决策，独立负责产品线', skills: ['数据分析', '项目管理', '沟通协作'], milestone: '上线1个独立功能' },
      { year: 3, icon: '💡', title: '商业思维', goals: '理解商业模式，制定产品路线图', skills: ['商业分析', '战略规划', '领导力'], milestone: '完成1次战略汇报' },
      { year: 4, icon: '👥', title: '团队领导', goals: '带领团队，培养跨部门协作', skills: ['团队管理', '创新思维', '市场洞察'], milestone: '团队成功交付项目' },
      { year: 5, icon: '🏆', title: '产品总监', goals: '构建产品生态，输出方法论', skills: ['产品战略', '行业洞察', '技术管理'], milestone: '完成1次行业分享' }
    ],
    '教师': [
      { year: 1, icon: '📚', title: '教学入门', goals: '掌握教学基本功，建立课堂秩序', skills: ['教学设计', '课堂管理', '教育心理学'], milestone: '完成1轮完整课程' },
      { year: 2, icon: '📝', title: '教学精进', goals: '优化教学方法，设计创新课程', skills: ['课程设计', '教育技术', '评估反馈'], milestone: '开发1门新课程' },
      { year: 3, icon: '💡', title: '教育研究', goals: '开展教学研究，形成个人风格', skills: ['教育研究', '创新教学', '教育技术'], milestone: '发表1篇教学论文' },
      { year: 4, icon: '👥', title: '教研引领', goals: '带领教研团队，培养青年教师', skills: ['教研管理', '团队领导', '课程体系'], milestone: '指导1位青年教师' },
      { year: 5, icon: '🏆', title: '教育专家', goals: '成为区域教育专家，引领教育改革', skills: ['教育战略', '课程体系', '教育领导力'], milestone: '完成1次区域讲座' }
    ]
  };

  let template = templates['产品经理'];
  for (const [key, value] of Object.entries(templates)) {
    if (job.includes(key) || key.includes(job)) {
      template = value;
      break;
    }
  }

  const branches = [];
  for (let i = 0; i < Math.min(years, template.length); i++) {
    const t = template[i];
    branches.push({
      year: t.year,
      icon: t.icon,
      title: t.title,
      goals: t.goals,
      skills: t.skills,
      milestone: t.milestone
    });
  }

  return {
    tree: { branches },
    recommendedSkills: ['AI应用', '数据分析', '项目管理', '沟通协作', '领导力'],
    radarData: { skill: 65, experience: 55, learning: 75, adaptability: 60, leadership: 45 },
    event: { icon: '⚡', text: '你被邀请参加一个行业峰会，结识了关键人脉' },
    badges: ['🌟 初露锋芒', '🚀 快速成长', '👑 行业认可']
  };
}

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
  console.log('🚀 服务已启动 (极速版)');
  console.log(`📡 端口: ${PORT}`);
  console.log(`🌐 访问: http://localhost:${PORT}`);
  console.log('='.repeat(55));
});
