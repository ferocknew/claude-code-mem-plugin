#!/usr/bin/env node
/**
 * 用户输入 Hook
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');

const DATA_DIR = path.join(os.homedir(), '.claude-code-mem');
const MEMORY_FILE = path.join(DATA_DIR, 'mem.jsonl');

// 从环境变量或 stdin 获取用户输入
const userInput = process.env.CLAUDE_USER_INPUT || process.argv[2] || '';

if (userInput) {
  const record = {
    id: randomUUID(),
    type: 'user_message',
    content: userInput,
    timestamp: new Date().toISOString(),
  };

  fs.appendFileSync(MEMORY_FILE, JSON.stringify(record) + '\n', 'utf8');
  console.error(`✅ Recorded user input: ${userInput.substring(0, 50)}...`);
}

