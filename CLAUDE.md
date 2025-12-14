# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个基于 MCP (Model Context Protocol) 的 Claude Code 记忆插件，用于记录和管理系统对话内容。项目包含客户端 Hook 机制和服务端 API，通过 FastMCP 实现 Claude Code 工具集成。

## 常用命令

### 环境设置
```bash
# 一键初始化项目（推荐）
./scripts/setup.sh

# 使用 uv 创建虚拟环境并安装依赖
uv sync

# 激活虚拟环境（可选）
source .venv/bin/activate

# 复制环境变量模板
cp env.example .env
```

### 服务启动
```bash
# 使用 Docker Compose 启动服务（推荐）
docker compose up -d

# 查看服务日志
docker compose logs -f memory-server

# 直接启动服务（开发模式）
uv run python server/main.py

# 或使用 uvicorn
uv run uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
```

### 数据库操作
```bash
# 初始化数据库
uv run python scripts/init_db.py

# 测试数据库连接
python scripts/init_db.py
```

### 测试
```bash
# 运行单元测试
uv run pytest

# 运行系统测试
uv run python scripts/test_system.py

# MCP Inspector 测试
npx @modelcontextprotocol/inspector http://localhost:8000/mcp

# 示例客户端测试
python examples/client_example.py
```

### 开发工具
```bash
# 代码格式化
uv run black .
uv run isort .

# 类型检查
uv run mypy server/

# MCP 开发模式
uv run mcp dev server/mcp_server.py
```

### Claude Code 配置
```bash
# 添加 MCP 服务器到 Claude Code
claude mcp add memory-server http://localhost:8000/mcp

# 列出已配置的 MCP 服务器
claude mcp list
```

## 项目架构

### 核心组件

1. **MCP 服务器** (`server/mcp_server.py`)
   - 基于 FastMCP 实现
   - 提供对话记录、搜索、总结等工具
   - 通过 HTTP 端点 `/mcp` 暴露服务

2. **FastAPI 服务** (`server/main.py`)
   - 提供 REST API 接口
   - 管理数据库和缓存连接
   - 处理应用生命周期

3. **数据层**
   - `server/database.py`: SQLAlchemy 异步数据库操作
   - `server/redis_cache.py`: Redis 缓存层
   - `server/models.py`: Pydantic 数据模型

4. **客户端 Hook** (`client/claude_code_hook.py`)
   - 捕获用户输入和助手响应
   - 自动记录对话内容到服务端

### 数据模型

- **Conversation**: 对话会话，包含标题、元数据
- **Message**: 消息记录，支持 user/assistant/system/tool 角色
- **ToolExecution**: 工具执行记录
- **Summary**: 对话总结

### MCP 工具

插件提供以下 MCP 工具：
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

### 存储架构

- **SQLite**: 默认持久化存储（开发环境）
- **PostgreSQL**: 生产环境可选数据库
- **Redis**: 缓存层，提升查询性能

## 开发指南

### 添加新功能

1. 在 `models.py` 中定义数据模型
2. 在 `database.py` 中添加数据库操作方法
3. 在 `mcp_server.py` 中添加 MCP 工具实现
4. 在 `main.py` 中添加对应的 REST API 端点（如需要）
5. 更新 `.claude-plugin/plugin.json` 中的工具定义

### 环境变量

项目使用 `.env` 文件管理配置：
- `DATABASE_URL`: 数据库连接字符串
- `REDIS_HOST/PORT/PASSWORD`: Redis 连接配置
- `HOST/PORT`: 服务监听地址

### Docker 部署

- 开发环境：`docker compose up -d`
- 生产环境：`docker compose -f compose.prod.yaml up -d`

### Hook 机制

插件通过 Claude Code 的 hook 机制自动记录对话：
- `onUserInput`: 记录用户输入
- `onAssistantResponse`: 记录助手响应
- `onToolExecution`: 记录工具执行

## 注意事项

- 项目使用 Python 3.12+，推荐使用 uv 进行依赖管理
- SQLite 数据文件存储在 `./data/` 目录
- Redis 密码通过环境变量配置，生产环境必须设置
- MCP 服务器默认运行在 `http://localhost:8000/mcp`
- 所有异步数据库操作使用 SQLAlchemy 2.0 语法
- 代码格式化使用 Black (line-length=88) 和 isort
- 类型检查使用 mypy，要求所有公共函数有类型注解