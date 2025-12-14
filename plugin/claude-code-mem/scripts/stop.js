#!/usr/bin/env node
/**
 * 停止 Hook - 记录助手响应并提交分析任务到 Worker
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { randomUUID } = require('crypto');

const DATA_DIR = path.join(os.homedir(), '.claude-code-mem');
const MEMORY_FILE = path.join(DATA_DIR, 'mem.jsonl');
const SESSION_FILE = path.join(DATA_DIR, 'current_session.json');
const DEBUG_FILE = path.join(DATA_DIR, 'stop_debug.log');

const WORKER_PORT = process.env.CLAUDE_MEM_WORKER_PORT || 37777;
const WORKER_HOST = process.env.CLAUDE_MEM_WORKER_HOST || '127.0.0.1';

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 调试日志
function debugLog(message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    message,
    data,
  };
  fs.appendFileSync(DEBUG_FILE, JSON.stringify(logEntry) + '\n', 'utf8');
  console.error(`[Stop] ${message}`);
}

debugLog('Stop hook started', {
  all_env_keys: Object.keys(process.env).filter(k => k.includes('CLAUDE') || k.includes('ASSISTANT') || k.includes('RESPONSE')),
  has_claude_response: !!process.env.CLAUDE_RESPONSE,
  session_file_exists: fs.existsSync(SESSION_FILE),
});

// 从环境变量获取助手响应
// Claude Code 可能使用不同的环境变量名
const assistantResponse =
  process.env.CLAUDE_RESPONSE ||
  process.env.ASSISTANT_RESPONSE ||
  process.env.CLAUDE_ASSISTANT_RESPONSE ||
  '';

debugLog('Assistant response check', {
  has_response: !!assistantResponse,
  response_length: assistantResponse.length,
  response_preview: assistantResponse.substring(0, 100),
});

/**
 * 记录助手响应
 */
if (assistantResponse) {
  try {
    const record = {
      id: randomUUID(),
      type: 'assistant_message',
      content: assistantResponse,
      timestamp: new Date().toISOString(),
    };

    fs.appendFileSync(MEMORY_FILE, JSON.stringify(record) + '\n', 'utf8');
    debugLog('Recorded assistant response', {
      id: record.id,
      length: assistantResponse.length,
    });

    // 也添加到会话数据
    if (fs.existsSync(SESSION_FILE)) {
      try {
        const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
        sessionData.push(record);
        fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2), 'utf8');
        debugLog('Added to session data', { session_length: sessionData.length });
      } catch (error) {
        debugLog('Error adding to session data', { error: error.message });
      }
    }
  } catch (error) {
    debugLog('Error recording assistant response', { error: error.message });
  }
} else {
  debugLog('No assistant response found - this might be a short session or context switch');
}

/**
 * 提交分析任务到 Worker
 */
function submitToWorker() {
  // 读取会话数据
  if (!fs.existsSync(SESSION_FILE)) {
    debugLog('No session file found, skipping analysis');
    return;
  }

  try {
    const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));

    debugLog('Session data loaded', {
      message_count: sessionData.length,
      types: sessionData.map(r => r.type),
    });

    // 会话太短，跳过
    if (sessionData.length < 2) {
      debugLog('Session too short, skipping analysis');
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
        'Content-Length': Buffer.byteLength(data), // 使用字节长度而不是字符长度
      },
      timeout: 2000, // 2 秒超时
    };

    debugLog('Submitting to Worker', {
      url: `http://${WORKER_HOST}:${WORKER_PORT}/api/analyze`,
      data_size: Buffer.byteLength(data),
    });

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 202) {
          debugLog('Analysis queued in Worker successfully', {
            status: res.statusCode,
            response: responseData,
          });
        } else {
          debugLog('Worker returned unexpected status', {
            status: res.statusCode,
            response: responseData,
          });
        }
      });
    });

    req.on('error', (error) => {
      debugLog('Worker not available, will use local analysis', {
        error: error.message,
      });
      // Worker 不可用，使用本地分析
      setImmediate(() => {
        analyzeLocally(sessionData);
      });
    });

    req.on('timeout', () => {
      req.destroy();
      debugLog('Worker timeout, will use local analysis');
      setImmediate(() => {
        analyzeLocally(sessionData);
      });
    });

    req.write(data);
    req.end();

  } catch (error) {
    debugLog('Error submitting to worker', { error: error.message, stack: error.stack });
  }
}

/**
 * 本地分析（回退方案）
 */
function analyzeLocally(sessionData) {
  debugLog('Starting local analysis', { session_length: sessionData.length });

  try {
    const { analyzeSession } = require('./llm_analyzer');

    analyzeSession(sessionData)
      .then((analysis) => {
        if (!analysis) {
          debugLog('Analysis returned null');
          return;
        }

        debugLog('Analysis completed', {
          has_summary: !!analysis.investigated,
          observation_count: analysis.observations?.length || 0,
        });

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
        debugLog('Saved summary to file', { id: summaryRecord.id });

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
          debugLog('Saved observations', { count: analysis.observations.length });
        }

        // 清理会话文件
        if (fs.existsSync(SESSION_FILE)) {
          fs.unlinkSync(SESSION_FILE);
          debugLog('Cleaned up session file');
        }
      })
      .catch((error) => {
        debugLog('Local analysis failed', {
          error: error.message,
          stack: error.stack,
        });
      });
  } catch (error) {
    debugLog('Failed to load analyzer', {
      error: error.message,
      stack: error.stack,
    });
  }
}

// 提交到 Worker
submitToWorker();

debugLog('Stop hook completed');
console.error('✅ Stop hook completed, check ~/.claude-code-mem/stop_debug.log for details');
