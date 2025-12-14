#!/usr/bin/env node
/**
 * 记忆注入器
 * 在用户提交 prompt 时,自动搜索相关记忆并注入上下文
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.claude-code-mem');
const GRAPH_FILE = path.join(DATA_DIR, 'knowledge_graph.jsonl');
const CONFIG_FILE = path.join(path.dirname(__filename), '..', 'memory_config.json');

// 默认配置
const DEFAULT_CONFIG = {
  enabled: true,
  max_entities: 5,
  injection_mode: 'auto', // auto, always, manual
  show_marker: true, // 显示注入标记,方便验证
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
    // 使用默认配置
  }
  return DEFAULT_CONFIG;
}

/**
 * 搜索知识图谱
 */
function searchKnowledgeGraph(userInput) {
  if (!fs.existsSync(GRAPH_FILE)) {
    return { entities: [], relations: [] };
  }

  const lines = fs.readFileSync(GRAPH_FILE, 'utf8').split('\n').filter(Boolean);
  const entities = [];
  const relations = [];

  // 解析图谱
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

  // 提取关键词
  const keywords = extractKeywords(userInput);
  if (keywords.length === 0) {
    return { entities: [], relations: [] };
  }

  // 搜索相关实体
  const scoredEntities = [];
  for (const entity of entities) {
    let score = 0;

    // 1. 实体名称匹配
    for (const keyword of keywords) {
      if (entity.name.toLowerCase().includes(keyword.toLowerCase())) {
        score += 10;
      }
    }

    // 2. 观察内容匹配
    for (const obs of entity.observations || []) {
      for (const keyword of keywords) {
        if (obs.toLowerCase().includes(keyword.toLowerCase())) {
          score += 2;
        }
      }
    }

    // 3. 时间权重 (最近的记录权重高)
    if (entity.timestamp) {
      const daysSince = (Date.now() - new Date(entity.timestamp)) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) score += 3;
      else if (daysSince < 30) score += 1;
    }

    if (score > 0) {
      scoredEntities.push({ entity, score });
    }
  }

  // 按得分排序
  scoredEntities.sort((a, b) => b.score - a.score);
  const relevantEntities = scoredEntities.slice(0, 5).map(s => s.entity);

  // 获取相关关系
  const entityNames = new Set(relevantEntities.map(e => e.name));
  const relevantRelations = relations.filter(
    r => entityNames.has(r.from) || entityNames.has(r.to)
  );

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

  // 添加可见标记 (方便验证插件是否工作)
  if (config.show_marker) {
    context += '\n\n🧠 **[插件注入的记忆]**\n\n';
  } else {
    context += '\n\n';
  }

  context += '<relevant_memory>\n';
  context += '根据记忆系统,以下信息可能相关:\n\n';

  // 格式化实体
  for (const entity of entities) {
    context += `**${entity.name}** (${entity.entityType}):\n`;
    for (const obs of (entity.observations || []).slice(0, 3)) {
      if (obs.trim()) {
        context += `  - ${obs}\n`;
      }
    }
    context += '\n';
  }

  // 格式化关系
  if (relations.length > 0) {
    context += '**相关联系:**\n';
    for (const rel of relations) {
      context += `  - ${rel.from} ${rel.relationType} ${rel.to}\n`;
    }
    context += '\n';
  }

  context += '</relevant_memory>\n\n';

  // Debug 信息
  if (config.debug) {
    context += `<!-- 记忆注入: 找到 ${entities.length} 个相关实体 -->\n\n`;
  }

  return context;
}

/**
 * 主程序
 */
let inputData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  inputData += chunk;
});

process.stdin.on('end', () => {
  try {
    const config = loadConfig();

    // 检查是否启用
    if (!config.enabled) {
      console.log(inputData);
      return;
    }

    const data = JSON.parse(inputData);
    const userInput = data.prompt || data.content || '';

    if (!userInput) {
      console.log(inputData);
      return;
    }

    // 搜索相关记忆
    const memoryData = searchKnowledgeGraph(userInput);

    // 注入记忆
    let enhancedPrompt = userInput;
    if (memoryData.entities.length > 0) {
      const memoryContext = formatMemoryContext(memoryData, config);
      enhancedPrompt = memoryContext + userInput;

      console.error(`🧠 Memory injected: ${memoryData.entities.length} entities, ${memoryData.relations.length} relations`);
    } else {
      console.error(`🔍 No relevant memory found`);
    }

    // 输出修改后的数据
    const output = {
      ...data,
      prompt: enhancedPrompt,
      content: enhancedPrompt
    };

    console.log(JSON.stringify(output));
  } catch (error) {
    console.error(`❌ Memory injection error: ${error.message}`);
    console.log(inputData); // 失败时返回原始输入
  }
});
