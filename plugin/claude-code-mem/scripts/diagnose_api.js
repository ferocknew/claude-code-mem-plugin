#!/usr/bin/env node
/**
 * API 配置诊断工具
 * 检查环境变量配置并测试 API 连接
 */

const https = require('https');
const http = require('http');

console.log('=== Claude API 配置诊断 ===\n');

// 检查环境变量
console.log('📋 环境变量检查:\n');

const envVars = {
  'ANTHROPIC_AUTH_TOKEN': process.env.ANTHROPIC_AUTH_TOKEN,
  'ANTHROPIC_API_KEY': process.env.ANTHROPIC_API_KEY,
  'CLAUDE_API_KEY': process.env.CLAUDE_API_KEY,
  'ANTHROPIC_BASE_URL': process.env.ANTHROPIC_BASE_URL,
  'ANTHROPIC_DEFAULT_HAIKU_MODEL': process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
  'ANTHROPIC_USE_BEARER_AUTH': process.env.ANTHROPIC_USE_BEARER_AUTH,
  'ANTHROPIC_SKIP_SSL_VERIFY': process.env.ANTHROPIC_SKIP_SSL_VERIFY,
};

for (const [key, value] of Object.entries(envVars)) {
  if (value) {
    // 隐藏敏感信息
    if (key.includes('TOKEN') || key.includes('KEY')) {
      const masked = value.substring(0, 8) + '***' + value.substring(value.length - 4);
      console.log(`  ✅ ${key}: ${masked}`);
    } else {
      console.log(`  ✅ ${key}: ${value}`);
    }
  } else {
    console.log(`  ⚪ ${key}: (未设置)`);
  }
}

// 确定使用的配置
console.log('\n🔧 当前配置:\n');

const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
const model = process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || 'claude-3-5-haiku-20241022';
const useBearerAuth = process.env.ANTHROPIC_USE_BEARER_AUTH === 'true';
const skipSslVerify = process.env.ANTHROPIC_SKIP_SSL_VERIFY === 'true';

let finalApiKey;
let source;

if (authToken) {
  finalApiKey = authToken;
  source = 'ANTHROPIC_AUTH_TOKEN (Claude Code)';
} else if (apiKey) {
  finalApiKey = apiKey;
  source = process.env.ANTHROPIC_API_KEY ? 'ANTHROPIC_API_KEY' : 'CLAUDE_API_KEY';
} else {
  console.log('  ❌ 错误: 未找到 API Key');
  console.log('  💡 请设置以下环境变量之一:');
  console.log('     - ANTHROPIC_AUTH_TOKEN (Claude Code 自动提供)');
  console.log('     - ANTHROPIC_API_KEY');
  console.log('     - CLAUDE_API_KEY');
  process.exit(1);
}

console.log(`  API Key 来源: ${source}`);
console.log(`  Base URL: ${baseUrl}`);
console.log(`  模型: ${model}`);
console.log(`  认证方式: ${useBearerAuth ? 'Bearer Token' : 'x-api-key'}`);
console.log(`  SSL 验证: ${skipSslVerify ? '已禁用 ⚠️' : '已启用'}`);

// 解析 URL
console.log('\n🌐 URL 解析:\n');

try {
  let apiUrl;
  if (baseUrl.includes('/v1/messages')) {
    apiUrl = new URL(baseUrl);
  } else {
    const baseUrlClean = baseUrl.replace(/\/$/, '');
    apiUrl = new URL(baseUrlClean + '/v1/messages');
  }

  const isHttps = apiUrl.protocol === 'https:';
  const httpModule = isHttps ? https : http;

  console.log(`  完整 URL: ${apiUrl.href}`);
  console.log(`  协议: ${apiUrl.protocol}`);
  console.log(`  主机名: ${apiUrl.hostname}`);
  console.log(`  端口: ${apiUrl.port || (isHttps ? 443 : 80)}`);
  console.log(`  路径: ${apiUrl.pathname}`);

  // 测试连接
  console.log('\n🔌 测试连接:\n');
  console.log('  发送测试请求...');

  const testData = JSON.stringify({
    model: model,
    max_tokens: 10,
    messages: [{ role: 'user', content: 'Hi' }],
  });

  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(testData),
  };

  if (useBearerAuth) {
    headers['Authorization'] = `Bearer ${finalApiKey}`;
  } else {
    headers['x-api-key'] = finalApiKey;
    headers['anthropic-version'] = '2023-06-01';
  }

  const options = {
    hostname: apiUrl.hostname,
    port: apiUrl.port || (isHttps ? 443 : 80),
    path: apiUrl.pathname + apiUrl.search,
    method: 'POST',
    headers: headers,
    timeout: 10000,
  };

  // 只有 HTTPS 才需要设置 SSL 验证选项
  if (isHttps) {
    options.rejectUnauthorized = !skipSslVerify;
  }

  const req = httpModule.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      console.log(`  状态码: ${res.statusCode}`);
      console.log(`  Content-Type: ${res.headers['content-type']}`);

      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log('\n  ✅ 连接成功！API 配置正确。');
        try {
          const parsed = JSON.parse(data);
          if (parsed.content) {
            console.log(`  响应: ${JSON.stringify(parsed.content[0], null, 2)}`);
          }
        } catch (e) {
          console.log(`  响应数据: ${data.substring(0, 200)}`);
        }
      } else {
        console.log(`\n  ❌ 请求失败 (${res.statusCode})`);
        console.log(`  响应: ${data.substring(0, 500)}`);
        
        if (res.statusCode === 401) {
          console.log('\n  💡 建议: API Key 可能无效或认证方式不正确');
          console.log('     - 检查 API Key 是否正确');
          console.log('     - 如果使用第三方 API，尝试设置 ANTHROPIC_USE_BEARER_AUTH=true');
        } else if (res.statusCode === 404) {
          console.log('\n  💡 建议: API 端点可能不正确');
          console.log('     - 检查 ANTHROPIC_BASE_URL 是否正确');
          console.log('     - 确认 API 提供商使用的端点路径');
        }
      }
    });
  });

  req.on('error', (error) => {
    console.log(`\n  ❌ 连接错误: ${error.message}`);
    console.log(`  错误代码: ${error.code}`);
    
    if (error.message.includes('SSL') || error.message.includes('certificate')) {
      console.log('\n  💡 建议: SSL 证书问题');
      console.log('     - 尝试设置 ANTHROPIC_SKIP_SSL_VERIFY=true (仅用于测试)');
      console.log('     - 检查系统时间是否正确');
      console.log('     - 确认网络连接正常');
    } else if (error.code === 'ENOTFOUND') {
      console.log('\n  💡 建议: 无法解析主机名');
      console.log('     - 检查 ANTHROPIC_BASE_URL 是否正确');
      console.log('     - 确认网络连接正常');
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.log('\n  💡 建议: 连接超时或被拒绝');
      console.log('     - 检查网络连接');
      console.log('     - 确认 API 服务是否可用');
    }
  });

  req.on('timeout', () => {
    req.destroy();
    console.log('\n  ❌ 请求超时 (10秒)');
    console.log('  💡 建议: 检查网络连接或 API 服务状态');
  });

  req.write(testData);
  req.end();

} catch (error) {
  console.log(`  ❌ URL 解析失败: ${error.message}`);
  console.log('  💡 建议: 检查 ANTHROPIC_BASE_URL 格式是否正确');
}
