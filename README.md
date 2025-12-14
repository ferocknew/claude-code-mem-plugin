# Claude Code Memory Plugin

基于 MCP (Model Context Protocol) 的 Claude Code 记忆插件，通过本地 JSONL 文件记录和管理对话内容。

参考：[MCP 官方 memory server](https://github.com/modelcontextprotocol/servers/tree/main/src/memory)

---

## 🚀 快速安装

### 方式一：从 PyPI 安装（公开发布后）

```bash
# 在 Claude Code 中执行
/plugin marketplace add ferocknew/claude-code-mem-plugin
/plugin install claude-code-mem
```

### 方式二：从私有 Nexus 安装（开发调试）

```bash
# 1. 配置环境变量
export UVX_INDEX_URL=https://your-nexus-server/repository/pypi-group/simple

# 2. 启动 Claude Code
claude

# 3. 安装插件
/plugin install claude-code-mem
```

### 方式三：本地开发安装

```bash
# 1. 克隆项目
git clone https://github.com/<your-username>/claude-code-mem-plugin.git
cd claude-code-mem-plugin

# 2. 安装依赖
uv sync

# 3. 测试运行
uv run python client/mcp_client.py
```

---

## 📋 功能特性

### MCP 工具（参考官方 memory server）

| 工具 | 说明 |
|------|------|
| `create_entities` | 创建实体（知识节点） |
| `create_relations` | 创建实体间关系 |
| `add_observations` | 为实体添加观察记录 |
| `delete_entities` | 删除实体 |
| `delete_relations` | 删除关系 |
| `delete_observations` | 删除观察记录 |
| `read_graph` | 读取整个知识图谱 |
| `search_nodes` | 搜索实体和观察 |
| `open_nodes` | 获取指定实体详情 |

### 数据存储

- 📁 **本地存储**：`~/.claude-code-mem/mem.jsonl`
- 📝 **JSONL 格式**：每行一个 JSON 对象
- 🔍 **支持搜索**：全文搜索实体和观察内容
- 💾 **持久化**：数据永久保存在本地

---

## 💡 使用示例

### 创建知识实体

```python
# 创建一个技能实体
await create_entities([{
    "name": "Python开发",
    "entityType": "skill",
    "observations": ["熟悉FastMCP框架", "了解MCP协议"]
}])
```

### 添加观察记录

```python
# 为实体添加新的观察
await add_observations([{
    "entityName": "Python开发",
    "contents": ["今天完成了插件开发", "学习了知识图谱"]
}])
```

### 搜索记忆

```python
# 搜索包含关键词的内容
await search_nodes("FastMCP")
```

### 读取知识图谱

```python
# 获取所有实体、关系和观察
await read_graph()
```

---

## 🔧 开发者指南

### 发布到私有 Nexus

```bash
# 1. 配置 .env 文件
cat > .env << EOF
NEXUS_USERNAME=admin
NEXUS_PASSWORD=your_password
NEXUS_URL=https://your-nexus-server/
UVX_INDEX_URL=https://your-nexus-server/repository/pypi-group/simple
EOF

# 2. 更新版本号
echo "0.1.1" > VERSION

# 3. 构建并发布
./build_and_publish_uv.sh
```

### 项目结构

```
claude-code-mem-plugin/
├── client/              # 插件客户端（打包发布）
│   ├── mcp_client.py   # MCP 服务器实现
│   └── __init__.py
├── .claude-plugin/      # 插件配置
│   └── plugin.json     # 插件元数据
├── server/             # 服务端（独立部署，可选）
├── VERSION             # 版本号文件
├── build_and_publish_uv.sh  # 发布脚本
└── README.md
```

### 本地测试

```bash
# 测试插件
uv run python client/mcp_client.py

# 查看数据文件
cat ~/.claude-code-mem/mem.jsonl | jq .

# 查看文件大小
ls -lh ~/.claude-code-mem/mem.jsonl
```

---

## 📊 数据格式

### 实体（Entity）

```json
{
  "id": "uuid",
  "type": "entity",
  "name": "Python开发",
  "entityType": "skill",
  "observations": ["熟悉FastMCP"],
  "timestamp": "2024-12-14T..."
}
```

### 关系（Relation）

```json
{
  "id": "uuid",
  "type": "relation",
  "from": "entity1_id",
  "to": "entity2_id",
  "relationType": "relates_to",
  "timestamp": "2024-12-14T..."
}
```

### 观察（Observation）

```json
{
  "id": "uuid",
  "type": "observation",
  "entityName": "Python开发",
  "contents": ["今天学习了MCP"],
  "timestamp": "2024-12-14T..."
}
```

---

## ⚙️ 配置说明

### 环境变量（开发调试）

在 `~/.zshrc` 或 `~/.bashrc` 中配置：

```bash
# 使用私有 Nexus
export UVX_INDEX_URL=https://your-nexus-server/repository/pypi-group/simple
```

### 插件配置

`.claude-plugin/plugin.json` 会自动读取环境变量：

```json
{
  "name": "claude-code-mem",
  "version": "0.1.1",
  "author": {
    "name": "ferocknew"
  },
  "repository": "https://github.com/ferocknew/claude-code-mem-plugin"
}
```

---

## 🐛 故障排除

### 插件无法安装

```bash
# 检查环境变量
echo $UVX_INDEX_URL

# 手动测试安装
uvx --from claude-code-mem-plugin claude-mem-client
```

### 数据文件位置

```bash
# 查看数据目录
ls -la ~/.claude-code-mem/

# 查看文件内容
cat ~/.claude-code-mem/mem.jsonl
```

### 清理数据

```bash
# 备份数据
cp ~/.claude-code-mem/mem.jsonl ~/.claude-code-mem/mem.backup.jsonl

# 清空数据
rm ~/.claude-code-mem/mem.jsonl
```

---

## 📝 许可证

MIT License - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🔗 相关链接

- [MCP 官方文档](https://modelcontextprotocol.io/)
- [MCP 官方 memory server](https://github.com/modelcontextprotocol/servers/tree/main/src/memory)
- [FastMCP 框架](https://github.com/jlowin/fastmcp)
