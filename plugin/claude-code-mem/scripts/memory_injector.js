#!/usr/bin/env node
/**
 * 增强版记忆注入器 - 带日志记录和 LLM 关键词提取
 * 在原有基础上添加文件日志功能和智能关键词提取
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

const DATA_DIR = path.join(os.homedir(), '.claude-code-mem');
const GRAPH_FILE = path.join(DATA_DIR, 'knowledge_graph.jsonl');
const CONFIG_FILE = path.join(path.dirname(__filename), '..', 'memory_config.json');
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

// 日志函数
function log(message) {
  const timestamp = getLocalTimestamp();
  const logMessage = `[${timestamp}] ${message}\n`;

  try {
    fs.appendFileSync(LOG_FILE, logMessage, 'utf8');
  } catch (e) {
    // 忽略日志错误
  }

  // 同时输出到 stderr
  console.error(message);
}

// 默认配置
const DEFAULT_CONFIG = {
  enabled: true,
  max_entities: 5,
  injection_mode: 'auto',
  show_marker: true,
  debug: true,
  use_llm_keywords: true, // 是否使用 LLM 提取关键词
  llm_keywords_timeout: 3000, // LLM 提取超时时间(毫秒)
  min_score_threshold: 30 // 最低评分阈值，低于此分数不注入
};

/**
 * 加载配置
 */
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    }
  } catch (e) {
    log(`⚠️  Config load error: ${e.message}`);
  }
  return DEFAULT_CONFIG;
}

/**
 * 获取当前项目名称
 */
function getProjectName() {
  try {
    const projectPath = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const projectName = path.basename(projectPath);
    
    log(`\n🔍 [项目检测]`);
    log(`   CLAUDE_PROJECT_DIR: ${process.env.CLAUDE_PROJECT_DIR || '(未设置)'}`);
    log(`   项目名称: ${projectName}`);
    
    return projectName;
  } catch (error) {
    log(`\n❌ [项目检测错误] ${error.message}`);
    return null;
  }
}

/**
 * 搜索知识图谱
 */
async function searchKnowledgeGraph(userInput, config) {
  if (!fs.existsSync(GRAPH_FILE)) {
    log('📁 Knowledge graph not found');
    return { entities: [], relations: [] };
  }

  const lines = fs.readFileSync(GRAPH_FILE, 'utf8').split('\n').filter(Boolean);
  const entities = [];
  const relations = [];

  const currentProject = getProjectName();

  for (const line of lines) {
    try {
      const item = JSON.parse(line);
      
      // 项目隔离过滤
      if (config.project_isolation && item.project) {
        if (item.project !== currentProject) {
          if (!config.include_other_projects) {
            continue; // 跳过其他项目的记录
          }
        }
      }
      
      if (item.type === 'entity') {
        entities.push(item);
      } else if (item.type === 'relation') {
        relations.push(item);
      }
    } catch (e) {
      // 忽略
    }
  }

  log(`\n📊 [知识图谱加载]`);
  log(`   当前项目: ${currentProject || 'unknown'}`);
  log(`   项目隔离: ${config.project_isolation}`);
  log(`   实体数量: ${entities.length}`);
  log(`   关系数量: ${relations.length}`);

  // 提取关键词（支持 LLM）
  const keywords = await extractKeywords(userInput, config);

  if (keywords.length === 0) {
    log('\n⚠️  未提取到关键词');
    return { entities: [], relations: [] };
  }

  // 搜索相关实体
  log(`\n🔎 [实体匹配]`);
  log(`   关键词: [${keywords.join(', ')}]`);
  log(`   开始匹配...`);
  
  const scoredEntities = [];
  for (const entity of entities) {
    let score = 0;
    const matchReasons = [];

    // 名称匹配
    for (const keyword of keywords) {
      if (entity.name.toLowerCase().includes(keyword.toLowerCase())) {
        score += 10;
        matchReasons.push(`名称匹配"${keyword}"`);
      }
    }

    // 观察内容匹配
    for (const obs of entity.observations || []) {
      for (const keyword of keywords) {
        if (obs.toLowerCase().includes(keyword.toLowerCase())) {
          score += 2;
          matchReasons.push(`观察匹配"${keyword}"`);
        }
      }
    }

    // 时间权重
    if (entity.timestamp) {
      const daysSince = (Date.now() - new Date(entity.timestamp)) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) {
        score += 3;
        matchReasons.push('7天内');
      } else if (daysSince < 30) {
        score += 1;
        matchReasons.push('30天内');
      }
    }

    if (score > 0) {
      scoredEntities.push({ entity, score, matchReasons });
    }
  }

  scoredEntities.sort((a, b) => b.score - a.score);

  // 应用最低评分阈值
  const minScore = config.min_score_threshold || 30;
  const filteredEntities = scoredEntities.filter(s => s.score >= minScore);

  // 使用配置的最大实体数
  const maxEntities = config.max_entities || 5;
  const topEntities = filteredEntities.slice(0, maxEntities);
  const relevantEntities = topEntities.map(s => s.entity);

  // 详细日志：显示匹配的实体及得分
  log(`\n📋 [匹配结果] (最低 ${minScore} 分，最多 ${maxEntities} 个):`);
  if (scoredEntities.length === 0) {
    log(`   无匹配实体`);
  } else if (topEntities.length === 0) {
    log(`   找到 ${scoredEntities.length} 个实体，但评分均低于阈值 ${minScore}`);
    log(`   最高分: ${scoredEntities[0].score} 分 - ${scoredEntities[0].entity.name}`);
  } else {
    topEntities.forEach((item, idx) => {
      log(`   ${idx + 1}. [${item.score}分] ${item.entity.name} (${item.entity.entityType})`);
      log(`      原因: ${item.matchReasons.join(', ')}`);
    });
  }

  const entityNames = new Set(relevantEntities.map(e => e.name));
  const relevantRelations = relations.filter(
    r => entityNames.has(r.from) || entityNames.has(r.to)
  );

  const maxRelations = Math.min(relevantRelations.length, 5);
  log(`\n✅ [查询完成]`);
  log(`   匹配实体: ${relevantEntities.length} 个`);
  log(`   相关关系: ${maxRelations} 个`);

  if (relevantRelations.length > 0) {
    log(`\n🔗 [关系详情]:`);
    relevantRelations.slice(0, 5).forEach((rel, idx) => {
      log(`   ${idx + 1}. ${rel.from} --[${rel.relationType}]--> ${rel.to}`);
    });
  }

  return {
    entities: relevantEntities,
    relations: relevantRelations.slice(0, 5)
  };
}

