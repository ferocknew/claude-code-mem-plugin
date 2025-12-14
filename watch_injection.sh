#!/bin/bash
# 实时记忆注入日志记录器

LOG_FILE="$HOME/.claude-code-mem/injection_debug.log"

# 创建日志文件
touch "$LOG_FILE"

echo "🔍 开始监控记忆注入..."
echo "📁 日志文件: $LOG_FILE"
echo ""
echo "💡 提示:"
echo "  1. 在另一个终端运行此脚本"
echo "  2. 在 Claude Code 中提问"
echo "  3. 观察此窗口的实时输出"
echo ""
echo "⏺️  等待注入事件..."
echo ""

# 实时监控日志文件
tail -f "$LOG_FILE" 2>/dev/null &
TAIL_PID=$!

# 清理函数
cleanup() {
    echo ""
    echo "🛑 停止监控"
    kill $TAIL_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# 保持运行
wait $TAIL_PID
