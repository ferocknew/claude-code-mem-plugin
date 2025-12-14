#!/usr/bin/env node
/**
 * Worker 服务 - 后台分析服务
 * 监听端口 37777，接收会话数据并异步分析
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const { analyzeSession } = require('./llm_analyzer');

const PORT = process.env.CLAUDE_MEM_WORKER_PORT || 37777;
const HOST = process.env.CLAUDE_MEM_WORKER_HOST || '127.0.0.1';
const DATA_DIR = path.join(os.homedir(), '.claude-code-mem');
const MEMORY_FILE = path.join(DATA_DIR, 'mem.jsonl');
const SESSION_FILE = path.join(DATA_DIR, 'current_session.json');

// 分析队列
const analysisQueue = [];
let isProcessing = false;

/**
 * 读取 JSONL 文件内容
 */
function readMemoryFile(limit = 100) {
  try {
    if (!fs.existsSync(MEMORY_FILE)) {
      return [];
    }

    const content = fs.readFileSync(MEMORY_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(line => line.trim());

    // 只返回最近的 N 条
    const recentLines = lines.slice(-limit);

    return recentLines.map(line => {
      try {
        return JSON.parse(line);
      } catch (error) {
        console.error('[Worker] Error parsing line:', error.message);
        return null;
      }
    }).filter(item => item !== null);
  } catch (error) {
    console.error('[Worker] Error reading memory file:', error.message);
    return [];
  }
}

/**
 * 获取统计信息
 */
function getStats() {
  try {
    const records = readMemoryFile(1000); // 读取最近 1000 条

    const stats = {
      total_records: records.length,
      by_type: {},
      recent_sessions: 0,
      recent_summaries: 0,
      recent_observations: 0,
    };

    // 统计类型
    records.forEach(record => {
      const type = record.type || 'unknown';
      stats.by_type[type] = (stats.by_type[type] || 0) + 1;
    });

    stats.recent_sessions = stats.by_type['session_event'] || 0;
    stats.recent_summaries = stats.by_type['session_summary'] || 0;
    stats.recent_observations = stats.by_type['observation'] || 0;

    return stats;
  } catch (error) {
    console.error('[Worker] Error getting stats:', error.message);
    return { error: error.message };
  }
}

/**
 * 保存分析结果
 */
function saveAnalysisResult(analysis, sessionData) {
  try {
    // 记录总结
    const summaryRecord = {
      id: randomUUID(),
      type: 'session_summary',
      format: 'structured',
      investigated: analysis.investigated || '',
      learned: analysis.learned || '',
      completed: analysis.completed || '',
      next_steps: analysis.next_steps || '',
      timestamp: new Date().toISOString(),
      message_count: sessionData.length,
      analyzed_by: 'worker',
      model_used: analysis.model_used,
    };

    fs.appendFileSync(MEMORY_FILE, JSON.stringify(summaryRecord) + '\n', 'utf8');
    console.error(`[Worker] Saved session summary`);

    // 记录观察
    if (analysis.observations && analysis.observations.length > 0) {
      for (const obs of analysis.observations) {
        const obsRecord = {
          id: randomUUID(),
          type: 'observation',
          obs_type: obs.type,
          title: obs.title,
          insight: obs.insight,
          concepts: obs.concepts || [],
          files: obs.files || [],
          timestamp: new Date().toISOString(),
        };
        fs.appendFileSync(MEMORY_FILE, JSON.stringify(obsRecord) + '\n', 'utf8');
      }
      console.error(`[Worker] Saved ${analysis.observations.length} observations`);
    }

    // 清理会话文件
    if (fs.existsSync(SESSION_FILE)) {
      fs.unlinkSync(SESSION_FILE);
      console.error(`[Worker] Cleaned up session file`);
    }
  } catch (error) {
    console.error(`[Worker] Error saving analysis result:`, error.message);
  }
}

/**
 * 处理分析队列
 */
async function processQueue() {
  if (isProcessing || analysisQueue.length === 0) {
    return;
  }

  isProcessing = true;

  while (analysisQueue.length > 0) {
    const task = analysisQueue.shift();

    try {
      console.error(`[Worker] Processing analysis for session ${task.sessionId}`);
      const analysis = await analyzeSession(task.sessionData);

      if (analysis) {
        saveAnalysisResult(analysis, task.sessionData);
        console.error(`[Worker] Analysis complete for session ${task.sessionId}`);
      } else {
        console.error(`[Worker] Analysis returned null for session ${task.sessionId}`);
      }
    } catch (error) {
      console.error(`[Worker] Analysis failed for session ${task.sessionId}:`, error.message);
    }
  }

  isProcessing = false;
}

/**
 * 创建 HTTP 服务器
 */
const server = http.createServer((req, res) => {
  // CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理 OPTIONS 请求
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // 健康检查
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      queueSize: analysisQueue.length,
      isProcessing,
      uptime: process.uptime(),
      stats: getStats(), // 添加统计信息
    }));
    return;
  }

  // 获取最近的记录
  if (req.method === 'GET' && req.url.startsWith('/api/records')) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const type = url.searchParams.get('type');

    let records = readMemoryFile(limit);

    // 按类型过滤
    if (type) {
      records = records.filter(r => r.type === type);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      total: records.length,
      records: records,
    }));
    return;
  }

  // 获取统计信息
  if (req.method === 'GET' && req.url === '/api/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getStats()));
    return;
  }

  // 分析接口
  if (req.method === 'POST' && req.url === '/api/analyze') {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const { sessionData, sessionId } = JSON.parse(body);

        // 添加到队列
        analysisQueue.push({
          sessionId: sessionId || Date.now(),
          sessionData,
        });

        // 启动队列处理
        setImmediate(() => processQueue());

        // 立即返回
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'queued',
          queuePosition: analysisQueue.length,
        }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: error.message,
        }));
      }
    });

    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

/**
 * 启动服务器
 */
server.listen(PORT, HOST, () => {
  console.error(`[Worker] Claude Mem Worker started on http://${HOST}:${PORT}`);
  console.error(`[Worker] Health check: http://${HOST}:${PORT}/health`);
  console.error(`[Worker] Analysis API: http://${HOST}:${PORT}/api/analyze`);
  console.error(`[Worker] Records API: http://${HOST}:${PORT}/api/records?limit=100`);
  console.error(`[Worker] Stats API: http://${HOST}:${PORT}/api/stats`);
  console.error(`[Worker] Memory file: ${MEMORY_FILE}`);
});

/**
 * 优雅关闭
 */
function shutdown() {
  console.error('[Worker] Shutting down...');

  server.close(() => {
    console.error('[Worker] Server closed');
    process.exit(0);
  });

  // 强制退出（5秒后）
  setTimeout(() => {
    console.error('[Worker] Force exit after timeout');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// 未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('[Worker] Uncaught exception:', error);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Worker] Unhandled rejection at:', promise, 'reason:', reason);
});
