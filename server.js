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
        timeout: 2500000,
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
    '高中教师': ['教学设计', '课堂管理', '教育心理学', '学科知识', '沟通表达', '评估反馈', '教育技术', '教育研究'],
    '计算机老师': ['编程教学', '课程设计', '教育技术', '教学管理', '教育心理学', 'Python编程', '在线教学', '教学研究'],
    '老师': ['教学设计', '课堂管理', '教育心理学', '学科知识', '沟通表达', '评估反馈', '教育技术'],
    '教师': ['教学设计', '课堂管理', '教育心理学', '学科知识', '沟通表达', '评估反馈', '教育技术'],
    '医生': ['临床诊断', '医疗技术', '医患沟通', '循证医学', '医疗管理', '团队协作'],
    '产品经理': ['用户研究', '产品设计', '数据分析', '项目管理', '商业分析', '沟通协作'],
    '软件开发': ['编程语言', '系统设计', '数据库', '算法', '调试测试', '团队协作'],
    '设计师': ['UI设计', 'UX研究', '设计工具', '设计思维', '用户测试', '创意表达'],
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
// 4. 生成成长树接口（秒开版）
// ============================================
app.post('/api/generate-tree', async (req, res) => {
  try {
    const userInput = req.body;
    console.log('🌳 生成成长树:', userInput.job);

    // 1. 先立即返回模板数据（秒开）
    const templateData = getFastDefaultTree(userInput);
    
    // 2. 后台异步调用AI优化（不阻塞响应）
    // 用 setTimeout 放到下一个事件循环，不阻塞当前请求
    setTimeout(async () => {
      try {
        console.log('🔄 后台AI优化开始...');
        const prompt = `职业:${userInput.job},${userInput.years}年,目标:${userInput.goal},风格:${userInput.styleLabel},兴趣:${userInput.interest},技能:${(userInput.skills || []).join(',')}。生成${userInput.targetYears || 5}年职业路径JSON，只返回JSON`;

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
            timeout: 20000,
          }
        );

        let reply = parseAIResponse(response.data);
        if (reply) {
          const jsonMatch = reply.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            if (result.branches && result.branches.length > 0) {
              console.log('✅ 后台AI优化成功，数据已更新');
              // 这里可以存储到缓存或数据库，供前端后续获取
              // 目前先打印日志，后续可以添加缓存机制
            }
          }
        }
      } catch (aiError) {
        console.log('⏱️ 后台AI优化超时或失败:', aiError.message);
      }
    }, 100);

    // 立即返回模板数据
    res.json({
      success: true,
      data: templateData,
      template: true
    });

  } catch (error) {
    console.error('❌ 生成树失败:', error.message);
    const defaultData = getFastDefaultTree(req.body);
    res.json({
      success: true,
      data: defaultData,
      fallback: true
    });
  }
});

