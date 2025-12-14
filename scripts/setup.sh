#!/bin/bash

# Claude Code Memory Plugin - 项目初始化脚本
# 使用 uv 工具设置 .venv 虚拟环境

set -e

echo "🚀 Claude Code Memory Plugin - 项目初始化"
echo "=========================================="

# 检查 uv 是否安装
if ! command -v uv &> /dev/null; then
    echo "❌ uv 未安装，请先安装 uv:"
    echo "curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

echo "✅ 检测到 uv $(uv --version)"

# 检查 Python 版本
if ! python3 --version | grep -q "Python 3.12"; then
    echo "⚠️  警告: 建议使用 Python 3.12+"
    echo "当前版本: $(python3 --version)"
fi

# 创建 .venv 虚拟环境并安装依赖
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
    echo "✅ 已创建 .env 文件，请根据需要修改配置"
else
    echo "ℹ️  .env 文件已存在"
fi

# 验证设置
echo "🔍 验证项目设置..."
uv run python scripts/verify_setup.py

echo ""
echo "🎉 项目初始化完成！"
echo ""
echo "📝 下一步操作:"
echo "1. 编辑 .env 文件配置环境变量"
echo "2. 启动服务: uv run python server/main.py"
echo "3. 或使用 Docker: docker compose up -d"
echo "4. 配置 Claude Code: claude mcp add memory-server http://localhost:8000/mcp"
echo ""
echo "📚 查看完整文档: cat README.md"
