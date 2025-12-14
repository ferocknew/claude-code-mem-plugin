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

// 从 stdin 读取数据
let inputData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  inputData += chunk;
});

process.stdin.on('end', () => {
  try {
    const data = JSON.parse(inputData);
    const userInput = data.prompt || data.content || '';

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
  } catch (error) {
    console.error(`❌ Error processing user input: ${error.message}`);
  }
});