// ============================================
// 快速默认树模板
// ============================================
function getFastDefaultTree(userInput) {
  const job = userInput.job || '产品经理';
  const years = userInput.targetYears || 5;
  const interest = userInput.interest || '职业发展';
  const styleLabel = userInput.styleLabel || '稳妥晋升';
  
  const templates = {
    '高中教师': [
      { year: 1, icon: '📚', title: '教学精进', goals: '深入研究教材，优化教学方法，提升课堂效率', skills: ['教学设计', '课堂管理', '学科研究'], milestone: '完成1轮教学反思报告' },
      { year: 2, icon: '📝', title: '科研起步', goals: '开展教育科研，撰写教学论文，参与课题研究', skills: ['教育研究', '学术写作', '数据分析'], milestone: '发表1篇教学论文' },
      { year: 3, icon: '💡', title: '特色形成', goals: '形成个人教学风格，打造特色课程品牌', skills: ['课程开发', '创新教学', '教育技术'], milestone: '完成1门特色课程设计' },
      { year: 4, icon: '👥', title: '引领示范', goals: '带领教研团队，培养青年教师，发挥示范作用', skills: ['团队管理', '教研引领', '教学指导'], milestone: '指导1位青年教师获奖' },
      { year: 5, icon: '🏆', title: '特级教师', goals: '成为特级教师，发挥区域示范引领作用', skills: ['教学领导', '学术影响', '教育创新'], milestone: '完成1次市级公开课' }
    ],
    '计算机老师': [
      { year: 1, icon: '📚', title: '教学筑基', goals: '掌握教学方法，建立课堂管理，夯实教学基础', skills: ['教学设计', '课堂管理', '编程教学'], milestone: '完成1轮完整课程教学' },
      { year: 2, icon: '💻', title: '技术融合', goals: '编程技术与教学深度融合，创新教学模式', skills: ['教育技术', '在线教学', '课程开发'], milestone: '开发1门在线编程课程' },
      { year: 3, icon: '📊', title: '教学研究', goals: '开展教学研究，形成个人教学特色', skills: ['教育研究', '学术写作', '数据驱动'], milestone: '完成1篇教学研究论文' },
      { year: 4, icon: '👥', title: '团队引领', goals: '带领学科团队，推动课程体系改革', skills: ['团队管理', '学科建设', '教学管理'], milestone: '完成1个教学改革项目' },
      { year: 5, icon: '🏆', title: '学科带头人', goals: '成为计算机学科带头人，推动教育创新', skills: ['学科引领', '教育战略', '行业影响'], milestone: '完成1次区域学术报告' }
    ],
    '老师': [
      { year: 1, icon: '📚', title: '教学入门', goals: '掌握教学基本功，建立课堂秩序，站稳讲台', skills: ['教学设计', '课堂管理', '教育心理学'], milestone: '完成1轮完整课程' },
      { year: 2, icon: '📝', title: '教学精进', goals: '优化教学方法，设计创新课程，提升教学质量', skills: ['课程设计', '教育技术', '评估反馈'], milestone: '开发1门新课程' },
      { year: 3, icon: '💡', title: '教育研究', goals: '开展教学研究，形成个人教学风格', skills: ['教育研究', '创新教学', '教育技术'], milestone: '发表1篇教学论文' },
      { year: 4, icon: '👥', title: '教研引领', goals: '带领教研团队，培养青年教师，推动学科建设', skills: ['教研管理', '团队领导', '课程体系'], milestone: '指导1位青年教师' },
      { year: 5, icon: '🏆', title: '教育专家', goals: '成为区域教育专家，引领教育改革与发展', skills: ['教育战略', '课程体系', '教育领导力'], milestone: '完成1次区域讲座' }
    ],
    '产品经理': [
      { year: 1, icon: '📚', title: '产品筑基', goals: '深入用户研究，建立产品思维，完成需求分析', skills: ['用户研究', '产品设计', '数据分析'], milestone: '完成1个完整PRD' },
      { year: 2, icon: '📊', title: '数据驱动', goals: '数据驱动决策，独立负责产品线，优化用户体验', skills: ['数据分析', '项目管理', '沟通协作'], milestone: '上线1个独立功能' },
      { year: 3, icon: '💡', title: '商业思维', goals: '理解商业模式，制定产品路线图，推动业务增长', skills: ['商业分析', '战略规划', '领导力'], milestone: '完成1次战略汇报' },
      { year: 4, icon: '👥', title: '团队领导', goals: '带领产品团队，培养跨部门协作能力', skills: ['团队管理', '创新思维', '市场洞察'], milestone: '团队成功交付项目' },
      { year: 5, icon: '🏆', title: '产品总监', goals: '构建产品生态，输出方法论，成为行业专家', skills: ['产品战略', '行业洞察', '技术管理'], milestone: '完成1次行业分享' }
    ]
  };

  // 匹配模板
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
      goals: t.goals + ' · ' + interest.substring(0, 15),
      skills: t.skills,
      milestone: t.milestone
    });
  }

  // 根据风格调整
  const styleMap = {
    '跨界融合': { addTitle: '跨界·', addSkills: ['跨界思维', '资源整合'] },
    '理想主义': { addTitle: '卓越·', addSkills: ['创新突破', '追求极致'] },
    '均衡发展': { addTitle: '均衡·', addSkills: ['综合能力', '全面发展'] },
    '稳妥晋升': { addTitle: '', addSkills: [] }
  };
  const styleConfig = styleMap[styleLabel] || styleMap['稳妥晋升'];
  if (styleConfig.addTitle && branches.length > 0) {
    branches[0].title = styleConfig.addTitle + branches[0].title;
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
// 5. 健康检查
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
// 6. 静态文件服务
// ============================================
app.use(express.static(path.join(__dirname, '/')));

// ============================================
// 7. 启动服务器
// ============================================
const PORT = process.env.PORT || 8081;
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(55));
  console.log('🚀 服务已启动 (秒开版)');
  console.log(`📡 端口: ${PORT}`);
  console.log(`🌐 访问: http://localhost:${PORT}`);
  console.log('='.repeat(55));
});
