#!/usr/bin/env node
/**
 * 工具执行后 Hook - 仅更新心跳
 * 注意：此脚本已不再记录工具执行，因为助手响应中已包含工具使用结果
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.claude-code-mem');
const HEARTBEAT_FILE = path.join(DATA_DIR, 'heartbeat.txt');

// 更新心跳
try {
  fs.writeFileSync(HEARTBEAT_FILE, Date.now().toString(), 'utf8');
} catch (error) {
  // 忽略心跳更新错误
}
