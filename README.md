# Claude Code Memory Plugin

纯 JavaScript 的 Claude Code 记忆插件，通过 hooks 自动记录对话内容到本地 JSONL 文件。

---

## 🚀 快速安装

### 方式一：从 GitHub 安装（推荐）

```bash
# 在 Claude Code 中执行
/plugin install https://github.com/ferocknew/claude-code-mem-plugin.git
```

### 方式二：本地开发安装

```bash
# 1. 克隆项目
git clone https://github.com/ferocknew/claude-code-mem-plugin.git

# 2. 在 Claude Code 中安装
/plugin install /path/to/claude-code-mem-plugin
```

---

## 📋 功能特性

- ✅ **自动记录会话** - 自动记录会话开始/结束
- ✅ **记录用户输入** - 自动捕获用户的每次输入
- ✅ **记录工具执行** - 自动记录工具调用和结果
- ✅ **本地存储** - 数据保存在 `~/.claude-code-mem/mem.jsonl`
- ✅ **JSONL 格式** - 每行一个 JSON 对象，易于处理
- ✅ **跨平台** - 纯 JavaScript 实现，支持 Windows/Mac/Linux
- ✅ **零依赖** - 只使用 Node.js 内置模块，无需额外安装

---

## 📂 数据存储

### 存储位置

```
~/.claude-code-mem/mem.jsonl
```

### 数据格式

**会话事件:**
```json
{
  "type": "session_event",
  "event": "session_start",
  "timestamp": "2024-12-14T15:30:00.000Z"
}
```

**用户消息:**
```json
{
  "id": "uuid",
  "type": "user_message",
  "content": "用户输入的内容",
  "timestamp": "2024-12-14T15:30:00.000Z"
}
```

**工具执行:**
```json
{
  "id": "uuid",
  "type": "tool_execution",
  "tool_name": "read_file",
  "result": "工具执行结果（前500字符）",
  "timestamp": "2024-12-14T15:30:00.000Z"
}
```

---

## 🔧 项目结构

```
claude-code-mem-plugin/
├── plugin/                    # 插件主目录
│   ├── .claude-plugin/       # 插件配置
│   │   ├── plugin.json       # 插件元数据
│   │   ├── marketplace.json  # 市场配置
│   │   └── README.md         # 插件说明
│   ├── hooks/                # Hook 脚本
│   │   ├── hooks.json        # Hook 配置
│   │   ├── session-start.js  # 会话开始
│   │   ├── user-prompt.js    # 用户输入
│   │   ├── post-tool.js      # 工具执行后
│   │   └── stop.js           # 会话结束
│   └── package.json          # 插件包信息
├── update_version.sh          # 版本号同步脚本
├── LICENSE
├── README.md
└── VERSION
```

---

## 💡 使用说明

插件安装后会自动工作，无需额外配置。所有对话内容会自动记录到本地文件。

### 查看记录

```bash
# 查看所有记录
cat ~/.claude-code-mem/mem.jsonl

# 使用 jq 格式化查看
cat ~/.claude-code-mem/mem.jsonl | jq .

# 查看最近10条记录
tail -n 10 ~/.claude-code-mem/mem.jsonl | jq .

# 查找特定内容
grep "关键词" ~/.claude-code-mem/mem.jsonl | jq .

# 统计记录数量
wc -l ~/.claude-code-mem/mem.jsonl
```

### 数据备份

```bash
# 备份数据
cp ~/.claude-code-mem/mem.jsonl ~/.claude-code-mem/mem.backup.jsonl

# 按日期备份
cp ~/.claude-code-mem/mem.jsonl ~/.claude-code-mem/mem.$(date +%Y%m%d).jsonl

# 清空数据（重新开始）
rm ~/.claude-code-mem/mem.jsonl
```

---

## 🔧 开发指南

### Hook 说明

插件通过以下 hooks 捕获对话内容：

| Hook | 触发时机 | 记录内容 |
|------|---------|----------|
| **SessionStart** | 会话开始时 | 会话启动事件 |
| **UserPromptSubmit** | 用户提交输入时 | 用户输入内容 |
| **PostToolUse** | 工具执行后 | 工具名称和结果 |
| **Stop** | 会话结束时 | 会话结束事件 |

### 自定义扩展

可以编辑 `plugin/hooks/*.js` 文件来自定义记录逻辑：

```javascript
// 示例：添加自定义字段
const record = {
  id: randomUUID(),
  type: 'user_message',
  content: userInput,
  timestamp: new Date().toISOString(),
  custom_field: 'your_value'  // 自定义字段
};
```

### 版本管理

```bash
# 1. 更新 VERSION 文件
echo "0.2.0" > VERSION

# 2. 同步版本号到所有配置文件
./update_version.sh

# 3. 提交更改
git add -A
git commit -m "chore: bump version to 0.2.0"
git tag v0.2.0
git push && git push --tags
```

---

## 🐛 故障排除

### 数据未记录

```bash
# 检查目录是否存在
ls -la ~/.claude-code-mem/

# 检查文件权限
ls -l ~/.claude-code-mem/mem.jsonl

# 手动创建目录
mkdir -p ~/.claude-code-mem

# 检查文件是否可写
touch ~/.claude-code-mem/test.txt && rm ~/.claude-code-mem/test.txt
```

### 插件未生效

```bash
# 在 Claude Code 中检查插件状态
/plugin list

# 查看插件详情
/plugin show claude-code-mem

# 重新启用插件
/plugin disable claude-code-mem
/plugin enable claude-code-mem

# 重启 Claude Code
```

### Hook 脚本错误

```bash
# 手动测试 hook 脚本
cd plugin/hooks
node session-start.js

# 检查 Node.js 版本 (需要 18+)
node --version
```

---

## 📊 数据分析示例

使用 `jq` 进行数据分析：

```bash
# 统计消息类型分布
cat ~/.claude-code-mem/mem.jsonl | jq -r '.type' | sort | uniq -c

# 查看今天的记录
cat ~/.claude-code-mem/mem.jsonl | jq 'select(.timestamp | startswith("2024-12-14"))'

# 统计工具使用次数
cat ~/.claude-code-mem/mem.jsonl | jq -r 'select(.type=="tool_execution") | .tool_name' | sort | uniq -c

# 导出为 JSON 数组
cat ~/.claude-code-mem/mem.jsonl | jq -s '.' > export.json
```

---

## 📝 许可证

MIT License - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🔗 相关链接

- [Claude Code 文档](https://docs.claude.ai/code)
- [GitHub 仓库](https://github.com/ferocknew/claude-code-mem-plugin)
- [Issues](https://github.com/ferocknew/claude-code-mem-plugin/issues)
- [Discussions](https://github.com/ferocknew/claude-code-mem-plugin/discussions)

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## ⭐ Star History

如果这个项目对你有帮助，请给个 Star ⭐️
