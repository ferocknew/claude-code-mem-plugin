#!/usr/bin/env node
/**
 * Worker 停止脚本
 * 由 Claude Code 关闭时自动执行
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.claude-code-mem');
const PID_FILE = path.join(DATA_DIR, 'worker.pid');

/**
 * 停止 Worker
 */
function stopWorker() {
  if (!fs.existsSync(PID_FILE)) {
    console.error('✅ Worker is not running (no PID file)');
    return;
  }

  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));

    console.error(`🛑 Stopping Worker (PID: ${pid})...`);

    // 发送 SIGTERM 信号
    process.kill(pid, 'SIGTERM');

    // 等待进程结束
    setTimeout(() => {
      try {
        // 检查进程是否还在运行
        process.kill(pid, 0);
        // 还在运行，强制杀死
        console.error('⚠️  Worker not responding, force killing...');
        process.kill(pid, 'SIGKILL');
      } catch (error) {
        // 进程已经停止
        console.error('✅ Worker stopped successfully');
      }

      // 清理 PID 文件
      try {
        fs.unlinkSync(PID_FILE);
      } catch (e) {
        // 忽略
      }
    }, 2000);

  } catch (error) {
    console.error('❌ Failed to stop worker:', error.message);

    // 清理 PID 文件
    try {
      fs.unlinkSync(PID_FILE);
    } catch (e) {
      // 忽略
    }
  }
}

// 执行停止
stopWorker();
