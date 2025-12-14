#!/usr/bin/env node
/**
 * Claude Memory Plugin - 跨平台安装脚本
 * 动态配置 MCP 服务器索引 URL
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 Claude Memory Plugin - 安装配置');
console.log('==========================================');

// 获取插件根目录
const pluginRoot = path.join(__dirname, '..');
const pluginJsonPath = path.join(__dirname, 'plugin.json');

console.log(`📍 插件目录: ${pluginRoot}`);

// 读取 plugin.json
let pluginConfig;
try {
  const content = fs.readFileSync(pluginJsonPath, 'utf8');
  pluginConfig = JSON.parse(content);
} catch (error) {
  console.error('❌ 无法读取 plugin.json:', error.message);
  process.exit(1);
}

// 检查环境变量 UVX_INDEX_URL
const uvxIndexUrl = process.env.UVX_INDEX_URL;

if (uvxIndexUrl) {
  console.log(`✅ 检测到 UVX_INDEX_URL: ${uvxIndexUrl}`);

  // 修改 mcpServers 配置
  if (pluginConfig.mcpServers && pluginConfig.mcpServers['claude-memory']) {
    const args = pluginConfig.mcpServers['claude-memory'].args;

    // 检查是否已经有 --index-url 参数
    const indexUrlIndex = args.indexOf('--index-url');

    if (indexUrlIndex >= 0) {
      // 更新现有的 --index-url
      args[indexUrlIndex + 1] = uvxIndexUrl;
      console.log('🔄 更新 --index-url 参数');
    } else {
      // 在 --from 之前插入 --index-url
      const fromIndex = args.indexOf('--from');
      if (fromIndex >= 0) {
        args.splice(fromIndex, 0, '--index-url', uvxIndexUrl);
        console.log('➕ 添加 --index-url 参数');
      }
    }

    // 保存修改后的配置
    try {
      fs.writeFileSync(
        pluginJsonPath,
        JSON.stringify(pluginConfig, null, 2) + '\n',
        'utf8'
      );
      console.log('✅ plugin.json 配置已更新');
    } catch (error) {
      console.error('❌ 无法写入 plugin.json:', error.message);
      process.exit(1);
    }
  }
} else {
  console.log('ℹ️  未检测到 UVX_INDEX_URL 环境变量，使用默认 PyPI 源');

  // 如果没有环境变量，确保移除 --index-url 参数（如果存在）
  if (pluginConfig.mcpServers && pluginConfig.mcpServers['claude-memory']) {
    const args = pluginConfig.mcpServers['claude-memory'].args;
    const indexUrlIndex = args.indexOf('--index-url');

    if (indexUrlIndex >= 0) {
      // 移除 --index-url 及其值
      args.splice(indexUrlIndex, 2);
      console.log('🔄 移除自定义 --index-url 参数');

      // 保存修改
      try {
        fs.writeFileSync(
          pluginJsonPath,
          JSON.stringify(pluginConfig, null, 2) + '\n',
          'utf8'
        );
        console.log('✅ plugin.json 配置已更新');
      } catch (error) {
        console.error('❌ 无法写入 plugin.json:', error.message);
        process.exit(1);
      }
    }
  }
}

console.log('');
console.log('🎉 插件安装配置完成！');
console.log('');
console.log('📝 MCP 服务器配置:');
if (pluginConfig.mcpServers && pluginConfig.mcpServers['claude-memory']) {
  console.log('   命令:', pluginConfig.mcpServers['claude-memory'].command);
  console.log('   参数:', pluginConfig.mcpServers['claude-memory'].args.join(' '));
}
console.log('');
