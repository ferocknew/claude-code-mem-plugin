#!/bin/bash
# Claude Code Memory Plugin 包构建和发布脚本 - 使用 uv

set -e

echo "🚀 Claude Code Memory Plugin 发布到 Nexus3 (使用 uv)"
echo "=========================================="

# 加载 .env 文件
if [ -f ".env" ]; then
    echo "📋 从 .env 文件加载配置..."
    export $(grep -v '^#' .env | xargs)
    echo "  ✅ 配置加载完成"
else
    echo "❌ .env 文件不存在，请先创建 .env 文件"
    echo "示例内容："
    echo "NEXUS_USERNAME=admin"
    echo "NEXUS_PASSWORD=your_password"
    echo "NEXUS_URL=https://nexus3.m.6do.me:4000/"
    exit 1
fi

# 验证必需的环境变量
if [ -z "$NEXUS_USERNAME" ] || [ -z "$NEXUS_PASSWORD" ] || [ -z "$NEXUS_URL" ]; then
    echo "❌ 缺少必需的环境变量"
    echo "请在 .env 文件中配置："
    echo "  NEXUS_USERNAME"
    echo "  NEXUS_PASSWORD"
    echo "  NEXUS_URL"
    exit 1
fi

echo "📋 Nexus 配置："
echo "  URL: $NEXUS_URL"
echo "  Username: $NEXUS_USERNAME"

# 读取版本号
if [ ! -f "VERSION" ]; then
    echo "❌ VERSION 文件不存在"
    exit 1
fi

VERSION=$(cat VERSION | tr -d '\n\r')
echo ""
echo "📋 当前版本: $VERSION"

# 从 pyproject.toml 读取包名
PACKAGE_NAME=$(grep '^name = ' pyproject.toml | sed 's/name = "\(.*\)"/\1/')

# 同步版本号到 plugin.json 文件
echo "🔄 同步版本号到相关文件..."
# 更新根目录的 .claude-plugin/plugin.json
if [ -f ".claude-plugin/plugin.json" ]; then
    sed -i.bak 's/"version": "[^"]*"/"version": "'"$VERSION"'"/' .claude-plugin/plugin.json
    rm -f .claude-plugin/plugin.json.bak
    echo "  ✅ 更新 .claude-plugin/plugin.json"
fi

# 更新 plugin 目录的 .claude-plugin/plugin.json
if [ -f "plugin/.claude-plugin/plugin.json" ]; then
    sed -i.bak 's/"version": "[^"]*"/"version": "'"$VERSION"'"/' plugin/.claude-plugin/plugin.json
    rm -f plugin/.claude-plugin/plugin.json.bak
    echo "  ✅ 更新 plugin/.claude-plugin/plugin.json"
fi

# 更新 plugin 目录的 package.json
if [ -f "plugin/package.json" ]; then
    sed -i.bak 's/"version": "[^"]*"/"version": "'"$VERSION"'"/' plugin/package.json
    rm -f plugin/package.json.bak
    echo "  ✅ 更新 plugin/package.json"
fi

echo "📦 包信息:"
echo "  名称: $PACKAGE_NAME"
echo "  版本: $VERSION"

# 检查必要工具
echo ""
echo "🔍 检查构建环境..."
if ! command -v uv &> /dev/null; then
    echo "❌ uv 未安装，请先安装 uv"
    echo "安装命令: curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi
echo "  ✅ uv 已安装: $(uv --version)"

# 检查并创建虚拟环境
if [ ! -d ".venv" ]; then
    echo "⚠️  .venv 虚拟环境不存在，正在创建..."
    uv sync
fi

# 使用 uv 安装构建工具
echo "📥 安装构建工具..."
uv pip install build twine
echo "  ✅ 构建工具安装完成"

# 清理旧构建
echo ""
echo "🗑️  清理旧构建文件..."
rm -rf build/ dist/ *.egg-info/ src/*.egg-info/
echo "  ✅ 清理完成"

# 构建包 (使用 uv run)
echo ""
echo "📦 构建 Python 包..."
uv run python -m build

# 检查构建结果
if [ ! -d "dist" ] || [ -z "$(ls -A dist/)" ]; then
    echo "❌ 构建失败，dist 目录为空"
    exit 1
fi

echo ""
echo "✅ 构建完成，生成的文件："
ls -lh dist/

# 上传到 Nexus (使用 uv run)
echo ""
echo "🚀 上传到 Nexus3..."
echo "  Repository: $NEXUS_URL/repository/pip-hosted/"

uv run python -m twine upload \
  --repository-url "$NEXUS_URL/repository/pip-hosted/" \
  --username "$NEXUS_USERNAME" \
  --password "$NEXUS_PASSWORD" \
  --verbose \
  dist/*

if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 发布成功！版本 $VERSION"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📋 安装命令："
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "# 使用 pip 安装"
    echo "pip install -i $NEXUS_URL/repository/pypi-group/simple $PACKAGE_NAME==$VERSION"
    echo ""
    echo "# 使用 uv 安装"
    echo "uv pip install -i $NEXUS_URL/repository/pypi-group/simple $PACKAGE_NAME==$VERSION"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📋 Claude Code 插件使用 (uvx)："
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "# 直接运行 MCP 服务器"
    echo "uvx --index-url $NEXUS_URL/repository/pypi-group/simple --from $PACKAGE_NAME==$VERSION python -m server.main"
    echo ""
    echo "# 或者添加到 Claude Code 的 .claude-plugin/plugin.json："
    echo "{"
    echo "  \"mcpServers\": {"
    echo "    \"claude-memory\": {"
    echo "      \"command\": \"uvx\","
    echo "      \"args\": ["
    echo "        \"--index-url\", \"$NEXUS_URL/repository/pypi-group/simple\","
    echo "        \"--from\", \"$PACKAGE_NAME==$VERSION\","
    echo "        \"python\", \"-m\", \"server.main\""
    echo "      ]"
    echo "    }"
    echo "  }"
    echo "}"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
    echo ""
    echo "❌ 上传失败"
    exit 1
fi