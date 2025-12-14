#!/usr/bin/env node
/**
 * Worker 启动脚本
 * 由 Claude Code 启动时自动执行
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.claude-code-mem');
const PID_FILE = path.join(DATA_DIR, 'worker.pid');
const LOG_FILE = path.join(DATA_DIR, 'worker.log');
const WORKER_SCRIPT = path.join(__dirname, 'worker.js');

const PORT = process.env.CLAUDE_MEM_WORKER_PORT || 37777;
const HOST = process.env.CLAUDE_MEM_WORKER_HOST || '127.0.0.1';

/**
 * 确保目录存在
 */
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * 检查 Worker 是否已运行
 */
function isWorkerRunning() {
  if (!fs.existsSync(PID_FILE)) {
    return false;
  }

  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
    // 检查进程是否存在
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // 进程不存在，清理 PID 文件
    try {
      fs.unlinkSync(PID_FILE);
    } catch (e) {
      // 忽略
    }
    return false;
  }
}

/**
 * 检查端口是否可用
 */
async function isPortAvailable() {
  return new Promise((resolve) => {
    const http = require('http');

    http.get(`http://${HOST}:${PORT}/health`, (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => {
      resolve(false);
    });
  });
}

/**
 * 启动 Worker
 */
async function startWorker() {
  // 检查是否已运行
  if (isWorkerRunning()) {
    console.error('✅ Worker already running');
    return;
  }

  // 检查端口
  if (await isPortAvailable()) {
    console.error('✅ Worker already available at port', PORT);
    return;
  }

  console.error('🚀 Starting Worker service...');

  // 启动 Worker 进程
  const worker = spawn('node', [WORKER_SCRIPT], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
    env: {
      ...process.env,
      CLAUDE_MEM_WORKER_PORT: PORT,
      CLAUDE_MEM_WORKER_HOST: HOST,
    },
  });

  // 保存 PID
  fs.writeFileSync(PID_FILE, worker.pid.toString(), 'utf8');

  // 分离进程
  worker.unref();

  console.error(`✅ Worker started with PID ${worker.pid}`);
  console.error(`📍 Worker URL: http://${HOST}:${PORT}`);
  console.error(`📝 PID file: ${PID_FILE}`);

  // 等待 Worker 启动
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 验证启动成功
  if (await isPortAvailable()) {
    console.error('✅ Worker is healthy and ready');
  } else {
    console.error('⚠️  Worker may not be ready yet, check logs at', LOG_FILE);
  }
}

// 执行启动
startWorker().catch((error) => {
  console.error('❌ Failed to start worker:', error.message);
  process.exit(1);
});
