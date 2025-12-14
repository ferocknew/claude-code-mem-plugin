#!/usr/bin/env node
/**
 * 停止 Hook - 调试版本
 * 记录所有环境变量，帮助诊断问题
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.claude-code-mem');
const DEBUG_FILE = path.join(DATA_DIR, 'debug.log');

// 记录所有环境变量
const timestamp = new Date().toISOString();
const debugInfo = {
  timestamp,
  env: process.env,
  argv: process.argv,
  cwd: process.cwd(),
};

fs.appendFileSync(DEBUG_FILE, JSON.stringify(debugInfo, null, 2) + '\n---\n', 'utf8');
console.error(`✅ Debug info saved to ${DEBUG_FILE}`);
