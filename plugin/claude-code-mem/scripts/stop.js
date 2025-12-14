#!/usr/bin/env node
/**
 * 停止 Hook - 记录助手响应并提交分析任务到 Worker
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const { randomUUID } = require('crypto');

const DATA_DIR = path.join(os.homedir(), '.claude-code-mem');
const MEMORY_FILE = path.join(DATA_DIR, 'mem.jsonl');
const SESSION_FILE = path.join(DATA_DIR, 'current_session.json');

const WORKER_PORT = process.env.CLAUDE_MEM_WORKER_PORT || 37777;
const WORKER_HOST = process.env.CLAUDE_MEM_WORKER_HOST || '127.0.0.1';
const WORKER_URL = `http://${WORKER_HOST}:${WORKER_PORT}`;

// 从环境变量获取助手响应
const assistantResponse = process.env.CLAUDE_RESPONSE || '';

/**
 * 记录助手响应
 */
if (assistantResponse) {
  const record = {
    id: randomUUID(),
    type: 'assistant_message',
    content: assistantResponse,
    timestamp: new Date().toISOString(),
  };

  fs.appendFileSync(MEMORY_FILE, JSON.stringify(record) + '\n', 'utf8');
  console.error(`✅ Recorded assistant response: ${assistantResponse.substring(0, 50)}...`);

  // 也添加到会话数据
  if (fs.existsSync(SESSION_FILE)) {
    try {
      const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      sessionData.push(record);
      fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2), 'utf8');
    } catch (error) {
      // 忽略错误
    }
  }
}

/**
 * 提交分析任务到 Worker
 */
async function submitToWorker() {
  // 读取会话数据
  if (!fs.existsSync(SESSION_FILE)) {
    console.error('⚠️  No session file found, skipping analysis');
    return;
  }

  try {
    const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));

    // 会话太短，跳过
    if (sessionData.length < 2) {
      console.error('⚠️  Session too short, skipping analysis');
      return;
    }

    // 提交到 Worker
    const data = JSON.stringify({
      sessionData,
      sessionId: Date.now(),
    });

    const options = {
      hostname: WORKER_HOST,
      port: WORKER_PORT,
      path: '/api/analyze',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
      timeout: 2000, // 2 秒超时
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 202) {
          console.error('✅ Analysis queued in Worker');
        } else {
          console.error('⚠️  Worker returned status', res.statusCode);
        }
      });
    });

    req.on('error', (error) => {
      console.error('⚠️  Worker not available, falling back to local analysis');
      // Worker 不可用，回退到本地分析
      setImmediate(() => {
        analyzeLocally(sessionData).catch(console.error);
      });
    });

    req.on('timeout', () => {
      req.destroy();
      console.error('⚠️  Worker timeout, falling back to local analysis');
      setImmediate(() => {
        analyzeLocally(sessionData).catch(console.error);
      });
    });

    req.write(data);
    req.end();

  } catch (error) {
    console.error(`❌ Error submitting to worker: ${error.message}`);
  }
}

/**
 * 本地分析（回退方案）
 */
async function analyzeLocally(sessionData) {
  try {
    const { analyzeSession } = require('./llm_analyzer');
    const analysis = await analyzeSession(sessionData);

    if (!analysis) {
      return;
    }

    // 记录总结
    const summaryRecord = {
      id: randomUUID(),
      type: 'session_summary',
      format: 'structured',
      investigated: analysis.investigated || '',
      learned: analysis.learned || '',
      completed: analysis.completed || '',
      next_steps: analysis.next_steps || '',
      timestamp: new Date().toISOString(),
      message_count: sessionData.length,
      analyzed_by: 'local',
    };

    fs.appendFileSync(MEMORY_FILE, JSON.stringify(summaryRecord) + '\n', 'utf8');
    console.error(`✅ Local analysis completed`);

    // 记录观察
    if (analysis.observations && analysis.observations.length > 0) {
      for (const obs of analysis.observations) {
        const obsRecord = {
          id: randomUUID(),
          type: 'observation',
          obs_type: obs.type,
          title: obs.title,
          insight: obs.insight,
          concepts: obs.concepts || [],
          files: obs.files || [],
          timestamp: new Date().toISOString(),
        };
        fs.appendFileSync(MEMORY_FILE, JSON.stringify(obsRecord) + '\n', 'utf8');
      }
      console.error(`✅ Recorded ${analysis.observations.length} observations`);
    }

    // 清理会话文件
    fs.unlinkSync(SESSION_FILE);

  } catch (error) {
    console.error(`❌ Local analysis failed: ${error.message}`);
  }
}

// 提交到 Worker（异步，不阻塞）
submitToWorker();

// Hook 立即返回
console.error(`✅ Session end recorded, analysis submitted to Worker`);
