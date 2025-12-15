#!/usr/bin/env node
/**
 * Worker 服务 - 后台分析服务
 * 监听端口 57777，接收会话数据并异步分析
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const { analyzeSession } = require('../llm_analyzer');

const PORT = process.env.CLAUDE_MEM_WORKER_PORT || 57777;
const HOST = process.env.CLAUDE_MEM_WORKER_HOST || '127.0.0.1';
const DATA_DIR = path.join(os.homedir(), '.claude-code-mem');
const MEMORY_FILE = path.join(DATA_DIR, 'mem.jsonl');
const SESSION_FILE = path.join(DATA_DIR, 'current_session.json');

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
 * 获取统计信息（读取完整文件进行统计）
 */
function getStats() {
  try {
    if (!fs.existsSync(MEMORY_FILE)) {
      return {
        totalRecords: 0,
        totalSessions: 0,
        totalObservations: 0,
        by_type: {},
      };
    }

    const content = fs.readFileSync(MEMORY_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(line => line.trim());

    const stats = {
      totalRecords: lines.length,
      totalSessions: 0,
      totalObservations: 0,
      by_type: {},
    };

    // 统计类型
    lines.forEach(line => {
      try {
        const record = JSON.parse(line);
        const type = record.type || 'unknown';
        stats.by_type[type] = (stats.by_type[type] || 0) + 1;
      } catch (error) {
        // 忽略解析错误的行
      }
    });

    // 会话数 = session_start 事件数量
    const sessionStarts = lines.filter(line => {
      try {
        const record = JSON.parse(line);
        return record.type === 'session_event' && record.event === 'session_start';
      } catch (error) {
        return false;
      }
    });
    stats.totalSessions = sessionStarts.length;
    stats.totalObservations = stats.by_type['observation'] || 0;

    return stats;
  } catch (error) {
    console.error('[Worker] Error getting stats:', error.message);
    return {
      error: error.message,
      totalRecords: 0,
      totalSessions: 0,
      totalObservations: 0,
    };
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
      timestamp: getLocalTimestamp(),
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
          timestamp: getLocalTimestamp(),
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

  // 静态文件服务（UI页面）
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    const indexPath = path.join(__dirname, 'ui', 'index.html');
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('UI not found');
    }
    return;
  }

  // 提供静态资源（CSS, JS 等）
  if (req.method === 'GET' && (req.url.startsWith('/ui/') || req.url.startsWith('/static/'))) {
    const resourcePath = path.join(__dirname, req.url);
    if (fs.existsSync(resourcePath)) {
      const ext = path.extname(resourcePath);
      const contentType = {
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml'
      }[ext] || 'application/octet-stream';

      const content = fs.readFileSync(resourcePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } else {
      res.writeHead(404);
      res.end();
    }
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
  console.error('='.repeat(60));
  console.error(`[Worker] Claude Mem Worker started on http://${HOST}:${PORT}`);
  console.error('='.repeat(60));
  console.error(`🌐 Web UI:         http://${HOST}:${PORT}/`);
  console.error(`❤️  Health check:  http://${HOST}:${PORT}/health`);
  console.error(`📊 Stats API:      http://${HOST}:${PORT}/api/stats`);
  console.error(`📝 Records API:    http://${HOST}:${PORT}/api/records?limit=100`);
  console.error(`⚙️  Analysis API:   http://${HOST}:${PORT}/api/analyze`);
  console.error('='.repeat(60));
  console.error(`📁 Memory file:    ${MEMORY_FILE}`);
  console.error(`🔄 Worker will keep running until manually restarted`);
  console.error('='.repeat(60));
});

/**
 * 优雅关闭（仅在收到 SIGTERM/SIGINT 时）
 */
function shutdown() {
  console.error('[Worker] Received shutdown signal, closing server...');

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

// 仅响应明确的停止信号
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// 未捕获的异常 - 记录但不退出
process.on('uncaughtException', (error) => {
  console.error('[Worker] Uncaught exception:', error);
  console.error('[Worker] Worker will continue running...');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Worker] Unhandled rejection at:', promise, 'reason:', reason);
  console.error('[Worker] Worker will continue running...');
});
