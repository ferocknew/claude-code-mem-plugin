# Claude Memory Plugin 安装指南

本插件为 Claude Code 提供基于 MCP 协议的对话记忆功能。

## 功能特性

- ✅ 自动记录用户输入和助手响应
- ✅ 记录工具执行信息
- ✅ 全文搜索对话历史
- ✅ 生成对话总结
- ✅ 获取会话统计信息
- ✅ Redis 缓存提升性能

## 安装方式

### 方式一：通过插件市场安装（推荐）

```bash
# 添加插件市场
/plugin marketplace add yourusername/claude-code-mem-plugin

# 安装插件
/plugin install claude-mem

# 启用插件
/plugin enable claude-mem
```

### 方式二：本地安装

```bash
# 克隆项目
git clone https://github.com/yourusername/claude-code-mem-plugin.git
cd claude-code-mem-plugin

# 运行初始化脚本
./scripts/setup.sh

# 启动服务
uv run python server/main.py
```

## 配置

安装后，可以通过以下方式配置插件：

```bash
# 设置服务器 URL
/plugin config claude-mem server_url http://localhost:8000

# 启用/禁用自动记录
/plugin config claude-mem auto_record true

# 启用/禁用缓存
/plugin config claude-mem cache_enabled true
```

## 环境要求

- Python 3.12+
- Node.js 18+（用于 Claude Code）
- Docker & Docker Compose（可选）

## 使用说明

插件安装并启动服务后，会自动在后台记录对话内容。你可以使用以下 MCP 工具进行查询：

- `record_user_input` - 手动记录用户输入
- `record_assistant_response` - 手动记录助手响应
- `search_conversations` - 搜索对话会话
- `search_messages` - 搜索消息内容
- `get_conversation_messages` - 获取会话消息
- `generate_conversation_summary` - 生成对话总结
- `get_conversation_stats` - 获取会话统计
- `list_recent_conversations` - 列出最近对话
- `get_memory_system_status` - 获取系统状态

## Hook 功能

插件提供以下 Hook 自动捕获对话内容：

- `onUserInput` - 自动记录用户输入
- `onAssistantResponse` - 自动记录助手响应
- `onToolExecution` - 自动记录工具执行

## 故障排除

### 服务无法启动

```bash
# 检查端口占用
lsof -i :8000

# 查看日志
docker compose logs -f memory-server
```

### MCP 连接失败

```bash
# 测试 MCP 端点
curl http://localhost:8000/mcp

# 检查服务状态
curl http://localhost:8000/health
```

## 更多信息

详细文档请参考项目主 README.md 文件。

## 许可证

MIT License
