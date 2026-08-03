const express = require('express');
const cors = require('cors');
const axios = require('axios');

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
        timeout: 60000,  // 增加到60秒
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
// 2. 测试接口
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
// 3. 健康检查
// ============================================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ============================================
// 4. 提供静态文件服务
// ============================================
app.use(express.static('.'));

// ============================================
// 5. 启动服务器
// ============================================
const PORT = process.env.PORT || 8081;
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(55));
  console.log('🚀 百宝箱代理服务已启动');
  console.log(`📡 本地地址: http://localhost:${PORT}`);
  console.log(`🔗 API端点: http://localhost:${PORT}/api/consult-ai`);
  console.log(`🧪 测试接口: http://localhost:${PORT}/api/test`);
  console.log(`📋 API地址: ${TBOX_CONFIG.apiUrl}`);
  console.log(`📱 AppID: 202607APmEQJ20464969`);
  console.log('='.repeat(55));
  console.log('💡 访问: http://localhost:' + PORT + '/index.html');
});