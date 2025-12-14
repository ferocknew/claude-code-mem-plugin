#!/bin/bash

# Claude Memory Plugin - Claude Code 插件安装脚本

set -e

echo "🚀 Claude Memory Plugin - Claude Code 插件安装"
echo "=============================================="

# 获取脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "📍 项目目录: $PROJECT_ROOT"

# 检查 uv 是否安装
if ! command -v uv &> /dev/null; then
    echo "❌ uv 未安装，正在安装..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.cargo/bin:$PATH"
fi

echo "✅ 检测到 uv $(uv --version)"

# 检查 Python 版本
PYTHON_VERSION=$(python3 --version 2>&1 | grep -oP '\d+\.\d+' | head -1)
REQUIRED_VERSION="3.12"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$PYTHON_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo "⚠️  警告: 建议使用 Python 3.12+，当前版本: Python $PYTHON_VERSION"
fi

# 创建虚拟环境并安装依赖
echo "📦 创建 .venv 虚拟环境并安装依赖..."
uv sync --quiet

echo "✅ 依赖安装完成"

# 初始化数据库
echo "🗄️  初始化数据库..."
uv run python scripts/init_db.py

echo "✅ 数据库初始化完成"

# 复制环境变量文件
if [ ! -f .env ]; then
    echo "📋 复制环境变量模板..."
    cp env.example .env
    echo "✅ 已创建 .env 文件"
else
    echo "ℹ️  .env 文件已存在"
fi

# 验证插件配置
echo "🔍 验证插件配置..."
if [ -f ".claude-plugin/plugin.json" ]; then
    echo "✅ plugin.json 配置文件存在"
else
    echo "❌ plugin.json 配置文件缺失"
    exit 1
fi

if [ -f ".claude-plugin/marketplace.json" ]; then
    echo "✅ marketplace.json 配置文件存在"
else
    echo "❌ marketplace.json 配置文件缺失"
    exit 1
fi

echo ""
echo "🎉 插件安装完成！"
echo ""
echo "📝 下一步操作:"
echo "1. 编辑 .env 文件配置环境变量"
echo "2. 启动服务: uv run python server/main.py"
echo "3. 或使用 Docker: docker compose up -d"
echo ""
echo "📦 在 Claude Code 中安装插件:"
echo "   /plugin marketplace add yourusername/claude-code-mem-plugin"
echo "   /plugin install claude-mem"
echo "   /plugin enable claude-mem"
echo ""
