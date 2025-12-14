#!/usr/bin/env python3
"""
Claude Code Hook 客户端
用于在 Claude Code 中捕获对话内容并发送到记忆服务器
"""
import asyncio
import os
import sys
import json
from typing import Optional, Dict, Any
import aiohttp

class ClaudeCodeHook:
    """Claude Code Hook 客户端"""

    def __init__(self, server_url: str = "http://localhost:8000"):
        self.server_url = server_url.rstrip("/")
        self.session: Optional[aiohttp.ClientSession] = None
        self.current_conversation_id: Optional[str] = None

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    async def record_user_input(self, content: str, metadata: Optional[Dict[str, Any]] = None) -> str:
        """记录用户输入"""
        if not self.session:
            raise RuntimeError("Hook not initialized")

        # 如果没有当前会话，创建一个
        if not self.current_conversation_id:
            await self._create_conversation("Claude Code Session")

        # 发送到记忆服务器
        try:
            async with self.session.post(
                f"{self.server_url}/messages",
                json={
                    "conversation_id": self.current_conversation_id,
                    "role": "user",
                    "content": content,
                    "content_type": "text",
                    "metadata": metadata or {"source": "claude_code_hook"}
                }
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    return f"用户输入已记录: {result['id']}"
                else:
                    error = await response.text()
                    return f"记录失败: {error}"
        except Exception as e:
            return f"网络错误: {str(e)}"

    async def record_assistant_response(self, content: str, metadata: Optional[Dict[str, Any]] = None) -> str:
        """记录助手响应"""
        if not self.session:
            raise RuntimeError("Hook not initialized")

        if not self.current_conversation_id:
            return "没有活跃会话"

        try:
            async with self.session.post(
                f"{self.server_url}/messages",
                json={
                    "conversation_id": self.current_conversation_id,
                    "role": "assistant",
                    "content": content,
                    "content_type": "text",
                    "metadata": metadata or {"source": "claude_code_hook"}
                }
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    return f"助手响应已记录: {result['id']}"
                else:
                    error = await response.text()
                    return f"记录失败: {error}"
        except Exception as e:
            return f"网络错误: {str(e)}"

    async def record_tool_execution(self, tool_name: str, args: Dict[str, Any], result: Dict[str, Any], message_id: str) -> str:
        """记录工具执行"""
        if not self.session:
            raise RuntimeError("Hook not initialized")

        try:
            # 这里应该调用 MCP 服务器的工具记录功能
            # 暂时使用 HTTP API
            return f"工具执行记录: {tool_name}"
        except Exception as e:
            return f"记录失败: {str(e)}"

    async def _create_conversation(self, title: str) -> None:
        """创建新对话会话"""
        if not self.session:
            raise RuntimeError("Hook not initialized")

        try:
            async with self.session.post(
                f"{self.server_url}/conversations",
                json={
                    "title": title,
                    "metadata": {"source": "claude_code_hook", "auto_created": True}
                }
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    self.current_conversation_id = result["id"]
                    print(f"创建新会话: {self.current_conversation_id}")
                else:
                    print(f"创建会话失败: {await response.text()}")
        except Exception as e:
            print(f"创建会话网络错误: {str(e)}")

    async def search_conversations(self, query: str, limit: int = 5) -> str:
        """搜索对话"""
        if not self.session:
            raise RuntimeError("Hook not initialized")

        try:
            async with self.session.post(
                f"{self.server_url}/search/conversations",
                json={"query": query, "limit": limit}
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    return json.dumps(result, ensure_ascii=False, indent=2)
                else:
                    return f"搜索失败: {await response.text()}"
        except Exception as e:
            return f"网络错误: {str(e)}"

    async def get_conversation_stats(self) -> str:
        """获取会话统计"""
        if not self.session:
            raise RuntimeError("Hook not initialized")

        try:
            async with self.session.get(f"{self.server_url}/stats") as response:
                if response.status == 200:
                    result = await response.json()
                    return json.dumps(result, ensure_ascii=False, indent=2)
                else:
                    return f"获取统计失败: {await response.text()}"
        except Exception as e:
            return f"网络错误: {str(e)}"

async def interactive_mode():
    """交互模式"""
    server_url = os.getenv("MEMORY_SERVER_URL", "http://localhost:8000")

    print("Claude Code Memory Hook - 交互模式")
    print(f"服务器: {server_url}")
    print("输入 'quit' 退出，输入 'help' 查看帮助")
    print("-" * 50)

    async with ClaudeCodeHook(server_url) as hook:
        while True:
            try:
                user_input = input("\n用户> ").strip()

                if user_input.lower() in ['quit', 'exit', 'q']:
                    break
                elif user_input.lower() == 'help':
                    print("""
可用命令:
- help: 显示帮助
- quit: 退出
- search <关键词>: 搜索对话
- stats: 查看系统统计
- 其他任何输入: 记录为用户消息
                    """)
                    continue
                elif user_input.startswith('search '):
                    query = user_input[7:].strip()
                    result = await hook.search_conversations(query)
                    print(f"\n搜索结果:\n{result}")
                elif user_input == 'stats':
                    result = await hook.get_conversation_stats()
                    print(f"\n系统统计:\n{result}")
                else:
                    # 记录用户输入
                    result = await hook.record_user_input(user_input)
                    print(f"✓ {result}")

                    # 模拟助手响应 (实际使用中这会来自 Claude)
                    assistant_response = f"收到你的消息: '{user_input}'"
                    result = await hook.record_assistant_response(assistant_response)
                    print(f"✓ {result}")

            except KeyboardInterrupt:
                break
            except Exception as e:
                print(f"错误: {str(e)}")

    print("\n再见!")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--interactive":
        # 交互模式
        asyncio.run(interactive_mode())
    else:
        # 单次执行模式
        async def main():
            server_url = os.getenv("MEMORY_SERVER_URL", "http://localhost:8000")

            async with ClaudeCodeHook(server_url) as hook:
                if len(sys.argv) > 1:
                    content = " ".join(sys.argv[1:])
                    result = await hook.record_user_input(content)
                    print(result)
                else:
                    print("用法: python claude_code_hook.py <消息内容>")
                    print("或使用 --interactive 进入交互模式")

        asyncio.run(main())
