#!/usr/bin/env python3
"""
MCP 客户端示例
展示如何连接到记忆服务器并使用其功能
"""
import asyncio
import os
from fastmcp import ClientSession
from fastmcp.client.streamable_http import streamable_http_client

async def main():
    """主函数"""
    server_url = os.getenv("MEMORY_SERVER_URL", "http://localhost:8000/mcp")

    print(f"连接到记忆服务器: {server_url}")

    try:
        # 连接到 MCP 服务器
        async with streamable_http_client(server_url) as (read_stream, write_stream, _):
            async with ClientSession(read_stream, write_stream) as session:
                # 初始化连接
                await session.initialize()
                print("✅ MCP 连接已建立")

                # 列出可用工具
                tools = await session.list_tools()
                print(f"📋 可用工具 ({len(tools.tools)} 个):")
                for tool in tools.tools:
                    print(f"  - {tool.name}: {tool.description}")

                # 记录用户输入示例
                print("\n📝 记录用户输入...")
                result = await session.call_tool("record_user_input", {
                    "content": "你好，我想了解如何使用这个记忆系统"
                })
                print(f"✅ 记录结果: {result}")

                # 记录助手响应示例
                print("\n🤖 记录助手响应...")
                result = await session.call_tool("record_assistant_response", {
                    "content": "你好！这是一个基于 MCP 的对话记忆系统，可以帮你记录和搜索对话内容。"
                })
                print(f"✅ 记录结果: {result}")

                # 搜索对话示例
                print("\n🔍 搜索对话...")
                result = await session.call_tool("search_conversations", {
                    "query": "记忆",
                    "limit": 5
                })
                print(f"✅ 搜索结果: {result}")

                # 获取系统状态
                print("\n📊 获取系统状态...")
                result = await session.call_tool("get_memory_system_status", {})
                print(f"✅ 系统状态: {result}")

    except Exception as e:
        print(f"❌ 连接失败: {e}")
        print("请确保记忆服务器正在运行在:", server_url)

if __name__ == "__main__":
    asyncio.run(main())
