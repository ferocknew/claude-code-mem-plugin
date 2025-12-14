# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个 Claude Code 记忆插件项目，包含两个核心组件：

1. **JavaScript 插件** (`plugin/claude-code-mem/`) - 纯 JavaScript 实现的本地记忆插件，通过 hooks 自动记录对话内容到本地 JSONL 文件
2. **Python MCP 服务器** (`server/`) - 基于 FastAPI 和 FastMCP 的服务端实现，提供更强大的记忆管理功能

项目支持本地文件存储和服务端数据库存储两种模式，用户可以根据需求选择使用。

## 常用命令

### 快速开始
```bash
# 一键初始化项目（推荐）
./scripts/setup.sh

# 激活虚拟环境
source .venv/bin/activate
```

### JavaScript 插件开发
```bash
# 进入插件目录
cd plugin/claude-code-mem

# 查看插件脚本
ls scripts/

# 测试 hook 脚本
node scripts/session-start.js
```

### Python MCP 服务器
```bash
# 使用 uv 创建虚拟环境并安装依赖
uv sync

# 启动服务（开发模式）
uv run python server/main.py

# 或使用 uvicorn
uv run uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload

# 初始化数据库
uv run python scripts/init_db.py
```

### Docker 部署
```bash
# 启动服务（推荐）
docker compose up -d

# 查看服务日志
docker compose logs -f memory-server

# 停止服务
docker compose down
```

### Claude Code 插件管理
```bash
# 安装本地插件
/plugin install ./plugin/claude-code-mem

# 从 GitHub 安装
/plugin marketplace add ferocknew/claude-code-mem-plugin
/plugin install claude-code-mem

# 添加 MCP 服务器
claude mcp add memory-server http://localhost:8000/mcp

# 查看已配置的 MCP 服务器
claude mcp list
```

### 测试和开发工具
```bash
# 运行测试
uv run pytest

# 代码格式化
uv run black .
uv run isort .

# 类型检查
uv run mypy server/

# MCP Inspector 测试
npx @modelcontextprotocol/inspector http://localhost:8000/mcp
```

## 项目架构

### JavaScript 插件架构 (`plugin/claude-code-mem/`)

```
plugin/claude-code-mem/
├── .claude-plugin/          # 插件配置
│   └── plugin.json         # 插件元数据 (version: 0.2.7)
├── hooks/                  # Hook 脚本目录
│   ├── session-start.js    # 会话开始 hook
│   ├── user-prompt.js      # 用户输入 hook
│   ├── post-tool.js        # 工具执行后 hook
│   ├── stop.js             # 会话结束 hook
│   ├── llm_analyzer.js     # LLM 分析器
│   ├── knowledge_graph_builder.js  # 知识图谱构建
│   ├── memory_injector.js  # 记忆注入器
│   └── worker.js           # 后台工作进程
├── scripts/                # 技能脚本
├── ui/                     # UI 组件
└── package.json            # Node.js 包配置 (version: 0.1.7)
```

**核心功能：**
- 自动记录会话开始/结束事件
- 捕获用户输入和助手响应
- 记录工具执行过程
- 智能内容分析和观察提取
- 会话总结生成
- 知识图谱构建
- 记忆注入功能
- 本地 JSONL 格式存储 (`~/.claude-code-mem/mem.jsonl`)

### Python MCP 服务器架构 (`server/`)

```
server/
├── main.py                 # FastAPI 主服务入口
├── mcp_server.py          # FastMCP 服务器实现
├── database.py            # SQLAlchemy 异步数据库操作
├── redis_cache.py         # Redis 缓存层
├── models.py              # Pydantic 数据模型
└── __init__.py
```

**核心功能：**
- REST API 接口
- MCP 工具集成
- 异步数据库操作
- Redis 缓存支持
- 健康检查和监控

### 数据模型

**JavaScript 插件数据格式：**
- `session_event`: 会话事件（开始/结束）
- `user_message`: 用户消息
- `tool_execution`: 工具执行记录
- `session_summary`: 结构化会话总结
- `observation`: 技术观察（bugfix, feature, refactor 等）

**Python 服务器数据模型：**
- `Conversation`: 对话会话
- `Message`: 消息记录
- `Summary`: 对话总结
- `ToolExecution`: 工具执行记录

### MCP 工具列表

Python MCP 服务器提供的工具：
- `record_user_input`: 记录用户输入
- `record_assistant_response`: 记录助手响应
- `record_tool_execution`: 记录工具执行
- `search_conversations`: 搜索对话会话
- `search_messages`: 搜索消息内容
- `get_conversation_messages`: 获取会话消息
- `generate_conversation_summary`: 生成对话总结
- `get_conversation_stats`: 获取会话统计
- `list_recent_conversations`: 列出最近对话
- `get_memory_system_status`: 获取系统状态

## 开发指南

### JavaScript 插件开发

1. **Hook 脚本修改**：编辑 `plugin/claude-code-mem/scripts/*.js` 文件
2. **版本管理**：使用 `update_version.sh` 同步版本号
3. **本地测试**：使用 Node.js 直接运行脚本进行测试

### Python 服务器开发

1. **添加新功能**：
   - 在 `models.py` 中定义数据模型
   - 在 `database.py` 中添加数据库操作方法
   - 在 `mcp_server.py` 中添加 MCP 工具实现
   - 在 `main.py` 中添加 REST API 端点

2. **环境变量配置**（`.env` 文件）：
   ```bash
   DATABASE_URL=sqlite+aiosqlite:///./data/memory.db
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=your_redis_password_here
   HOST=0.0.0.0
   PORT=8000
   ```

### 版本管理

```bash
# 更新版本号
echo "0.2.8" > VERSION

# 同步到所有配置文件
./update_version.sh

# 提交更改
git add -A
git commit -m "chore: bump version to 0.2.8"
git tag v0.2.8
git push && git push --tags
```

## 部署配置

### 开发环境

- **JavaScript 插件**：直接通过 Claude Code 插件机制安装
- **Python 服务器**：使用 `uv run python server/main.py` 启动
- **数据库**：默认使用 SQLite（`./data/memory.db`）
- **缓存**：可选 Redis（`localhost:6379`）

### 生产环境

- **Docker 部署**：`docker compose up -d`
- **数据库**：可选择 PostgreSQL
- **负载均衡**：支持多实例部署
- **监控**：内置健康检查和日志

## 故障排除

### JavaScript 插件问题

```bash
# 检查插件状态
/plugin list
/plugin show claude-code-mem

# 重新启用插件
/plugin disable claude-code-mem
/plugin enable claude-code-mem

# 检查数据文件
ls -la ~/.claude-code-mem/
cat ~/.claude-code-mem/mem.jsonl | jq .
```

### Python 服务器问题

```bash
# 检查服务状态
curl http://localhost:8000/health

# 查看日志
docker compose logs -f memory-server

# 数据库连接测试
uv run python scripts/init_db.py
```

## 重要说明

- **JavaScript 插件**：零依赖，纯本地存储，适合个人使用
- **Python 服务器**：功能更强大，支持多用户，适合团队协作
- **版本同步**：两个组件的版本号需要分别管理
  - JavaScript 插件：`plugin/claude-code-mem/package.json` 和 `plugin/claude-code-mem/.claude-plugin/plugin.json`
  - Python 服务器：`VERSION` 文件
- **数据迁移**：可以从 JavaScript 插件导入数据到 Python 服务器
- **兼容性**：两个版本可以独立使用，也可以配合使用