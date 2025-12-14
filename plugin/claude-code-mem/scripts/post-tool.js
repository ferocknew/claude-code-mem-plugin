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

      fs.appendFileSync(MEMORY_FILE, JSON.stringify(record) + '\n', 'utf8');
      console.error(`✅ Recorded tool execution: ${toolName}`);
    }
  } catch (error) {
    console.error(`❌ Error processing tool execution: ${error.message}`);
  }
});
