#!/usr/bin/env python3
"""
验证 Claude Code 插件配置
"""
import json
import os
import sys
from pathlib import Path


def check_file_exists(file_path: Path, description: str) -> bool:
    """检查文件是否存在"""
    if file_path.exists():
        print(f"✅ {description}: {file_path}")
        return True
    else:
        print(f"❌ {description} 缺失: {file_path}")
        return False


def validate_json_file(file_path: Path, required_fields: list) -> bool:
    """验证 JSON 文件格式"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            print(f"  ⚠️  缺少必需字段: {', '.join(missing_fields)}")
            return False

        print(f"  ✅ JSON 格式正确，包含所有必需字段")
        return True
    except json.JSONDecodeError as e:
        print(f"  ❌ JSON 格式错误: {e}")
        return False
    except Exception as e:
        print(f"  ❌ 读取文件失败: {e}")
        return False


def main():
    """主函数"""
    print("🔍 验证 Claude Code 插件配置")
    print("=" * 50)

    # 获取项目根目录
    script_dir = Path(__file__).parent
    project_root = script_dir.parent

    print(f"📍 项目目录: {project_root}")
    print()

    all_valid = True

    # 检查必需文件
    print("📋 检查必需文件...")
    required_files = [
        (project_root / ".claude-plugin" / "plugin.json", "插件配置文件"),
        (project_root / ".claude-plugin" / "marketplace.json", "市场配置文件"),
        (project_root / ".claude-plugin" / "README.md", "插件说明文档"),
        (project_root / "LICENSE", "许可证文件"),
        (project_root / "README.md", "项目说明文档"),
        (project_root / "pyproject.toml", "项目配置文件"),
        (project_root / "requirements.txt", "依赖文件"),
        (project_root / "server" / "mcp_server.py", "MCP 服务器"),
        (project_root / "client" / "claude_code_hook.py", "Hook 客户端"),
    ]

    for file_path, description in required_files:
        if not check_file_exists(file_path, description):
            all_valid = False

    print()

    # 验证 plugin.json
    print("📦 验证 plugin.json 配置...")
    plugin_json = project_root / ".claude-plugin" / "plugin.json"
    if plugin_json.exists():
        plugin_fields = ["name", "version", "description", "author", "mcp", "tools", "hooks"]
        if not validate_json_file(plugin_json, plugin_fields):
            all_valid = False

    print()

    # 验证 marketplace.json
    print("🏪 验证 marketplace.json 配置...")
    marketplace_json = project_root / ".claude-plugin" / "marketplace.json"
    if marketplace_json.exists():
        marketplace_fields = ["name", "description", "version", "plugins"]
        if not validate_json_file(marketplace_json, marketplace_fields):
            all_valid = False

    print()

    # 检查 Python 环境
    print("🐍 检查 Python 环境...")
    python_version = sys.version_info
    if python_version >= (3, 12):
        print(f"  ✅ Python 版本: {python_version.major}.{python_version.minor}.{python_version.micro}")
    else:
        print(f"  ⚠️  Python 版本过低: {python_version.major}.{python_version.minor}.{python_version.micro} (建议 3.12+)")

    print()

    # 检查虚拟环境
    print("📁 检查虚拟环境...")
    venv_path = project_root / ".venv"
    if venv_path.exists():
        print(f"  ✅ 虚拟环境存在: {venv_path}")
    else:
        print(f"  ⚠️  虚拟环境不存在，请运行: uv sync")

    print()

    # 检查数据目录
    print("🗄️  检查数据目录...")
    data_path = project_root / "data"
    if data_path.exists():
        print(f"  ✅ 数据目录存在: {data_path}")
    else:
        print(f"  ⚠️  数据目录不存在，首次启动时会自动创建")

    print()
    print("=" * 50)

    if all_valid:
        print("✅ 所有检查通过！插件配置符合 Claude Code 规范")
        print()
        print("📝 下一步:")
        print("1. 更新 marketplace.json 和 plugin.json 中的 repository URL")
        print("2. 启动服务: uv run python server/main.py")
        print("3. 在 Claude Code 中安装插件:")
        print("   /plugin marketplace add yourusername/claude-code-mem-plugin")
        print("   /plugin install claude-mem")
        return 0
    else:
        print("❌ 部分检查未通过，请修复上述问题")
        return 1


if __name__ == "__main__":
    sys.exit(main())
