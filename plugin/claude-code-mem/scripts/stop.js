#!/usr/bin/env node
/**
 * 停止 Hook - 记录助手响应并提交分析任务到 Worker
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');

const DATA_DIR = path.join(os.homedir(), '.claude-code-mem');
const MEMORY_FILE = path.join(DATA_DIR, 'mem.jsonl');
const SESSION_FILE = path.join(DATA_DIR, 'current_session.json');
const LOG_FILE = path.join(DATA_DIR, 'injection_debug.log');

/**
 * 获取本地时间字符串
 */
function getLocalTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * 获取当前项目名称
 */
function getProjectName() {
  try {
    const projectPath = process.env.CLAUDE_WORKSPACE_PATH || process.cwd();
    return path.basename(projectPath);
  } catch (error) {
    return null;
  }
}

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 调试日志
function debugLog(message, data = null) {
  const timestamp = getLocalTimestamp();
  const logMessage = `[${timestamp}] [Stop] ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}\n`;
  
  try {
    fs.appendFileSync(LOG_FILE, logMessage, 'utf8');
  } catch (e) {
    // 忽略日志错误
  }
  
  console.error(`[Stop] ${message}`);
}

debugLog('Stop hook started', {
  session_file_exists: fs.existsSync(SESSION_FILE),
  project: getProjectName(),
});

/**
 * 分析会话数据
 */
async function analyzeSessionData() {
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

    // 详细打印每条消息的内容
    debugLog('=== 详细会话数据 ===');
    sessionData.forEach((record, index) => {
      debugLog(`消息 ${index + 1}:`, {
        type: record.type,
        role: record.role,
        content_length: record.content?.length || 0,
        content_preview: record.content?.substring(0, 200) || '',
        timestamp: record.timestamp,
        all_fields: Object.keys(record),
      });
    });
    debugLog('=== 会话数据结束 ===');

    // 会话太短，跳过（至少需要 1 条消息）
    if (sessionData.length < 1) {
      debugLog('Session too short, skipping analysis');
      return;
    }
    
    // 如果只有用户消息，也可以分析（基于用户请求生成总结）
    if (sessionData.length === 1) {
      debugLog('Single message session, will analyze based on user request');
    }

    debugLog('Starting analysis');
    await analyzeLocally(sessionData);

  } catch (error) {
    debugLog('Error analyzing session', { error: error.message, stack: error.stack });
  }
}

/**
 * 本地分析
 */
async function analyzeLocally(sessionData) {
  debugLog('Starting local analysis', { session_length: sessionData.length });

  // 打印传递给分析器的完整数据
  debugLog('=== 传递给 LLM 分析器的数据 ===');
  debugLog('Session data for analyzer:', {
    total_messages: sessionData.length,
    full_data: sessionData,
  });
  debugLog('=== 分析器输入数据结束 ===');

  try {
    const { analyzeSession } = require('./llm_analyzer');

    const analysis = await analyzeSession(sessionData);
    
    if (!analysis) {
      debugLog('Analysis returned null');
      return;
    }

    debugLog('=== LLM 分析结果 ===');
    debugLog('Analysis completed', {
      has_summary: !!analysis.investigated,
      observation_count: analysis.observations?.length || 0,
      full_analysis: analysis,
    });
    debugLog('=== 分析结果结束 ===');

    // 获取项目名称
    const projectName = getProjectName();

    // 记录总结
    const summaryRecord = {
      id: randomUUID(),
      type: 'session_summary',
      project: projectName,
      format: 'structured',
      investigated: analysis.investigated || '',
      learned: analysis.learned || '',
      completed: analysis.completed || '',
      next_steps: analysis.next_steps || '',
      timestamp: getLocalTimestamp(),
      message_count: sessionData.length,
      analyzed_by: 'stop_hook',
      model_used: analysis.model_used,
    };

    fs.appendFileSync(MEMORY_FILE, JSON.stringify(summaryRecord) + '\n', 'utf8');
    debugLog('Saved summary to file', { 
      id: summaryRecord.id, 
      project: projectName,
      summary: {
        investigated: summaryRecord.investigated.substring(0, 100),
        learned: summaryRecord.learned.substring(0, 100),
        completed: summaryRecord.completed.substring(0, 100),
      }
    });

    // 记录观察
    if (analysis.observations && analysis.observations.length > 0) {
      for (const obs of analysis.observations) {
        const obsRecord = {
          id: randomUUID(),
          type: 'observation',
          project: projectName,
          obs_type: obs.type,
          title: obs.title,
          insight: obs.insight,
          concepts: obs.concepts || [],
          files: obs.files || [],
          timestamp: getLocalTimestamp(),
        };
        fs.appendFileSync(MEMORY_FILE, JSON.stringify(obsRecord) + '\n', 'utf8');
        debugLog('Saved observation', { 
          type: obs.type, 
          title: obs.title 
        });
      }
      debugLog('Saved all observations', { count: analysis.observations.length });
    }

    // 清理会话文件
    if (fs.existsSync(SESSION_FILE)) {
      fs.unlinkSync(SESSION_FILE);
      debugLog('Cleaned up session file');
    }
    
    debugLog('Analysis complete and saved successfully');
  } catch (error) {
    debugLog('Local analysis failed', {
      error: error.message,
      stack: error.stack,
    });
  }
}

// 执行分析（异步，但不阻塞 hook 返回）
debugLog('Stop hook triggered, starting analysis...');

// 使用 setImmediate 确保 hook 立即返回，分析在后台进行
setImmediate(async () => {
  try {
    await analyzeSessionData();
    debugLog('Stop hook analysis completed');
  } catch (error) {
    debugLog('Stop hook analysis error', { error: error.message, stack: error.stack });
  }
});

console.error('✅ Stop hook completed, check ~/.claude-code-mem/injection_debug.log for details');
