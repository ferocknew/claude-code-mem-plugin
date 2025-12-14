# Claude Code Memory Plugin

基于 MCP (Model Context Protocol) 的 Claude Code 记忆插件，用于记录和管理系统对话内容。

## 项目架构

### 客户端 (Claude Code 插件)
- 使用 MCP 协议与 Claude Code 集成
- 通过 hook 机制捕获用户输入和 LLM 响应
- 实时记录对话内容到服务端

### 服务端 (FastAPI + Redis + SQLite)
- **FastAPI**: 提供 REST API 接口
- **Redis**: 缓存和实时数据存储
- **SQLite**: 持久化存储对话历史
- **MCP Server**: 作为 MCP 服务器向 Claude Code 提供工具

## 功能特性

### MCP 工具功能
- ✅ `record_user_input` - 记录用户输入内容
- ✅ `record_assistant_response` - 记录助手响应内容
- ✅ `record_tool_execution` - 记录工具执行信息
- ✅ `search_conversations` - 搜索对话会话
- ✅ `search_messages` - 搜索消息内容
- ✅ `get_conversation_messages` - 获取会话消息
- ✅ `generate_conversation_summary` - 生成对话总结
- ✅ `get_conversation_stats` - 获取会话统计信息
- ✅ `list_recent_conversations` - 列出最近对话
- ✅ `get_memory_system_status` - 获取系统状态

### 核心特性
- 🔄 实时记录对话内容到 SQLite 数据库
- 🚀 Redis 缓存提升查询性能
- 🔍 全文搜索对话历史
- 📊 自动生成对话总结
- 🐳 Docker Compose 一键部署
- 🌐 REST API 接口
- 🔌 MCP 协议支持

## 快速开始

### 环境要求
- Python 3.12+
- Node.js 18+ (用于 Claude Code)
- Docker & Docker Compose

### 一键初始化 (推荐)

使用提供的初始化脚本快速设置项目：

```bash
# 克隆项目后运行初始化脚本
./scripts/setup.sh
```

### 手动安装依赖

#### 使用 pip
```bash
# 安装 Python 依赖
pip install -r requirements.txt
```

#### 使用 uv (推荐)
```bash
# 安装 uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# 创建 .venv 虚拟环境并安装依赖
uv sync

# 激活虚拟环境 (可选，uv 会自动管理)
source .venv/bin/activate

# 或者直接使用 uv run 运行命令（推荐）
uv run python server/main.py
```

### 配置环境变量

项目使用 `.env` 文件来管理环境变量：

```bash
# 复制环境变量模板
cp env.example .env

# 编辑配置文件
nano .env
```

> **注意**: `.env` 文件已添加到 `.gitignore`，不会被提交到版本控制中。

### 启动服务

#### 方法一：使用 Docker Compose (推荐)
```bash
# 复制环境变量文件
cp env.example .env

# 编辑环境变量 (可选)
# nano .env

# 启动服务
docker compose up -d

# 查看日志
docker compose logs -f memory-server
```

#### 方法二：直接运行
```bash
# 初始化数据库
python scripts/init_db.py

# 启动服务
uv run python server/main.py

# 或者使用 uvicorn
uv run uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
```

### 配置 Claude Code

#### 1. 启动 Claude Code
```bash
claude
```

#### 2. 添加 MCP 服务器
```bash
# 在 Claude Code 中添加记忆服务器
claude mcp add memory-server http://localhost:8000/mcp
```

#### 3. 验证配置
```bash
# 列出已配置的 MCP 服务器
claude mcp list
```

### 测试功能

#### 使用示例客户端
```bash
# 运行示例客户端测试功能
python examples/client_example.py
```

#### 使用 MCP Inspector
```bash
# 安装 MCP Inspector
npm install -g @modelcontextprotocol/inspector

# 启动 Inspector 并连接到服务器
npx @modelcontextprotocol/inspector http://localhost:8000/mcp
```

#### 使用 API 直接测试
```bash
# 健康检查
curl http://localhost:8000/health

# 创建对话会话
curl -X POST http://localhost:8000/conversations \
  -H "Content-Type: application/json" \
  -d '{"title": "测试对话", "metadata": {"source": "api_test"}}'

# 记录消息
curl -X POST http://localhost:8000/messages \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_id": "your_conversation_id",
    "role": "user",
    "content": "测试消息",
    "metadata": {"test": true}
  }'

# 搜索对话
curl -X POST http://localhost:8000/search/conversations \
  -H "Content-Type: application/json" \
  -d '{"query": "测试", "limit": 5}'

# 获取系统统计
curl http://localhost:8000/stats
```

### 系统测试
```bash
# 运行系统测试脚本
python scripts/test_system.py
```

