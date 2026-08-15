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
    if (message.length > 500) query = message.substring(0, 500);
    const requestData = { appId: '202607APmEQJ20464969', query, userId: 'user_' + Date.now(), stream: false };
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
    const { job, education, goal, interest, style, gender, age } = req.body;
    console.log('🎯 技能推荐:', job);
    
    const styleDesc = {
      'default': '稳扎稳打，按部就班，注重基础技能的扎实掌握',
      'cross': '跨界融合，破圈成长，注重多元化技能和跨领域能力',
      'ideal': '追随热爱，追求极致，注重创新能力和理想追求',
      'balanced': '全面开花，综合成长，注重各方面均衡发展'
    };
    
    const prompt = `你是一位资深的职业规划专家。请根据以下用户信息，推荐适合的核心技能。\n\n用户信息：\n- 当前职业：${job.trim()}\n- 性别：${gender || '未填写'}\n- 年龄：${age || '未填写'}岁\n- 教育背景：${education || '未填写'}\n- 职业目标：${goal || '未填写'}\n- 职业兴趣：${interest || '未填写'}\n- 路径风格：${styleDesc[style] || '稳妥'}\n\n请列出 8-12 项最适合该用户的核心技能。\n\n要求：\n1. 只返回技能名称列表，用逗号分隔\n2. 技能名称要精炼、准确（2-6个字）\n3. 技能要紧密结合用户的职业、教育、目标和兴趣\n4. 根据路径风格调整技能侧重点\n5. 覆盖硬技能和软技能\n\n只返回技能列表，不要其他文字。`;
    
    const requestData = { appId: '202607APmEQJ20464969', query: prompt, userId: 'user_' + Date.now(), stream: false };
    const response = await axios.post(TBOX_CONFIG.apiUrl, requestData, {
      headers: { 'Content-Type': 'application/json', 'Authorization': TBOX_CONFIG.apiKey },
      timeout: 250000,
    });
    
    const reply = parseAIResponse(response.data) || '';
    let skills = [];
    
    if (reply) {
      const invalidPrefixes = ['根据', '结合', '搜索', '推荐', '以下', '如下', '建议', '结果', '用户信息', '输出', '格式', '示例'];
      const parts = reply.split(/[,，、\s\n\r\t]+/);
      for (const part of parts) {
        const trimmed = part.trim().replace(/^["'""''【】\[\]()（）]+|["'""''【】\[\]()（）]+$/g, '');
        if (trimmed.length < 2 || trimmed.length > 12) continue;
        if (/^[0-9]+$/.test(trimmed)) continue;
        if (invalidPrefixes.some(p => trimmed.startsWith(p))) continue;
        skills.push(trimmed);
      }
      skills = [...new Set(skills)].slice(0, 12);
    }
    
    if (skills.length < 4) skills = getFallbackSkills(job, education, goal, interest, style);
    
    console.log('✅ 推荐技能:', skills);
    res.json({ success: true, skills });
  } catch (error) {
    console.error('❌ 技能推荐失败:', error.message);
    res.json({ success: true, skills: getFallbackSkills(req.body.job, req.body.education, req.body.goal, req.body.interest, req.body.style), fallback: true });
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
    if (goal.includes('管理') || goal.includes('经理') || goal.includes('总监') || goal.includes('店长')) goalSkills = ['团队管理', '战略规划', '决策能力', '领导力'];
    if (goal.includes('专家') || goal.includes('工程师')) goalSkills = ['深度研究', '技术创新', '专业认证', '行业洞察'];
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
    treeCache.set(sessionId, { data: templateData, userInput, optimized: false, timestamp: Date.now() });
    res.json({ success: true, data: templateData, template: true, sessionId, source: templateData._source || 'template' });

    setTimeout(async () => {
      try {
        console.log('🔄 后台AI优化开始...');
        const targetYears = parseInt(userInput.targetYears) || 5;
        const workYears = parseInt(userInput.years) || 0;
        const prompt = `职业:${userInput.job},${workYears}年,性别:${userInput.gender||''},年龄:${userInput.age||''}岁,目标:${userInput.goal},兴趣:${userInput.interest},技能:${(userInput.skills||[]).join(',')}。生成${targetYears}年职业路径JSON:{"branches":[{...}],"radarData":{...},"challenges":{...},"badges":[...]}只返回JSON`;
        const requestData = { appId: '202607APmEQJ20464969', query: prompt, userId: 'user_' + Date.now(), stream: false };
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
              const icons = ['📚','📝','💡','👥','🏆','🌐','🎯','🌟','🏛️','💎'];
              while (optimizedBranches.length < targetYears) {
                const i = optimizedBranches.length;
                optimizedBranches.push({ year: i+1, icon: icons[i]||'📌', title: `第${i+1}年成长`, goals: '持续成长', skills: ['专业技能'], milestone: `第${i+1}年里程碑` });
              }
              if (optimizedBranches.length > targetYears) optimizedBranches = optimizedBranches.slice(0, targetYears);
              let radarData = result.radarData || templateData.radarData;
              if (workYears === 0) radarData = { ...radarData, experience: 0, leadership: 0 };
              const optimizedData = {
                tree: { branches: optimizedBranches },
                radarData,
                challenges: result.challenges || templateData.challenges,
                badges: result.badges || templateData.badges,
                _isTemplate: false,
                _status: '已优化 ✓'
              };
              treeCache.set(sessionId, { data: optimizedData, userInput, optimized: true, timestamp: Date.now() });
              console.log('✅ 后台AI优化成功');
            }
          }
        }
      } catch (aiError) {
        console.log('⏱️ 优化失败:', aiError.message);
        const cached = treeCache.get(sessionId);
        if (cached) {
          // 使用本地生成器生成更好的数据
          const localData = generateCareerTree(userInput);
          localData._isTemplate = false;
          localData._status = '本地优化版';
          cached.data = localData;
          cached.optimized = true;
          treeCache.set(sessionId, cached);
          console.log('✅ 使用本地优化版');
        }
      }
    }, 100);
  } catch (error) {
    console.error('❌ 生成失败:', error.message);
    res.json({ success: true, data: generateCareerTree(req.body), fallback: true });
  }
});

app.get('/api/get-optimized-tree/:sessionId', async (req, res) => {
  const cached = treeCache.get(req.params.sessionId);
  if (!cached) return res.json({ success: false, error: 'sessionId不存在' });
  if (cached.optimized) return res.json({ success: true, data: cached.data, optimized: true });
  const remaining = Math.max(0, Math.ceil((15000 - (Date.now() - cached.timestamp)) / 1000));
  return res.json({ success: true, data: cached.data, optimized: false, message: `⏳ 优化中（约${remaining}秒）` });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use(express.static(path.join(__dirname, '/')));
const PORT = process.env.PORT || 8081;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 服务已启动 v5.0 端口:${PORT}`));
