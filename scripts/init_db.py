#!/usr/bin/env python3
"""
数据库初始化脚本
"""
import asyncio
import os
from server.database import DatabaseManager

async def init_database():
    """初始化数据库"""
    database_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./data/memory.db")

    # 确保数据目录存在
    os.makedirs(os.path.dirname(database_url.replace("sqlite+aiosqlite:///", "")), exist_ok=True)

    db_manager = DatabaseManager(database_url)

    try:
        await db_manager.init_db()
        print("✅ 数据库初始化完成")
    except Exception as e:
        print(f"❌ 数据库初始化失败: {e}")
    finally:
        await db_manager.close()

if __name__ == "__main__":
    asyncio.run(init_database())
