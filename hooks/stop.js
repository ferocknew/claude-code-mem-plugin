#!/usr/bin/env node
/**
 * 停止 Hook - 记录助手响应
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');

const DATA_DIR = path.join(os.homedir(), '.claude-code-mem');
const MEMORY_FILE = path.join(DATA_DIR, 'mem.jsonl');

// 从环境变量获取助手响应
const assistantResponse = process.env.CLAUDE_RESPONSE || '';

if (assistantResponse) {
  const record = {
    id: randomUUID(),
    type: 'assistant_message',
    content: assistantResponse,
    timestamp: new Date().toISOString(),
  };

  fs.appendFileSync(MEMORY_FILE, JSON.stringify(record) + '\n', 'utf8');
  console.error(`✅ Recorded assistant response: ${assistantResponse.substring(0, 50)}...`);
}
