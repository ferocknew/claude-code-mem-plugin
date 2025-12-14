#!/usr/bin/env python3
"""
验证项目设置是否正确的脚本
"""
import os
import sys
from pathlib import Path

def check_file_exists(filepath, description):
    """检查文件是否存在"""
    if os.path.exists(filepath):
        print(f"✅ {description}: {filepath}")
        return True
    else:
        print(f"❌ {description}: {filepath} (文件不存在)")
        return False

def check_env_var(var_name, description):
    """检查环境变量"""
    value = os.getenv(var_name)
    if value:
        print(f"✅ {description}: {var_name} = {value}")
        return True
    else:
        print(f"⚠️  {description}: {var_name} 未设置")
        return False

def main():
    """主验证函数"""
    project_root = Path(__file__).parent.parent
    os.chdir(project_root)

    print("🔍 Claude Code Memory Plugin - 设置验证")
    print("=" * 50)

    all_good = True

    # 检查重要文件
    files_to_check = [
        ("pyproject.toml", "项目配置文件"),
        ("requirements.txt", "Python 依赖文件"),
        ("compose.yaml", "Docker Compose 配置"),
        ("env.example", "环境变量模板"),
        (".gitignore", "Git 忽略文件"),
        ("README.md", "项目文档"),
        ("server/main.py", "主服务文件"),
        ("server/mcp_server.py", "MCP 服务器"),
        ("client/claude_code_hook.py", "Claude Code Hook"),
    ]

    print("📁 文件检查:")
    for filepath, description in files_to_check:
        if not check_file_exists(filepath, description):
            all_good = False

    print("\n🔧 配置检查:")

    # 检查 .env 文件
    if os.path.exists(".env"):
        print("✅ 环境变量文件: .env")
        # 尝试加载环境变量
        try:
            from dotenv import load_dotenv
            load_dotenv()
            print("✅ 环境变量已加载")
        except ImportError:
            print("⚠️  python-dotenv 未安装，无法加载环境变量")
    else:
        print("⚠️  环境变量文件: .env (未创建，从 env.example 复制)")

    # 检查关键环境变量
    env_vars_to_check = [
        ("DATABASE_URL", "数据库连接"),
        ("REDIS_HOST", "Redis 主机"),
        ("PORT", "服务端口"),
    ]

    for var_name, description in env_vars_to_check:
        check_env_var(var_name, description)

    # 检查虚拟环境
    if os.path.exists(".venv"):
        print("✅ 虚拟环境: .venv/")
        # 检查虚拟环境是否激活
        if hasattr(sys, 'real_prefix') or (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix):
            print("✅ 虚拟环境: 当前已激活")
        else:
            print("ℹ️  虚拟环境: .venv/ 存在但未激活")
    else:
        print("⚠️  虚拟环境: .venv/ 目录不存在，运行 'uv sync' 创建")

    print("\n" + "=" * 50)
    if all_good:
        print("🎉 项目设置验证通过！")
        print("\n📝 下一步:")
        print("1. 如果还没有虚拟环境: uv sync")
        print("2. 如果还没有 .env 文件: cp env.example .env")
        print("3. 启动服务: uv run python server/main.py")
    else:
        print("⚠️  项目设置存在问题，请检查上述错误信息")

    return all_good

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
