#!/usr/bin/env node
/**
 * 会话开始 Hook
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.claude-code-mem');
const MEMORY_FILE = path.join(DATA_DIR, 'mem.jsonl');

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 记录会话开始
const record = {
  type: 'session_event',
  event: 'session_start',
  timestamp: new Date().toISOString(),
};

fs.appendFileSync(MEMORY_FILE, JSON.stringify(record) + '\n', 'utf8');
console.error(`✅ Session started at ${record.timestamp}`);