/**
 * 获取 API 配置
 */
function getApiConfig() {
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
  const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  const defaultModel = process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || 'claude-3-5-haiku-20241022';

  if (authToken) {
    return {
      apiKey: authToken,
      baseUrl: baseUrl,
      model: defaultModel,
      source: 'claude_code'
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (apiKey) {
    return {
      apiKey: apiKey,
      baseUrl: baseUrl,
      model: defaultModel,
      source: 'user_config'
    };
  }

  return null;
}

/**
 * 调用 Claude API 提取关键词
 */
async function callClaudeAPI(prompt, config, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('API request timeout'));
    }, timeout);

    const data = JSON.stringify({
      model: config.model,
      max_tokens: 500,
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
      if (config.baseUrl.includes('/v1/messages')) {
        apiUrl = new URL(config.baseUrl);
      } else {
        const baseUrlClean = config.baseUrl.replace(/\/$/, '');
        apiUrl = new URL(baseUrlClean + '/v1/messages');
      }
    } catch (error) {
      clearTimeout(timer);
      reject(new Error(`Invalid base URL: ${config.baseUrl}`));
      return;
    }

    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    };

    // 根据环境变量决定认证方式
    const useBearerAuth = process.env.ANTHROPIC_USE_BEARER_AUTH === 'true';
    
    if (useBearerAuth) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    } else {
      headers['x-api-key'] = config.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    }

    // SSL 证书验证控制
    const skipSslVerify = process.env.ANTHROPIC_SKIP_SSL_VERIFY === 'true';

    // 根据协议选择 http 或 https 模块
    const isHttps = apiUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;

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
        clearTimeout(timer);
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
      clearTimeout(timer);
      reject(new Error(`API request error: ${error.message}`));
    });

    req.write(data);
    req.end();
  });
}

/**
 * 使用 LLM 提取关键词和概念
 */
async function extractKeywordsWithLLM(text, config) {
  const prompt = `分析以下用户输入，提取关键的技术概念、实体名称和主题词。

用户输入:
${text}

请以 JSON 数组格式返回关键词列表，按重要性排序。只返回 JSON 数组，不要其他文字。

示例格式:
["关键词1", "关键词2", "关键词3"]

要求:
- 提取技术术语、文件名、功能名称、概念等
- 忽略常见停用词
- 最多返回 10 个关键词
- 关键词应该是单个词或短语`;

  try {
    log(`\n🤖 [LLM 关键词提取]`);
    log(`   模型: ${config.model}`);
    log(`   来源: ${config.source}`);
    log(`   超时: ${config.timeout}ms`);
    log(`   提示词长度: ${prompt.length} 字符`);
    
    const startTime = Date.now();
    const response = await callClaudeAPI(prompt, config, config.timeout || 3000);
    const elapsed = Date.now() - startTime;
    
    const content = response.content[0].text;
    log(`   响应时间: ${elapsed}ms`);
    log(`   原始响应: ${content}`);

    // 提取 JSON 数组
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      log('   ⚠️  未找到 JSON 数组，回退到简单提取');
      return null;
    }

    const keywords = JSON.parse(jsonMatch[0]);
    if (Array.isArray(keywords) && keywords.length > 0) {
      log(`   ✅ 成功提取: [${keywords.join(', ')}]`);
      return keywords;
    }

    return null;
  } catch (error) {
    log(`   ❌ LLM 提取失败: ${error.message}`);
    log(`   回退到简单提取`);
    return null;
  }
}

