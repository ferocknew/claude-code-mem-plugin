#!/usr/bin/env node
/**
 * LLM 分析器 - 使用 Claude API 分析对话内容
 * 提取观察(observations)和生成总结
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.claude-code-mem');
const LOG_FILE = path.join(DATA_DIR, 'injection_debug.log');

/**
 * 获取本地时间字符串
 */
function getLocalTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * 日志函数
 */
function log(message, data = null) {
  const timestamp = getLocalTimestamp();
  const logEntry = {
    timestamp,
    source: 'llm_analyzer',
    message,
    data,
  };
  
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n', 'utf8');
  } catch (e) {
    // 忽略日志错误
  }
  
  console.error(`[Analyzer] ${message}`);
}

// 观察类型定义
const OBSERVATION_TYPES = ['bugfix', 'feature', 'refactor', 'discovery', 'decision', 'change'];
const CONCEPT_TAGS = [
  'how-it-works',
  'why-it-exists',
  'what-changed',
  'problem-solution',
  'gotcha',
  'pattern',
  'trade-off',
];

/**
 * 从环境变量获取 API Key 和配置
 */
function getApiConfig() {
  // 优先使用 Claude Code 提供的认证 Token
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
  const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  const defaultModel = process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || 'claude-3-5-haiku-20241022';

  // 如果有 auth token，优先使用
  if (authToken) {
    log('API config found', { source: 'claude_code', model: defaultModel, baseUrl });
    return {
      apiKey: authToken,
      baseUrl: baseUrl,
      model: defaultModel,
      source: 'claude_code'
    };
  }

  // 回退到用户配置的 API Key
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (apiKey) {
    // 用户配置也使用环境变量中的模型，如果没有则使用默认值
    const userModel = process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || 'claude-3-5-haiku-20241022';
    log('API config found', { source: 'user_config', model: userModel, baseUrl });
    return {
      apiKey: apiKey,
      baseUrl: baseUrl,
      model: userModel,
      source: 'user_config'
    };
  }

  log('No API Key found', { 
    checked_vars: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
    all_env_keys: Object.keys(process.env).filter(k => k.includes('ANTHROPIC') || k.includes('CLAUDE'))
  });
  console.error('❌ No API Key found. Please set ANTHROPIC_API_KEY or ensure Claude Code auth is configured');
  return null;
}

/**
 * 调用 Claude API(支持自定义 base URL,包括智谱AI)
 */
