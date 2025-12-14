#!/bin/bash
# 版本号同步脚本
# 从 VERSION 文件读取版本号并同步到所有相关文件

set -e

echo "🔄 同步版本号..."
echo "================================"

# 检查 VERSION 文件是否存在
if [ ! -f "VERSION" ]; then
    echo "❌ VERSION 文件不存在"
    exit 1
fi

# 读取版本号
VERSION=$(cat VERSION | tr -d '\n\r')
echo "📋 当前版本: $VERSION"

# 同步到 plugin/package.json
if [ -f "plugin/package.json" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' 's/"version": "[^"]*"/"version": "'"$VERSION"'"/' plugin/package.json
    else
        # Linux
        sed -i 's/"version": "[^"]*"/"version": "'"$VERSION"'"/' plugin/package.json
    fi
    echo "✅ 更新 plugin/package.json"
fi

# 同步到 plugin/.claude-plugin/plugin.json
if [ -f "plugin/.claude-plugin/plugin.json" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' 's/"version": "[^"]*"/"version": "'"$VERSION"'"/' plugin/.claude-plugin/plugin.json
    else
        sed -i 's/"version": "[^"]*"/"version": "'"$VERSION"'"/' plugin/.claude-plugin/plugin.json
    fi
    echo "✅ 更新 plugin/.claude-plugin/plugin.json"
fi

# 同步到 plugin/.claude-plugin/marketplace.json (如果有版本字段)
if [ -f "plugin/.claude-plugin/marketplace.json" ]; then
    if grep -q '"version"' plugin/.claude-plugin/marketplace.json; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' 's/"version": "[^"]*"/"version": "'"$VERSION"'"/' plugin/.claude-plugin/marketplace.json
        else
            sed -i 's/"version": "[^"]*"/"version": "'"$VERSION"'"/' plugin/.claude-plugin/marketplace.json
        fi
        echo "✅ 更新 plugin/.claude-plugin/marketplace.json"
    fi
fi

echo ""
echo "🎉 版本号同步完成！"
echo ""
echo "📝 下一步:"
echo "1. 检查更新: git diff"
echo "2. 提交更改: git add -A && git commit -m 'chore: bump version to $VERSION'"
echo "3. 打标签: git tag v$VERSION"
echo "4. 推送: git push && git push --tags"
echo ""
