#!/usr/bin/env node
/**
 * 会话开始 Hook
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const DATA_DIR = path.join(os.homedir(), '.claude-code-mem');
const MEMORY_FILE = path.join(DATA_DIR, 'mem.jsonl');
const SESSION_FILE = path.join(DATA_DIR, 'current_session.json');
const HEARTBEAT_FILE = path.join(DATA_DIR, 'heartbeat.txt');

const PORT = process.env.CLAUDE_MEM_WORKER_PORT || 37777;
const HOST = process.env.CLAUDE_MEM_WORKER_HOST || '127.0.0.1';

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 更新心跳
try {
  fs.writeFileSync(HEARTBEAT_FILE, Date.now().toString(), 'utf8');
} catch (error) {
  // 忽略心跳更新错误
}

// 记录会话开始
const record = {
  type: 'session_event',
  event: 'session_start',
  timestamp: new Date().toISOString(),
};

fs.appendFileSync(MEMORY_FILE, JSON.stringify(record) + '\n', 'utf8');
console.error(`✅ Session started at ${record.timestamp}`);

// 初始化当前会话文件（用于收集会话数据）
fs.writeFileSync(SESSION_FILE, JSON.stringify([]), 'utf8');
console.error(`✅ Initialized session data file`);

/**
 * 检查 Worker 状态并显示开场通知
 */
function checkWorkerStatus() {
  const req = http.get(`http://${HOST}:${PORT}/health`, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      if (res.statusCode === 200) {
        try {
          const health = JSON.parse(data);
          // Worker 运行正常，显示成功通知
          console.error(`
---
🎉  Note: This appears under Plugin Hook Error, but it's not an error. That's the only option for
    user messages in Claude Code UI until a better method is provided.
---

🧠 Claude Code Memory Plugin - 已加载

✅ Worker 运行中 (运行时间: ${Math.floor(health.uptime)}秒)
📊 当前统计: ${health.stats?.total_records || 0} 条记录
🌐 Web UI: http://${HOST}:${PORT}/

💡 功能特性:
   • 自动记录对话内容到本地 JSONL 文件
   • 智能内容分析和会话总结
   • 技术观察提取 (bugfix, feature, refactor 等)
   • 知识图谱构建
   • 记忆注入功能

📝 数据存储: ~/.claude-code-mem/mem.jsonl

💬 GitHub: https://github.com/ferocknew/claude-code-mem-plugin

---
This message was not added to your startup context, so you can continue working as normal.
          `);
          process.exit(3); // 退出码 3：只显示用户消息，不注入上下文
        } catch (error) {
          // 解析错误，显示警告
          showFirstTimeSetup();
        }
      } else {
        // Worker 响应异常
        showFirstTimeSetup();
      }
    });
  });

  req.on('error', () => {
    // Worker 未启动，显示首次安装通知
    showFirstTimeSetup();
  });

  req.setTimeout(1000, () => {
    req.destroy();
    showFirstTimeSetup();
  });
}

/**
 * 显示首次安装/Worker 未启动通知
 */
function showFirstTimeSetup() {
  console.error(`
---
🎉  Note: This appears under Plugin Hook Error, but it's not an error. That's the only option for
    user messages in Claude Code UI until a better method is provided.
---

⚠️  Claude Code Memory Plugin - 首次设置

Memory Worker 未启动或正在初始化中...

💡 启动 Worker 服务:
   node ${path.join(__dirname, 'start_worker.js')}

📝 功能说明:
   • 自动记录对话内容到本地 JSONL 文件
   • 智能内容分析和会话总结
   • 技术观察提取和知识图谱构建
   • 记忆注入功能

📂 数据存储位置: ~/.claude-code-mem/mem.jsonl
🌐 Web UI 端口: ${PORT}

💬 GitHub: https://github.com/ferocknew/claude-code-mem-plugin
📖 文档: 查看 README.md 了解更多

感谢安装 Claude Code Memory Plugin！

---
This message was not added to your startup context, so you can continue working as normal.
  `);
  process.exit(3); // 退出码 3：只显示用户消息，不注入上下文
}

// 检查 Worker 状态并显示开场通知
checkWorkerStatus();