async function callClaudeAPI(prompt, config) {
  log('Calling Claude API', { 
    model: config.model, 
    baseUrl: config.baseUrl,
    promptLength: prompt.length 
  });
  
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: config.model,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // 解析 base URL - 确保不重复添加路径
    let apiUrl;
    try {
      // 如果 baseUrl 已经包含完整路径，直接使用
      if (config.baseUrl.includes('/v1/messages')) {
        apiUrl = new URL(config.baseUrl);
      } else {
        // 否则添加 /v1/messages 路径
        const baseUrlClean = config.baseUrl.replace(/\/$/, ''); // 移除末尾斜杠
        apiUrl = new URL(baseUrlClean + '/v1/messages');
      }
    } catch (error) {
      log('Invalid base URL', { baseUrl: config.baseUrl, error: error.message });
      throw new Error(`Invalid base URL: ${config.baseUrl}`);
    }

    // 设置请求头
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    };

    // 根据环境变量决定使用哪种认证方式
    // 如果设置了 ANTHROPIC_USE_BEARER_AUTH=true，使用 Bearer token
    // 否则使用 x-api-key (Anthropic 官方格式)
    const useBearerAuth = process.env.ANTHROPIC_USE_BEARER_AUTH === 'true';
    
    if (useBearerAuth) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    } else {
      headers['x-api-key'] = config.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    }

    // SSL 证书验证控制
    // 如果设置了 ANTHROPIC_SKIP_SSL_VERIFY=true，跳过证书验证
    const skipSslVerify = process.env.ANTHROPIC_SKIP_SSL_VERIFY === 'true';

    // 根据协议选择 http 或 https 模块
    const isHttps = apiUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    
    log('Request details', {
      url: apiUrl.href,
      protocol: apiUrl.protocol,
      hostname: apiUrl.hostname,
      path: apiUrl.pathname,
      useBearerAuth,
      skipSslVerify: isHttps ? skipSslVerify : 'N/A (HTTP)',
      headers: { ...headers, Authorization: headers.Authorization ? '***' : undefined, 'x-api-key': headers['x-api-key'] ? '***' : undefined }
    });

    const options = {
      hostname: apiUrl.hostname,
      port: apiUrl.port || (isHttps ? 443 : 80),
      path: apiUrl.pathname + apiUrl.search,
      method: 'POST',
      headers: headers,
    };
    
    // 只有 HTTPS 才需要设置 SSL 验证选项
    if (isHttps) {
      options.rejectUnauthorized = !skipSslVerify;
    }

    const req = httpModule.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        log('API response received', { 
          statusCode: res.statusCode, 
          contentType: res.headers['content-type'],
          dataLength: responseData.length 
        });

        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(responseData);
            log('API response parsed successfully');
            resolve(parsed);
          } catch (error) {
            log('Failed to parse API response', { error: error.message, response: responseData.substring(0, 200) });
            reject(new Error(`Failed to parse API response: ${error.message}`));
          }
        } else {
          log('API request failed', { statusCode: res.statusCode, response: responseData.substring(0, 500) });
          reject(new Error(`API request failed with status ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on('error', (error) => {
      log('API request error', { error: error.message, code: error.code, stack: error.stack });
      reject(new Error(`API request error: ${error.message}`));
    });

    req.write(data);
    req.end();
  });
}

/**
 * 提取对话中的观察
 */
async function extractObservations(conversationText, apiKey) {
  const prompt = `分析以下对话内容，提取关键的技术观察(observations)。

对话内容:
${conversationText}

请以 JSON 格式返回观察列表。每个观察应包含:
- type: 观察类型，从以下选择: ${OBSERVATION_TYPES.join(', ')}
- title: 简短标题(最多50字符)
- narrative: 详细描述(2-3句话)
- concepts: 相关概念标签，从以下选择: ${CONCEPT_TAGS.join(', ')}
- files: 涉及的文件路径列表(如果有)

只返回 JSON 数组，不要其他文字。格式示例:
[
  {
    "type": "bugfix",
    "title": "修复内存泄漏问题",
    "narrative": "发现在循环中创建了过多的闭包导致内存泄漏。通过改用 WeakMap 解决了问题。",
    "concepts": ["problem-solution", "gotcha"],
    "files": ["src/memory.js"]
  }
]`;

  try {
    const response = await callClaudeAPI(prompt, apiKey);
    const content = response.content[0].text;

    // 提取 JSON 内容
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('❌ No JSON array found in API response');
      return [];
    }

    const observations = JSON.parse(jsonMatch[0]);
    return Array.isArray(observations) ? observations : [];
  } catch (error) {
    console.error(`❌ Failed to extract observations: ${error.message}`);
    return [];
  }
}

/**
 * 生成会话总结 - 类似截图格式的综合分析
 */
async function generateSessionSummary(conversationText, config) {
  const prompt = `请分析以下会话内容，生成一个结构化的会话总结。

${conversationText}

请以 JSON 格式返回，包含以下字段（所有内容必须用中文，简明概要！）：

1. **investigated** (🔍 调查内容): 用户询问或请求了什么？尝试解决什么问题？(2-3句中文描述)
2. **learned** (💡 学到什么): 从这次对话中获得的关键知识点或发现(2-3句中文描述)
3. **completed** (✅ 完成内容): 实际完成了什么？有哪些具体成果？根据工具执行历史推测(2-3句中文描述)
4. **next_steps** (➡️ 后续步骤): 建议的后续行动或待办事项(可选，1-2句中文描述)
5. **observations** (数组): 技术观察列表，每个包含:
   - type: 观察类型(${OBSERVATION_TYPES.join(', ')})
   - title: 简短的中文标题(最多30字符)
   - insight: 关键洞察的中文描述(1-2句话)
   - concepts: 相关概念(从 ${CONCEPT_TAGS.join(', ')} 中选择)
   - files: 相关文件路径(如果有)

重要要求：
- 所有文本内容必须使用简体中文
- 描述要具体、清晰、专业
- 如果没有助手响应，基于用户请求和工具执行历史推测完成的工作
- 只返回 JSON 对象，不要其他文字

格式示例:
{
  "investigated": "用户想要了解 web 订单管理页面的结构和实现方式，需要查看相关代码文件。",
  "learned": "订单管理模块使用 React 和 Ant Design 实现，包含主逻辑文件 main.ts 和 UI 文件 index.tsx，支持筛选、分页等功能。",
  "completed": "完成了订单管理模块的结构分析，识别了所有关键文件、组件、数据流和用户界面特性。系统提供了 15+ 个数据字段。",
  "next_steps": "用户请求查看订单管理页面，已成功记录详细的结构和功能信息。",
  "observations": [
    {
      "type": "feature",
      "title": "订单管理模块架构",
      "insight": "使用 React 模块化设计，main.ts 包含业务逻辑，index.tsx 提供 UI，通过 URL 参数实现跨页面导航。",
      "concepts": ["pattern", "how-it-works"],
      "files": ["web/src/pages/order_management/main.ts", "web/src/pages/order_management/index.tsx"]
    }
  ]
}`;

  try {
    const response = await callClaudeAPI(prompt, config);
    const content = response.content[0].text;

    // 提取 JSON 内容
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('❌ No JSON object found in API response');
      return null;
    }

    const summary = JSON.parse(jsonMatch[0]);
    return {
      ...summary,
      analyzed_at: new Date().toISOString(),
      model_used: config.model,
      source: config.source,
    };
  } catch (error) {
    console.error(`❌ Failed to generate session summary: ${error.message}`);
    return null;
  }
}

/**
 * 分析会话 - 优化版：基于用户输入和工具执行历史
 */
async function analyzeSession(sessionData) {
  const config = getApiConfig();
  if (!config) {
    return null;
  }

  console.error(`🔄 Using ${config.source} auth with model: ${config.model}`);

  // 提取用户消息、助手响应和工具执行
  const userMessages = [];
  const assistantMessages = [];
  const toolExecutions = [];

  for (const record of sessionData) {
    if (record.type === 'user_message') {
      userMessages.push(record.content);
    } else if (record.type === 'assistant_message') {
      assistantMessages.push(record.content);
    } else if (record.type === 'tool_execution') {
      toolExecutions.push(record.tool_name);
    }
  }

  // 检查是否有足够的对话内容
  if (userMessages.length === 0) {
    console.error('⚠️  No user messages to analyze');
    return null;
  }
  
  // 如果没有助手响应，记录警告但继续分析
  if (assistantMessages.length === 0) {
    console.error('⚠️  No assistant messages found, will analyze based on user request and tool executions');
  }

  // 构建对话文本
  let conversationText = '=== 用户请求 ===\n';
  userMessages.forEach((msg, i) => {
    conversationText += `${i + 1}. ${msg}\n`;
  });

  // 如果有助手响应，添加助手响应
  if (assistantMessages.length > 0) {
    conversationText += '\n=== 助手响应摘要 ===\n';
    const recentResponses = assistantMessages.slice(-3);
    recentResponses.forEach((msg, i) => {
      const truncated = msg.length > 500 ? msg.substring(0, 500) + '...' : msg;
      conversationText += `${i + 1}. ${truncated}\n`;
    });
  } else {
    conversationText += '\n=== 助手响应 ===\n';
    conversationText += '(无助手响应，请基于用户请求和工具执行推测完成的工作)\n';
  }

  // 添加工具执行历史（帮助理解上下文）
  if (toolExecutions.length > 0) {
    conversationText += '\n=== 工具执行历史 ===\n';
    const uniqueTools = [...new Set(toolExecutions)];
    conversationText += `执行的工具: ${uniqueTools.join(', ')}\n`;
    conversationText += `总共执行: ${toolExecutions.length} 次\n`;
  }

  console.error('🔄 Analyzing session with Claude API...');
  console.error(`📊 Session stats: ${userMessages.length} user messages, ${assistantMessages.length} assistant messages, ${toolExecutions.length} tool calls`);

  // 生成综合分析
  const analysis = await generateSessionSummary(conversationText, config);

  return analysis;
}

module.exports = {
  generateSessionSummary,
  analyzeSession,
  OBSERVATION_TYPES,
  CONCEPT_TAGS,
};

// 如果直接运行此脚本，则从 stdin 读取数据并分析
if (require.main === module) {
  let inputData = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    inputData += chunk;
  });

  process.stdin.on('end', async () => {
    try {
      const sessionData = JSON.parse(inputData);
      const result = await analyzeSession(sessionData);

      if (result) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Error analyzing session: ${error.message}`);
      process.exit(1);
    }
  });
}
