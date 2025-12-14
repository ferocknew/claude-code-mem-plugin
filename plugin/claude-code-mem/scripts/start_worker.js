#!/usr/bin/env node
/**
 * Worker 启动脚本
 * 由 Claude Code 启动时自动执行
 * 使用 Worker API 检测是否已运行，避免重复启动
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

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
 * 检查 Worker 是否可用（通过 API）
 */
async function isWorkerAvailable() {
  return new Promise((resolve) => {
    const req = http.get(`http://${HOST}:${PORT}/health`, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const health = JSON.parse(data);
            console.error('✅ Worker is running:', {
              uptime: Math.floor(health.uptime) + 's',
              queue: health.queueSize,
              stats: health.stats,
            });
            resolve(true);
          } catch (error) {
            resolve(false);
          }
        } else {
          resolve(false);
        }
      });
    });

    req.on('error', () => {
      resolve(false);
    });

    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * 清理过期的 PID 文件
 */
function cleanupPidFile() {
  if (!fs.existsSync(PID_FILE)) {
    return;
  }

  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
    // 尝试检查进程是否存在
    try {
      process.kill(pid, 0);
      // 进程存在
    } catch (error) {
      // 进程不存在，清理 PID 文件
      fs.unlinkSync(PID_FILE);
      console.error('🧹 Cleaned up stale PID file');
    }
  } catch (error) {
    // PID 文件损坏，删除
    try {
      fs.unlinkSync(PID_FILE);
    } catch (e) {
      // 忽略
    }
  }
}

/**
 * 启动 Worker
 */
async function startWorker() {
  // 首先检查 Worker 是否通过 API 响应
  if (await isWorkerAvailable()) {
    console.error('✅ Worker already running and healthy');
    return;
  }

  // Worker 不可用，清理可能的过期 PID
  cleanupPidFile();

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
  console.error('⏳ Waiting for Worker to be ready...');
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (await isWorkerAvailable()) {
      console.error('✅ Worker is ready!');
      return;
    }
  }

  console.error('⚠️  Worker may not be ready yet, but process has started');
  console.error('   Check status: curl http://' + HOST + ':' + PORT + '/health');
}

// 执行启动
startWorker().catch((error) => {
  console.error('❌ Failed to start worker:', error.message);
  process.exit(1);
});
