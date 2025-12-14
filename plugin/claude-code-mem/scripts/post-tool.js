#!/usr/bin/env node
/**
 * 工具执行后 Hook
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');

const DATA_DIR = path.join(os.homedir(), '.claude-code-mem');
const MEMORY_FILE = path.join(DATA_DIR, 'mem.jsonl');
const SESSION_FILE = path.join(DATA_DIR, 'current_session.json');

// 从 stdin 读取数据
let inputData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  inputData += chunk;
});

process.stdin.on('end', () => {
  try {
    const data = JSON.parse(inputData);
    const toolName = data.tool_name || data.name || '';
    const toolResult = data.result || data.output || '';

    if (toolName) {
      const record = {
        id: randomUUID(),
        type: 'tool_execution',
        tool_name: toolName,
        result: typeof toolResult === 'string' ? toolResult.substring(0, 500) : JSON.stringify(toolResult).substring(0, 500),
        timestamp: new Date().toISOString(),
      };

      // 记录到主文件
      fs.appendFileSync(MEMORY_FILE, JSON.stringify(record) + '\n', 'utf8');
      console.error(`✅ Recorded tool execution: ${toolName}`);

      // 添加到当前会话数据
      if (fs.existsSync(SESSION_FILE)) {
        const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
        sessionData.push(record);
        fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2), 'utf8');
      }
    }
  } catch (error) {
    console.error(`❌ Error processing tool execution: ${error.message}`);
  }
});
