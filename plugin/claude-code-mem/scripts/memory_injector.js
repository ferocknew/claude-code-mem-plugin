#!/usr/bin/env node
/**
 * 增强版记忆注入器 - 带日志记录
 * 在原有基础上添加文件日志功能
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.claude-code-mem');
const GRAPH_FILE = path.join(DATA_DIR, 'knowledge_graph.jsonl');
const CONFIG_FILE = path.join(path.dirname(__filename), '..', 'memory_config.json');
const LOG_FILE = path.join(DATA_DIR, 'injection_debug.log');

// 日志函数
function log(message) {
  const timestamp = new Date().toISOString();
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
  debug: true
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
 * 搜索知识图谱
 */
function searchKnowledgeGraph(userInput, config) {
  if (!fs.existsSync(GRAPH_FILE)) {
    log('📁 Knowledge graph not found');
    return { entities: [], relations: [] };
  }

  const lines = fs.readFileSync(GRAPH_FILE, 'utf8').split('\n').filter(Boolean);
  const entities = [];
  const relations = [];

  for (const line of lines) {
    try {
      const item = JSON.parse(line);
      if (item.type === 'entity') {
        entities.push(item);
      } else if (item.type === 'relation') {
        relations.push(item);
      }
    } catch (e) {
      // 忽略
    }
  }

  log(`📊 Graph loaded: ${entities.length} entities, ${relations.length} relations`);

  // 提取关键词
  const keywords = extractKeywords(userInput);
  log(`🔍 Keywords extracted: [${keywords.join(', ')}]`);

  if (keywords.length === 0) {
    log('⚠️  No keywords found');
    return { entities: [], relations: [] };
  }

  // 搜索相关实体
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

  // 使用配置的最大实体数
  const maxEntities = config.max_entities || 5;
  const topEntities = scoredEntities.slice(0, maxEntities);
  const relevantEntities = topEntities.map(s => s.entity);

  // 详细日志：显示匹配的实体及得分
  log(`\n📋 匹配实体详情 (最多 ${maxEntities} 个):`);
  topEntities.forEach((item, idx) => {
    log(`  ${idx + 1}. [${item.score}分] ${item.entity.name} (${item.entity.entityType})`);
    log(`     原因: ${item.matchReasons.join(', ')}`);
  });

  const entityNames = new Set(relevantEntities.map(e => e.name));
  const relevantRelations = relations.filter(
    r => entityNames.has(r.from) || entityNames.has(r.to)
  );

  const maxRelations = Math.min(relevantRelations.length, 5);
  log(`\n✅ Found: ${relevantEntities.length} entities, ${maxRelations} relations`);

  if (relevantRelations.length > 0) {
    log(`\n🔗 关系详情:`);
    relevantRelations.slice(0, 5).forEach((rel, idx) => {
      log(`  ${idx + 1}. ${rel.from} --[${rel.relationType}]--> ${rel.to}`);
    });
  }

  return {
    entities: relevantEntities,
    relations: relevantRelations.slice(0, 5)
  };
}

/**
 * 提取关键词
 */
function extractKeywords(text) {
  const stopWords = ['的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '什么', '怎么', '为什么', '如何'];

  const words = text
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 2 && !stopWords.includes(word));

  return [...new Set(words)];
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

process.stdin.on('end', () => {
  try {
    log('🚀 Memory injection started');

    const config = loadConfig();
    log(`⚙️  Config: enabled=${config.enabled}, show_marker=${config.show_marker}`);

    if (!config.enabled) {
      log('❌ Memory injection disabled');
      console.log(inputData);
      return;
    }

    const data = JSON.parse(inputData);
    const userInput = data.prompt || data.content || '';

    log(`📝 User input: ${userInput.substring(0, 50)}...`);

    if (!userInput) {
      log('⚠️  Empty input');
      console.log(inputData);
      return;
    }

    const memoryData = searchKnowledgeGraph(userInput, config);

    let enhancedPrompt = userInput;
    if (memoryData.entities.length > 0) {
      const memoryContext = formatMemoryContext(memoryData, config);
      enhancedPrompt = memoryContext + userInput;

      log(`\n🧠 Memory injected: ${memoryData.entities.length} entities, ${memoryData.relations.length} relations`);

      // 显示注入内容预览
      log(`\n📄 注入内容预览 (前300字符):`);
      const preview = memoryContext.substring(0, 300).replace(/\n/g, '\n   ');
      log(`   ${preview}...`);
    } else {
      log('🔍 No relevant memory found');
    }

    const output = {
      ...data,
      prompt: enhancedPrompt,
      content: enhancedPrompt
    };

    console.log(JSON.stringify(output));
    log('✅ Memory injection completed');
  } catch (error) {
    log(`❌ Error: ${error.message}`);
    console.log(inputData);
  }
});