/**
 * 简单关键词提取（回退方案）
 */
function extractKeywordsSimple(text) {
  const stopWords = ['的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '什么', '怎么', '为什么', '如何'];

  const words = text
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 2 && !stopWords.includes(word));

  return [...new Set(words)];
}

/**
 * 提取关键词（智能模式）
 */
async function extractKeywords(text, config) {
  log(`\n🔍 [关键词提取]`);
  log(`   输入文本: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
  log(`   启用 LLM: ${config.use_llm_keywords}`);
  
  // 如果启用 LLM 且有 API 配置，尝试使用 LLM
  if (config.use_llm_keywords) {
    const apiConfig = getApiConfig();
    if (apiConfig) {
      log(`   API 配置: 已找到 (${apiConfig.source})`);
      const llmKeywords = await extractKeywordsWithLLM(text, {
        ...apiConfig,
        timeout: config.llm_keywords_timeout
      });
      if (llmKeywords) {
        log(`   提取方式: ✅ LLM`);
        return llmKeywords;
      }
    } else {
      log(`   API 配置: ❌ 未找到`);
      log(`   提取方式: 📝 简单模式（回退）`);
    }
  } else {
    log(`   提取方式: 📝 简单模式（配置禁用）`);
  }

  // 回退到简单提取
  const simpleKeywords = extractKeywordsSimple(text);
  log(`   简单提取结果: [${simpleKeywords.join(', ')}]`);
  return simpleKeywords;
}

/**
 * 格式化记忆上下文
 */
function formatMemoryContext(memoryData, config) {
  const { entities, relations } = memoryData;

  if (entities.length === 0) {
    return '';
  }

  let context = '';

  if (config.show_marker) {
    context += '\n\n🧠 **[插件注入的记忆]**\n\n';
  } else {
    context += '\n\n';
  }

  context += '<relevant_memory>\n';
  context += '根据记忆系统,以下信息可能相关:\n\n';

  for (const entity of entities) {
    context += `**${entity.name}** (${entity.entityType}):\n`;
    for (const obs of (entity.observations || []).slice(0, 3)) {
      if (obs.trim()) {
        context += `  - ${obs}\n`;
      }
    }
    context += '\n';
  }

  if (relations.length > 0) {
    context += '**相关联系:**\n';
    for (const rel of relations) {
      context += `  - ${rel.from} ${rel.relationType} ${rel.to}\n`;
    }
    context += '\n';
  }

  context += '</relevant_memory>\n\n';

  if (config.debug) {
    context += `<!-- 记忆注入: 找到 ${entities.length} 个相关实体 -->\n\n`;
  }

  return context;
}

// 主程序
let inputData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  inputData += chunk;
});

process.stdin.on('end', async () => {
  try {
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('🚀 [记忆注入开始]');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const config = loadConfig();
    log(`\n⚙️  [配置信息]`);
    log(`   启用状态: ${config.enabled}`);
    log(`   使用 LLM: ${config.use_llm_keywords}`);
    log(`   显示标记: ${config.show_marker}`);
    log(`   最大实体: ${config.max_entities}`);
    log(`   LLM 超时: ${config.llm_keywords_timeout}ms`);

    if (!config.enabled) {
      log('\n❌ 记忆注入已禁用');
      console.log(inputData);
      return;
    }

    const data = JSON.parse(inputData);
    const userInput = data.prompt || data.content || '';

    log(`\n📝 [用户输入]`);
    log(`   长度: ${userInput.length} 字符`);
    log(`   内容: ${userInput.substring(0, 100)}${userInput.length > 100 ? '...' : ''}`);

    if (!userInput) {
      log('\n⚠️  输入为空');
      console.log(inputData);
      return;
    }

    const memoryData = await searchKnowledgeGraph(userInput, config);

    let enhancedPrompt = userInput;
    if (memoryData.entities.length > 0) {
      const memoryContext = formatMemoryContext(memoryData, config);
      enhancedPrompt = memoryContext + userInput;

      log(`\n🧠 [记忆注入]`);
      log(`   注入实体: ${memoryData.entities.length} 个`);
      log(`   注入关系: ${memoryData.relations.length} 个`);
      log(`   注入内容长度: ${memoryContext.length} 字符`);

      // 显示注入内容预览
      log(`\n📄 [注入内容预览] (前 500 字符):`);
      const preview = memoryContext.substring(0, 500).split('\n').map(line => `   ${line}`).join('\n');
      log(preview);
      if (memoryContext.length > 500) {
        log(`   ... (还有 ${memoryContext.length - 500} 字符)`);
      }
    } else {
      log(`\n🔍 [记忆注入]`);
      log(`   未找到相关记忆，不注入内容`);
    }

    const output = {
      ...data,
      prompt: enhancedPrompt,
      content: enhancedPrompt
    };

    console.log(JSON.stringify(output));
    
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('✅ [记忆注入完成]');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (error) {
    log(`\n❌ [错误] ${error.message}`);
    log(`   堆栈: ${error.stack}`);
    console.log(inputData);
  }
});
