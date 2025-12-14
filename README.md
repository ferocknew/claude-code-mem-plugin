# Claude Code Memory Plugin

纯 JavaScript 的 Claude Code 记忆插件，通过 hooks 自动记录对话内容到本地 JSONL 文件。

---

## 🚀 快速安装

### 方式一：从 GitHub 安装（推荐）

```bash
# 在 Claude Code 中执行
/plugin marketplace add ferocknew/claude-code-mem-plugin

/plugin install claude-code-mem
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
- ✅ **智能内容分析** - 使用 Claude API 分析对话内容
- ✅ **观察提取** - 自动提取技术观察(bugfix, feature, refactor 等)
- ✅ **会话总结** - 自动生成请求总结和学习要点
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

**会话总结 (新格式 - 结构化摘要):**
```json
{
  "id": "uuid",
  "type": "session_summary",
  "format": "structured",
  "investigated": "🔍 用户尝试解决什么问题或询问了什么",
  "learned": "💡 从对话中学到的关键知识点或发现",
  "completed": "✅ 实际完成的工作和具体成果",
  "next_steps": "➡️ 建议的后续行动或待办事项",
  "message_count": 8,
  "timestamp": "2024-12-14T15:35:00.000Z"
}
```

**技术观察 (优化版):**
```json
{
  "id": "uuid",
  "type": "observation",
  "obs_type": "bugfix",
  "title": "修复内存泄漏",
  "insight": "使用 WeakMap 替代 Map 解决引用持有问题",
  "concepts": ["problem-solution", "gotcha"],
  "files": ["src/cache.js"],
  "timestamp": "2024-12-14T15:35:00.000Z"
}
```

**观察类型 (obs_type):**
- `bugfix` - 问题修复
- `feature` - 新功能实现
- `refactor` - 代码重构
- `discovery` - 发现/学习
- `decision` - 架构决策
- `change` - 代码变更

**概念标签 (concepts):**
- `how-it-works` - 工作原理
- `why-it-exists` - 存在原因
- `what-changed` - 变更内容
- `problem-solution` - 问题解决
- `gotcha` - 陷阱/注意事项
- `pattern` - 设计模式
- `trade-off` - 权衡取舍

---

## ⚙️ 配置

### 智能分析功能

插件支持使用 Claude API 进行智能内容分析。

#### 🎉 自动配置（推荐）

**如果您在 Claude Code 中使用本插件，无需任何配置！**

插件会自动使用 Claude Code 提供的认证信息：
- ✅ 自动使用 `ANTHROPIC_AUTH_TOKEN`
- ✅ 自动使用配置的模型（如 `ANTHROPIC_DEFAULT_HAIKU_MODEL`）
- ✅ 支持自定义 API 端点（如智谱 AI）
- ✅ 零配置，开箱即用

#### 手动配置（可选）

如果需要使用自己的 API Key：

```bash
# 设置环境变量
export ANTHROPIC_API_KEY="sk-ant-xxxxx"

# 或者使用别名
export CLAUDE_API_KEY="your-api-key-here"
```

**获取 API Key:**
1. 访问 [Anthropic Console](https://console.anthropic.com/)
2. 登录或注册账号
3. 在 API Keys 页面创建新的 API Key
4. 将 Key 添加到环境变量中

**分析功能说明:**
- 当设置了 API Key 时，插件会在会话结束时自动分析对话内容
- ⚡ **优化策略**: 只分析用户输入和助手的最终响应，不处理工具执行细节
- 📊 **结构化输出**: 生成类似截图的格式（investigated, learned, completed, next_steps）
- 🔍 **智能提取**: 自动识别技术观察（bugfix、feature、refactor等）
- 💰 **节省成本**: 每次会话只调用 1 次 API（之前是 2 次）
- 🛡️ **优雅降级**: 如果未设置 API Key，插件仍会正常工作，只是不会生成分析内容

---

## 🔧 项目结构

```
claude-code-mem-plugin/
├── plugin/                    # 插件主目录
│   └── claude-code-mem/      # 插件实现
│       ├── .claude-plugin/   # 插件配置
│       │   ├── plugin.json   # 插件元数据
│       │   └── README.md     # 插件说明
│       ├── hooks/            # Hook 配置
│       │   └── hooks.json    # Hook 定义
│       ├── scripts/          # Hook 脚本
│       │   ├── session-start.js  # 会话开始
│       │   ├── user-prompt.js    # 用户输入
│       │   ├── post-tool.js      # 工具执行后
│       │   ├── stop.js           # 会话结束
│       │   └── llm_analyzer.js   # LLM 分析器(新增)
│       ├── skills/           # 技能脚本
│       ├── ui/               # UI 组件
│       └── package.json      # 插件包信息
├── .claude-plugin/           # 市场配置
│   └── marketplace.json      # 市场元数据
├── update_version.sh         # 版本号同步脚本
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
