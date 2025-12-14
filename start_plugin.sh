#!/bin/bash
# 加载 .env 并启动 Claude Code 插件的辅助脚本

set -e

# 加载 .env 文件
if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
fi

# 导出环境变量供 Claude Code 使用
export UVX_INDEX_URL="${UVX_INDEX_URL:-https://pypi.org/simple}"

echo "🚀 启动 Claude Code Memory Plugin"
echo "📋 配置："
echo "  UVX_INDEX_URL: $UVX_INDEX_URL"
echo ""
echo "现在可以在 Claude Code 中使用插件了"
echo ""
echo "提示：确保 .env 文件中配置了 UVX_INDEX_URL"
