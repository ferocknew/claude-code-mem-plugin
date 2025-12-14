#!/usr/bin/env node
/**
 * 会话开始 Hook
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.claude-code-mem');
const MEMORY_FILE = path.join(DATA_DIR, 'mem.jsonl');
const SESSION_FILE = path.join(DATA_DIR, 'current_session.json');
const HEARTBEAT_FILE = path.join(DATA_DIR, 'heartbeat.txt');

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
