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
const HEARTBEAT_FILE = path.join(DATA_DIR, 'heartbeat.txt');

// 心跳检测配置
const HEARTBEAT_CHECK_INTERVAL = 10000; // 10 秒检查一次
const PARENT_PROCESS_CHECK = true; // 启用父进程检测

// 记录启动时的父进程 PID
const PARENT_PID = process.ppid;

// 分析队列
const analysisQueue = [];
let isProcessing = false;

// 心跳检测
let heartbeatTimer = null;
let lastHeartbeatCheck = Date.now();

/**
 * 检查父进程是否还在运行（Claude Code / Cursor 进程）
 */
function checkParentProcess() {
  try {
    // 尝试发送 signal 0 来检测进程是否存在
    // signal 0 不会真正发送信号，只是检测进程是否存在
    process.kill(PARENT_PID, 0);
    return true; // 进程存在
  } catch (error) {
    if (error.code === 'ESRCH') {
      // ESRCH: No such process - 父进程已退出
      console.error('[Worker] Parent process (PID:', PARENT_PID, ') no longer exists');
      return false;
    } else if (error.code === 'EPERM') {
      // EPERM: Operation not permitted - 进程存在但没有权限
      return true;
    }
    // 其他错误，假设进程还在
    console.error('[Worker] Error checking parent process:', error.message);
    return true;
  }
}

/**
 * 检查心跳文件（备用方案，检测长时间无操作）
 */
function checkHeartbeat() {
  try {
    if (!fs.existsSync(HEARTBEAT_FILE)) {
      // 没有心跳文件，可能刚启动，允许继续
      return true;
    }

    const lastHeartbeat = parseInt(fs.readFileSync(HEARTBEAT_FILE, 'utf8'));
    const now = Date.now();
    const timeSinceLastHeartbeat = now - lastHeartbeat;
    const maxIdleTime = 3600000; // 1 小时无操作则退出

    if (timeSinceLastHeartbeat > maxIdleTime) {
      console.error(`[Worker] No activity for ${Math.floor(timeSinceLastHeartbeat / 60000)} minutes, shutting down...`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Worker] Error checking heartbeat:', error.message);
    return true; // 出错时保持运行
  }
}

/**
 * 启动心跳检测定时器
 */
function startHeartbeatMonitor() {
  console.error(`[Worker] Starting process monitor (check every ${HEARTBEAT_CHECK_INTERVAL / 1000}s)`);
  console.error(`[Worker] Parent process PID: ${PARENT_PID}`);

  heartbeatTimer = setInterval(() => {
    // 首先检查父进程是否还在（最可靠的方式）
    if (PARENT_PROCESS_CHECK && !checkParentProcess()) {
      console.error('[Worker] Claude Code has exited, shutting down...');
      shutdown();
      return;
    }

    // 备用检查：是否长时间无活动
    if (!checkHeartbeat()) {
      console.error('[Worker] No activity for too long, shutting down...');
      shutdown();
      return;
    }
  }, HEARTBEAT_CHECK_INTERVAL);
}

/**
 * 停止心跳检测
 */
function stopHeartbeatMonitor() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    console.error('[Worker] Heartbeat monitor stopped');
  }
}

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

  // 启动心跳监控
  startHeartbeatMonitor();
});

/**
 * 优雅关闭
 */
function shutdown() {
  console.error('[Worker] Shutting down...');

  // 停止心跳监控
  stopHeartbeatMonitor();

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
