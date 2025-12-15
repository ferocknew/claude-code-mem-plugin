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
const SESSION_FILE = path.join(DATA_DIR, 'current_session.json');
const HEARTBEAT_FILE = path.join(DATA_DIR, 'heartbeat.txt');

// 更新心跳
try {
  fs.writeFileSync(HEARTBEAT_FILE, Date.now().toString(), 'utf8');
} catch (error) {
  // 忽略心跳更新错误
}

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

      // 记录到主文件
      fs.appendFileSync(MEMORY_FILE, JSON.stringify(record) + '\n', 'utf8');
      console.error(`✅ Recorded user input: ${userInput.substring(0, 50)}...`);

      // 添加到当前会话数据
      if (fs.existsSync(SESSION_FILE)) {
        const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
        sessionData.push(record);
        fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2), 'utf8');
      }
    }
  } catch (error) {
    console.error(`❌ Error processing user input: ${error.message}`);
  }
});
