#!/usr/bin/env node
/**
 * 心跳脚本 - 由各个 Hook 调用，更新心跳时间戳
 * 用于让 Worker 知道 Claude Code 还在运行
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.claude-code-mem');
const HEARTBEAT_FILE = path.join(DATA_DIR, 'heartbeat.txt');

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 更新心跳时间戳
try {
  fs.writeFileSync(HEARTBEAT_FILE, Date.now().toString(), 'utf8');
} catch (error) {
  // 静默失败，不影响主流程
}
