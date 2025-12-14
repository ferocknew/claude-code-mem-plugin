#!/bin/bash
# 一键验证记忆注入功能

echo "🎯 记忆注入功能验证"
echo "===================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查1: Hook 配置
echo "📋 检查1: Hook 配置"
if grep -q "memory_injector" ~/.claude/plugins/cache/ferocknew/claude-code-mem/0.2.6/hooks/hooks.json 2>/dev/null; then
    echo -e "  ${GREEN}✅ Hook 已配置${NC}"
else
    echo -e "  ${RED}❌ Hook 未配置${NC}"
fi
echo ""

# 检查2: 知识图谱
echo "📋 检查2: 知识图谱"
if [ -f ~/.claude-code-mem/knowledge_graph.jsonl ]; then
    ENTITY_COUNT=$(grep -c '"type":"entity"' ~/.claude-code-mem/knowledge_graph.jsonl 2>/dev/null || echo 0)
    RELATION_COUNT=$(grep -c '"type":"relation"' ~/.claude-code-mem/knowledge_graph.jsonl 2>/dev/null || echo 0)
    echo -e "  ${GREEN}✅ 知识图谱存在${NC}"
    echo "     实体: $ENTITY_COUNT 个"
    echo "     关系: $RELATION_COUNT 个"
else
    echo -e "  ${RED}❌ 知识图谱不存在${NC}"
fi
echo ""

# 检查3: 注入器脚本
echo "📋 检查3: 注入器脚本"
if [ -f ~/.claude/plugins/cache/ferocknew/claude-code-mem/0.2.6/scripts/memory_injector.js ]; then
    echo -e "  ${GREEN}✅ 注入器脚本存在${NC}"
else
    echo -e "  ${RED}❌ 注入器脚本不存在${NC}"
    exit 1
fi
echo ""

# 检查4: 配置文件
echo "📋 检查4: 配置状态"
if [ -f ~/.claude/plugins/cache/ferocknew/claude-code-mem/0.2.6/memory_config.json ]; then
    ENABLED=$(grep '"enabled"' ~/.claude/plugins/cache/ferocknew/claude-code-mem/0.2.6/memory_config.json | grep -o 'true\|false')
    SHOW_MARKER=$(grep '"show_marker"' ~/.claude/plugins/cache/ferocknew/claude-code-mem/0.2.6/memory_config.json | grep -o 'true\|false')

    echo -e "  ${GREEN}✅ 配置文件存在${NC}"
    echo "     enabled: $ENABLED"
    echo "     show_marker: $SHOW_MARKER"

    if [ "$ENABLED" = "false" ]; then
        echo -e "  ${YELLOW}⚠️  记忆注入已禁用${NC}"
    fi
else
    echo -e "  ${RED}❌ 配置文件不存在${NC}"
fi
echo ""

# 检查5: 测试注入功能
echo "📋 检查5: 测试注入功能"
cd ~/.claude/plugins/cache/ferocknew/claude-code-mem/0.2.6/scripts 2>/dev/null || exit 1

TEST_OUTPUT=$(echo '{"prompt":"SSL证书测试","content":"SSL证书测试"}' | node memory_injector.js 2>&1)

if echo "$TEST_OUTPUT" | grep -q "🧠 Memory injected"; then
    INJECTED=$(echo "$TEST_OUTPUT" | grep "🧠 Memory injected" | head -1)
    echo -e "  ${GREEN}✅ 注入功能正常${NC}"
    echo "     $INJECTED"
elif echo "$TEST_OUTPUT" | grep -q "🔍 No relevant memory found"; then
    echo -e "  ${YELLOW}⚠️  未找到相关记忆${NC}"
    echo "     这是正常的，说明关键词不匹配"
else
    echo -e "  ${RED}❌ 注入功能异常${NC}"
    echo "     输出: $TEST_OUTPUT"
fi
echo ""

# 总结
echo "📊 总结"
echo "------"

ALL_OK=true

if ! grep -q "memory_injector" ~/.claude/plugins/cache/ferocknew/claude-code-mem/0.2.6/hooks/hooks.json 2>/dev/null; then
    ALL_OK=false
fi

if [ ! -f ~/.claude-code-mem/knowledge_graph.jsonl ]; then
    ALL_OK=false
fi

if [ ! -f ~/.claude/plugins/cache/ferocknew/claude-code-mem/0.2.6/scripts/memory_injector.js ]; then
    ALL_OK=false
fi

if $ALL_OK; then
    echo -e "${GREEN}✅ 记忆注入系统完全正常！${NC}"
    echo ""
    echo "💡 使用建议:"
    echo "  1. 在终端运行: tail -f ~/.claude-code-mem/injection_debug.log"
    echo "  2. 在 Claude Code 中提问任何历史相关问题"
    echo "  3. 观察终端日志和 AI 回答"
    echo ""
    echo "🎯 测试问题示例:"
    echo "  - '之前做过什么SSL相关的工作?'"
    echo "  - '我们讨论过哪些技术问题?'"
    echo "  - '有关内存搜索的记录'"
else
    echo -e "${RED}❌ 存在问题，请检查上述输出${NC}"
fi

echo ""
echo "📁 日志文件位置:"
echo "  - 注入日志: ~/.claude-code-mem/injection_debug.log"
echo "  - Worker日志: ~/.claude-code-mem/worker.log"
echo "  - 原始记录: ~/.claude-code-mem/mem.jsonl"
echo ""
