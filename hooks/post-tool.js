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

// 从环境变量获取工具信息
const toolName = process.env.CLAUDE_TOOL_NAME || '';
const toolResult = process.env.CLAUDE_TOOL_RESULT || '';

if (toolName) {
  const record = {
    id: randomUUID(),
    type: 'tool_execution',
    tool_name: toolName,
    result: toolResult.substring(0, 500),
    timestamp: new Date().toISOString(),
  };

  fs.appendFileSync(MEMORY_FILE, JSON.stringify(record) + '\n', 'utf8');
  console.error(`✅ Recorded tool execution: ${toolName}`);
}
