#!/usr/bin/env node
/**
 * LLM 分析器 - 使用 Claude API 分析对话内容
 * 提取观察(observations)和生成总结
 */
const https = require('https');

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

  // 获取默认模型配置
  const defaultModel = process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || 'glm-4.5-air';

  // 如果有 auth token，优先使用
  if (authToken) {
    return {
      apiKey: authToken,
      baseUrl: baseUrl,
      model: defaultModel,
      source: 'claude_code' // 标记来源
    };
  }

  // 回退到用户配置的 API Key
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (apiKey) {
    return {
      apiKey: apiKey,
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-haiku-4',
      source: 'user_config'
    };
  }

  console.error('❌ No API Key found. Please set ANTHROPIC_API_KEY or ensure Claude Code auth is configured');
  return null;
}

/**
 * 调用 Claude API（支持自定义 base URL）
 */
async function callClaudeAPI(prompt, config) {
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

    // 解析 base URL
    const url = new URL(config.baseUrl + '/v1/messages');

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(responseData);
            resolve(parsed);
          } catch (error) {
            reject(new Error(`Failed to parse API response: ${error.message}`));
          }
        } else {
          reject(new Error(`API request failed with status ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on('error', (error) => {
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
  const prompt = `请分析以下会话内容，生成一个结构化的会话总结。类似会话摘要卡片的格式。

${conversationText}

请以 JSON 格式返回，包含以下字段:

1. **investigated** (🔍 调查内容): 用户询问或请求了什么？尝试解决什么问题？(2-3句话)
2. **learned** (💡 学到什么): 从这次对话中获得的关键知识点或发现(2-3句话)
3. **completed** (✅ 完成内容): 实际完成了什么？有哪些具体成果？(2-3句话)
4. **next_steps** (➡️ 后续步骤): 建议的后续行动或待办事项(可选，1-2句话)
5. **observations** (数组): 技术观察列表，每个包含:
   - type: 观察类型(${OBSERVATION_TYPES.join(', ')})
   - title: 简短标题(最多30字符)
   - insight: 关键洞察(1-2句话)
   - concepts: 相关概念(从 ${CONCEPT_TAGS.join(', ')} 中选择)
   - files: 相关文件(如果有)

只返回 JSON 对象，不要其他文字。格式示例:
{
  "investigated": "用户尝试解决内存泄漏问题...",
  "learned": "学习了 WeakMap 的使用方式和垃圾回收机制...",
  "completed": "成功定位并修复了内存泄漏，性能提升明显...",
  "next_steps": "建议添加内存监控和单元测试",
  "observations": [
    {
      "type": "bugfix",
      "title": "修复循环闭包内存泄漏",
      "insight": "使用 WeakMap 替代 Map 解决引用持有问题",
      "concepts": ["problem-solution", "gotcha"],
      "files": ["src/cache.js"]
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
 * 分析会话 - 优化版：只分析用户输入和助手响应
 */
async function analyzeSession(sessionData) {
  const config = getApiConfig();
  if (!config) {
    return null;
  }

  console.error(`🔄 Using ${config.source} auth with model: ${config.model}`);

  // 只提取用户消息和助手响应（跳过工具执行细节）
  const userMessages = [];
  const assistantMessages = [];

  for (const record of sessionData) {
    if (record.type === 'user_message') {
      userMessages.push(record.content);
    } else if (record.type === 'assistant_message') {
      assistantMessages.push(record.content);
    }
  }

  // 检查是否有足够的对话内容
  if (userMessages.length === 0 || assistantMessages.length === 0) {
    console.error('⚠️  Insufficient conversation content to analyze');
    return null;
  }

  // 构建对话文本 - 只包含用户输入和助手的关键响应
  let conversationText = '=== 用户请求 ===\n';
  userMessages.forEach((msg, i) => {
    conversationText += `${i + 1}. ${msg}\n`;
  });

  conversationText += '\n=== 助手响应摘要 ===\n';
  // 只取最后几条助手响应（通常包含最终结果）
  const recentResponses = assistantMessages.slice(-3);
  recentResponses.forEach((msg, i) => {
    // 截断过长的响应
    const truncated = msg.length > 500 ? msg.substring(0, 500) + '...' : msg;
    conversationText += `${i + 1}. ${truncated}\n`;
  });

  console.error('🔄 Analyzing session with Claude API...');

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
