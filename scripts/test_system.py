#!/usr/bin/env python3
"""
系统测试脚本
验证记忆插件的各项功能是否正常工作
"""
import asyncio
import aiohttp
import json
import os
from typing import Dict, Any
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

class SystemTester:
    """系统测试器"""

    def __init__(self, server_url: str = "http://localhost:8000"):
        self.server_url = server_url.rstrip("/")
        self.session: aiohttp.ClientSession

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.session.close()

    async def test_health(self) -> bool:
        """测试服务健康状态"""
        try:
            async with self.session.get(f"{self.server_url}/health") as response:
                return response.status == 200
        except:
            return False

    async def test_create_conversation(self) -> Dict[str, Any]:
        """测试创建对话"""
        try:
            async with self.session.post(
                f"{self.server_url}/conversations",
                json={
                    "title": "系统测试对话",
                    "metadata": {"test": True, "source": "system_test"}
                }
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    return {"error": f"HTTP {response.status}"}
        except Exception as e:
            return {"error": str(e)}

    async def test_create_message(self, conversation_id: str) -> Dict[str, Any]:
        """测试创建消息"""
        try:
            async with self.session.post(
                f"{self.server_url}/messages",
                json={
                    "conversation_id": conversation_id,
                    "role": "user",
                    "content": "这是一条测试消息",
                    "metadata": {"test": True}
                }
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    return {"error": f"HTTP {response.status}"}
        except Exception as e:
            return {"error": str(e)}

    async def test_search(self, query: str) -> Dict[str, Any]:
        """测试搜索功能"""
        try:
            async with self.session.post(
                f"{self.server_url}/search/conversations",
                json={"query": query, "limit": 5}
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    return {"error": f"HTTP {response.status}"}
        except Exception as e:
            return {"error": str(e)}

    async def test_stats(self) -> Dict[str, Any]:
        """测试统计功能"""
        try:
            async with self.session.get(f"{self.server_url}/stats") as response:
                if response.status == 200:
                    return await response.json()
                else:
                    return {"error": f"HTTP {response.status}"}
        except Exception as e:
            return {"error": str(e)}

    async def test_mcp_connection(self) -> bool:
        """测试 MCP 连接"""
        try:
            # 简单的 MCP 初始化测试
            async with self.session.get(f"{self.server_url}/mcp") as response:
                return response.status in [200, 405]  # 405 是正常的，因为我们没有发送正确的 MCP 请求
        except:
            return False

async def run_tests():
    """运行所有测试"""
    server_url = os.getenv("MEMORY_SERVER_URL", "http://localhost:8000")

    print("🔍 Claude Code Memory Plugin - 系统测试")
    print(f"📍 服务器地址: {server_url}")
    print(f"📋 数据库URL: {os.getenv('DATABASE_URL', '未设置')}")
    print(f"🔴 Redis主机: {os.getenv('REDIS_HOST', '未设置')}")
    print("=" * 50)

    async with SystemTester(server_url) as tester:
        results = {}

        # 1. 健康检查
        print("1. 健康检查...")
        results["health"] = await tester.test_health()
        print(f"   {'✅ 通过' if results['health'] else '❌ 失败'}")

        if not results["health"]:
            print("❌ 服务未运行，请先启动服务")
            return

        # 2. 创建对话
        print("2. 创建对话...")
        conv_result = await tester.test_create_conversation()
        results["create_conversation"] = "id" in conv_result
        print(f"   {'✅ 通过' if results['create_conversation'] else '❌ 失败'}: {conv_result}")

        conversation_id = conv_result.get("id")

        # 3. 创建消息
        if conversation_id:
            print("3. 创建消息...")
            msg_result = await tester.test_create_message(conversation_id)
            results["create_message"] = "id" in msg_result
            print(f"   {'✅ 通过' if results['create_message'] else '❌ 失败'}: {msg_result}")
        else:
            results["create_message"] = False
            print("3. 创建消息... ❌ 跳过 (无会话ID)")

        # 4. 搜索功能
        print("4. 搜索功能...")
        search_result = await tester.test_search("测试")
        results["search"] = isinstance(search_result, dict) and "conversations" in search_result
        print(f"   {'✅ 通过' if results['search'] else '❌ 失败'}")

        # 5. 统计功能
        print("5. 统计功能...")
        stats_result = await tester.test_stats()
        results["stats"] = isinstance(stats_result, dict) and "database" in stats_result
        print(f"   {'✅ 通过' if results['stats'] else '❌ 失败'}")

        # 6. MCP 连接
        print("6. MCP 连接...")
        results["mcp"] = await tester.test_mcp_connection()
        print(f"   {'✅ 通过' if results['mcp'] else '❌ 失败'}")

        # 总结
        print("\n" + "=" * 50)
        print("📊 测试总结:")

        passed = sum(results.values())
        total = len(results)

        for test, result in results.items():
            status = "✅" if result else "❌"
            print(f"  {status} {test}")

        print(f"\n🎯 通过率: {passed}/{total} ({passed/total*100:.1f}%)")

        if passed == total:
            print("🎉 所有测试通过！系统运行正常")
        else:
            print("⚠️  部分测试失败，请检查服务配置")

if __name__ == "__main__":
    asyncio.run(run_tests())