### Hook 客户端
```bash
# 交互模式测试
python client/claude_code_hook.py --interactive

# 单次记录消息
python client/claude_code_hook.py "这是一条测试消息"
```

## 架构设计

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Claude Code   │    │   MCP Server    │    │   FastAPI API   │
│                 │◄──►│   (FastMCP)     │◄──►│                 │
│ • 用户输入      │    │ • 对话记录      │    │ • REST 接口     │
│ • LLM 响应      │    │ • 搜索查询      │    │ • 外部集成      │
│ • 工具执行      │    │ • 缓存管理      │    │ • 管理界面      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                    ┌─────────────────┐    ┌─────────────────┐
                    │   Redis Cache   │    │  SQLite Database │
                    │                 │    │                  │
                    │ • 会话缓存      │    │ • 对话历史       │
                    │ • 搜索结果      │    │ • 工具执行记录   │
                    │ • 统计数据      │    │ • 总结内容       │
                    └─────────────────┘    └─────────────────┘
```

## 部署选项

### 开发环境
```bash
# 1. 克隆项目
git clone <repository-url>
cd claude-code-mem-plugin

# 2. 安装依赖
uv sync

# 3. 初始化数据库
python scripts/init_db.py

# 4. 启动服务
uv run python server/main.py
```

### Docker 部署
```bash
# 使用 Docker Compose
docker compose up -d

# 查看日志
docker compose logs -f

# 停止服务
docker compose down
```

### 生产环境
```bash
# 使用 PostgreSQL 替代 SQLite
export DATABASE_URL="postgresql+asyncpg://user:pass@host:5432/db"

# 使用外部 Redis
export REDIS_HOST="redis-host"
export REDIS_PASSWORD="redis-pass"

# 启动服务
docker compose -f compose.prod.yaml up -d
```

## API 文档

### REST API 端点

#### 会话管理
- `GET /health` - 健康检查
- `POST /conversations` - 创建对话会话
- `GET /conversations` - 列出会话
- `GET /conversations/{id}` - 获取会话详情
- `GET /conversations/{id}/messages` - 获取会话消息

#### 消息管理
- `POST /messages` - 创建消息

#### 搜索功能
- `POST /search/conversations` - 搜索会话
- `POST /search/messages` - 搜索消息

#### 统计信息
- `GET /stats` - 获取系统统计

### MCP 协议
- `GET /mcp` - MCP Streamable HTTP 端点

## 开发

### 项目结构
```
claude-code-mem-plugin/
├── client/              # Claude Code Hook 客户端
│   └── claude_code_hook.py
├── server/              # 服务端代码
│   ├── main.py         # FastAPI 主服务
│   ├── mcp_server.py  # MCP 服务器实现
│   ├── database.py     # 数据库操作
│   ├── redis_cache.py  # Redis 缓存
│   └── models.py       # 数据模型
├── docker/             # Docker 配置
├── scripts/            # 工具脚本
│   ├── setup.sh        # 项目初始化脚本
│   ├── init_db.py      # 数据库初始化
│   └── test_system.py  # 系统测试
├── examples/           # 示例代码
├── tests/              # 测试代码
├── requirements.txt    # Python 依赖
├── pyproject.toml      # 项目配置
├── compose.yaml         # Docker Compose 配置
├── env.example         # 环境变量示例
├── .gitignore          # Git 忽略文件
└── README.md
```

### 开发环境设置
```bash
# 创建虚拟环境并安装所有依赖 (包括开发依赖)
uv sync

# 运行测试
uv run pytest

# 代码格式化
uv run black .
uv run isort .

# 类型检查
uv run mypy server/

# MCP 开发模式
uv run mcp dev server/mcp_server.py

# 启动开发服务器
uv run python server/main.py

# 数据库初始化
uv run python scripts/init_db.py

# 系统测试
uv run python scripts/test_system.py
```

### 添加新功能
1. 在 `models.py` 中定义数据模型
2. 在 `database.py` 中添加数据库操作
3. 在 `mcp_server.py` 中添加 MCP 工具
4. 在 `main.py` 中添加 REST API 端点
5. 添加相应的测试用例

## 故障排除

### 常见问题

#### 服务无法启动
```bash
# 检查端口是否被占用
lsof -i :8000

# 检查环境变量
cat .env

# 查看详细日志
docker compose logs memory-server
```

#### MCP 连接失败
```bash
# 测试 MCP 端点
curl http://localhost:8000/mcp

# 检查 Claude Code 配置
claude mcp list

# 使用 MCP Inspector 调试
npx @modelcontextprotocol/inspector http://localhost:8000/mcp
```

#### 数据库连接问题
```bash
# 检查 SQLite 文件权限
ls -la data/

# 测试数据库连接
python scripts/init_db.py
```

## 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。
