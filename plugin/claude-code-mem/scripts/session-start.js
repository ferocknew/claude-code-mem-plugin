#!/usr/bin/env node
/**
 * 会话开始 Hook
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const DATA_DIR = path.join(os.homedir(), '.claude-code-mem');
const MEMORY_FILE = path.join(DATA_DIR, 'mem.jsonl');
const SESSION_FILE = path.join(DATA_DIR, 'current_session.json');
const HEARTBEAT_FILE = path.join(DATA_DIR, 'heartbeat.txt');

const PORT = process.env.CLAUDE_MEM_WORKER_PORT || 37777;
const HOST = process.env.CLAUDE_MEM_WORKER_HOST || '127.0.0.1';

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 更新心跳
try {
  fs.writeFileSync(HEARTBEAT_FILE, Date.now().toString(), 'utf8');
} catch (error) {
  // 忽略心跳更新错误
}

// 记录会话开始
const record = {
  type: 'session_event',
  event: 'session_start',
  timestamp: new Date().toISOString(),
};

fs.appendFileSync(MEMORY_FILE, JSON.stringify(record) + '\n', 'utf8');
console.error(`✅ Session started at ${record.timestamp}`);

// 初始化当前会话文件（用于收集会话数据）
fs.writeFileSync(SESSION_FILE, JSON.stringify([]), 'utf8');
console.error(`✅ Initialized session data file`);

/**
 * 检查 Worker 状态
 */
function checkWorkerStatus() {
  const req = http.get(`http://${HOST}:${PORT}/health`, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      if (res.statusCode === 200) {
        try {
          const health = JSON.parse(data);
          console.error('');
          console.error('='.repeat(60));
          console.error('🧠 Claude Code Memory Plugin');
          console.error('='.repeat(60));
          console.error(`✅ Worker 运行中 (运行时间: ${Math.floor(health.uptime)}秒)`);
          console.error(`🌐 Web UI: http://${HOST}:${PORT}/`);
          console.error(`📊 当前统计: ${health.stats?.total_records || 0} 条记录`);
          console.error('='.repeat(60));
          console.error('');
        } catch (error) {
          // 忽略解析错误
        }
      } else {
        console.error(`⚠️  Worker 响应异常 (状态码: ${res.statusCode})`);
      }
    });
  });

  req.on('error', () => {
    console.error('');
    console.error('⚠️  Memory Worker 未启动');
    console.error(`   可通过以下命令启动: node ${path.join(__dirname, 'start_worker.js')}`);
    console.error('');
  });

  req.setTimeout(1000, () => {
    req.destroy();
  });
}

// 检查 Worker 状态并显示 Web UI 访问信息
checkWorkerStatus();
