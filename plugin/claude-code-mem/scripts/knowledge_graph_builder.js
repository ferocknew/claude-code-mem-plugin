#!/usr/bin/env node
/**
 * 知识图谱构建器
 * 将 session_summary 和 observation 转换为实体-关系图谱
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.claude-code-mem');
const MEMORY_FILE = path.join(DATA_DIR, 'mem.jsonl');
const GRAPH_FILE = path.join(DATA_DIR, 'knowledge_graph.jsonl');

/**
 * 从 session_summary 提取实体
 */
function extractEntitiesFromSummary(summary) {
  console.error('=== 提取会话摘要实体 ===');
  console.error('Summary data:', JSON.stringify(summary, null, 2));
  
  const entities = [];
  const relations = [];

  // 提取会话实体
  const sessionEntity = {
    type: 'entity',
    name: `会话_${summary.id.substring(0, 8)}`,
    entityType: '会话',
    project: summary.project || null,
    observations: [
      `调查: ${summary.investigated || ''}`,
      `学习: ${summary.learned || ''}`,
      `完成: ${summary.completed || ''}`,
      `下一步: ${summary.next_steps || ''}`,
      `时间: ${summary.timestamp}`,
      `消息数: ${summary.message_count || 0}`
    ].filter(obs => !obs.endsWith(': ')),
    timestamp: summary.timestamp
  };

  console.error('Created session entity:', JSON.stringify(sessionEntity, null, 2));
  entities.push(sessionEntity);

  // 简单的关键词提取 (可以用 LLM 增强)
  const keywords = extractKeywordsSimple(
    [summary.investigated, summary.learned, summary.completed].join(' ')
  );

  // 为每个关键概念创建实体
  for (const keyword of keywords.slice(0, 3)) {
    const conceptEntity = {
      type: 'entity',
      name: keyword,
      entityType: '概念',
      project: summary.project || null,
      observations: [`在会话中提及: ${summary.timestamp}`],
      timestamp: summary.timestamp
    };

    entities.push(conceptEntity);

    // 创建关系
    relations.push({
      type: 'relation',
      from: sessionEntity.name,
      to: keyword,
      relationType: '涉及',
      project: summary.project || null
    });
  }

  return { entities, relations };
}

/**
 * 从 observation 提取实体
 */
function extractEntitiesFromObservation(observation) {
  console.error('=== 提取观察实体 ===');
  console.error('Observation data:', JSON.stringify(observation, null, 2));
  
  const entities = [];
  const relations = [];

  // 创建观察实体
  const obsEntity = {
    type: 'entity',
    name: observation.title || `观察_${observation.id.substring(0, 8)}`,
    entityType: observation.obs_type || 'discovery',
    project: observation.project || null,
    observations: [
      `洞察: ${observation.insight || ''}`,
      `概念: ${(observation.concepts || []).join(', ')}`,
      `文件: ${(observation.files || []).join(', ')}`,
      `时间: ${observation.timestamp}`
    ].filter(obs => !obs.endsWith(': ')),
    timestamp: observation.timestamp
  };

  console.error('Created observation entity:', JSON.stringify(obsEntity, null, 2));
  entities.push(obsEntity);

  // 为涉及的文件创建实体和关系
  for (const file of observation.files || []) {
    if (file) {
      entities.push({
        type: 'entity',
        name: file,
        entityType: '文件',
        project: observation.project || null,
        observations: [`${observation.obs_type}操作: ${observation.timestamp}`],
        timestamp: observation.timestamp
      });

      relations.push({
        type: 'relation',
        from: obsEntity.name,
        to: file,
        relationType: '涉及文件',
        project: observation.project || null
      });
    }
  }

  return { entities, relations };
}

/**
 * 简单关键词提取
 */
function extractKeywordsSimple(text) {
  if (!text) return [];

  // 停用词
  const stopWords = ['的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '进行', '可能', '系统', '使用'];

  const words = text
    .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 2 && !stopWords.includes(word));

  // 统计词频
  const wordCount = {};
  for (const word of words) {
    wordCount[word] = (wordCount[word] || 0) + 1;
  }

  // 返回高频词
  return Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

/**
 * 构建知识图谱
 */
function buildKnowledgeGraph() {
  console.error('=== 开始构建知识图谱 ===');
  console.error('Memory file path:', MEMORY_FILE);
  console.error('Graph file path:', GRAPH_FILE);
  
  if (!fs.existsSync(MEMORY_FILE)) {
    console.error('❌ Memory file not found');
    return;
  }

  const lines = fs.readFileSync(MEMORY_FILE, 'utf8').split('\n').filter(Boolean);
  const allEntities = new Map();
  const allRelations = [];

  console.error(`📊 Processing ${lines.length} records...`);
  console.error('=== 开始处理记录 ===');

  for (const line of lines) {
    try {
      const record = JSON.parse(line);
      console.error(`\n处理记录类型: ${record.type}`);

      let result;
      if (record.type === 'session_summary') {
        result = extractEntitiesFromSummary(record);
      } else if (record.type === 'observation') {
        result = extractEntitiesFromObservation(record);
      } else {
        console.error(`跳过记录类型: ${record.type}`);
        continue;
      }
      
      console.error(`提取结果: ${result.entities.length} 个实体, ${result.relations.length} 个关系`);

      // 合并实体 (同名实体的 observations 合并)
      for (const entity of result.entities) {
        if (allEntities.has(entity.name)) {
          const existing = allEntities.get(entity.name);
          existing.observations.push(...entity.observations);
        } else {
          allEntities.set(entity.name, entity);
        }
      }

      allRelations.push(...result.relations);
    } catch (e) {
      // 忽略解析错误
    }
  }

  // 写入知识图谱
  const graphData = [];

  // 写入所有实体
  for (const entity of allEntities.values()) {
    graphData.push(JSON.stringify(entity));
  }

  // 去重关系
  const uniqueRelations = new Map();
  for (const rel of allRelations) {
    const key = `${rel.from}|${rel.relationType}|${rel.to}`;
    uniqueRelations.set(key, rel);
  }

  // 写入所有关系
  for (const rel of uniqueRelations.values()) {
    graphData.push(JSON.stringify(rel));
  }

  fs.writeFileSync(GRAPH_FILE, graphData.join('\n') + '\n', 'utf8');

  console.error(`✅ Knowledge graph built: ${allEntities.size} entities, ${uniqueRelations.size} relations`);
  console.error(`📁 Saved to: ${GRAPH_FILE}`);
}

// 主程序
if (require.main === module) {
  try {
    buildKnowledgeGraph();
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { buildKnowledgeGraph };
