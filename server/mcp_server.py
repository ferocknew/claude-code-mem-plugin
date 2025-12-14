"""
MCP 服务器实现 - 基于 FastMCP
提供对话记录和记忆功能的工具
"""
import asyncio
import json
from typing import Dict, List, Any, Optional
from datetime import datetime
from fastmcp import FastMCP, Context
from fastmcp.server.session import ServerSession

from .database import DatabaseManager
from .redis_cache import RedisCache, CacheConfig
from .models import (
    MessageCreate,
    ConversationCreate,
    ToolExecutionRecord,
    SummaryCreate,
    SearchQuery,
)

class MemoryMCPServer:
    """记忆 MCP 服务器"""

    def __init__(self, db_manager: DatabaseManager, cache: RedisCache):
        self.db = db_manager
        self.cache = cache
        self.mcp = FastMCP(
            name="Claude Code Memory Plugin",
            instructions="这是一个用于记录和管理 Claude Code 对话内容的记忆插件。你可以用来记录对话、搜索历史、生成总结等。",
            json_response=True,
        )
        self._setup_tools()

    def _setup_tools(self):
        """设置 MCP 工具"""

        @self.mcp.tool()
        async def record_user_input(ctx: Context[ServerSession, None], content: str, conversation_id: Optional[str] = None) -> str:
            """记录用户输入内容

            Args:
                content: 用户输入的内容
                conversation_id: 会话ID，如果不提供则创建一个新会话
            """
            try:
                # 如果没有提供会话ID，创建一个新会话
                if not conversation_id:
                    conv_data = ConversationCreate(
                        title=f"对话 {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')}",
                        metadata={"source": "claude_code_hook"}
                    )
                    conversation = await self.db.create_conversation(conv_data)
                    conversation_id = conversation.id
                    await ctx.info(f"创建新会话: {conversation_id}")

                # 记录用户消息
                msg_data = MessageCreate(
                    conversation_id=conversation_id,
                    role="user",
                    content=content,
                    metadata={"recorded_at": datetime.utcnow().isoformat()}
                )
                message = await self.db.create_message(msg_data)

                # 缓存更新
                await self.cache.set_active_conversation("default_user", conversation_id)

                await ctx.info(f"已记录用户输入到会话 {conversation_id}")
                return f"用户输入已记录，消息ID: {message.id}"

            except Exception as e:
                await ctx.error(f"记录用户输入失败: {str(e)}")
                return f"记录失败: {str(e)}"

        @self.mcp.tool()
        async def record_assistant_response(ctx: Context[ServerSession, None], content: str, conversation_id: Optional[str] = None) -> str:
            """记录助手响应内容

            Args:
                content: 助手响应的内容
                conversation_id: 会话ID，如果不提供则使用最近活跃的会话
            """
            try:
                # 如果没有提供会话ID，尝试获取活跃会话
                if not conversation_id:
                    conversation_id = await self.cache.get_active_conversation("default_user")
                    if not conversation_id:
                        return "没有找到活跃会话，请提供 conversation_id"

                # 记录助手消息
                msg_data = MessageCreate(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=content,
                    metadata={"recorded_at": datetime.utcnow().isoformat()}
                )
                message = await self.db.create_message(msg_data)

                await ctx.info(f"已记录助手响应到会话 {conversation_id}")
                return f"助手响应已记录，消息ID: {message.id}"

            except Exception as e:
                await ctx.error(f"记录助手响应失败: {str(e)}")
                return f"记录失败: {str(e)}"

        @self.mcp.tool()
        async def record_tool_execution(
            ctx: Context[ServerSession, None],
            tool_name: str,
            tool_args: Dict[str, Any],
            tool_result: Dict[str, Any],
            message_id: str,
            duration_ms: int = 0
        ) -> str:
            """记录工具执行信息

            Args:
                tool_name: 工具名称
                tool_args: 工具参数
                tool_result: 工具执行结果
                message_id: 关联的消息ID
                duration_ms: 执行耗时(毫秒)
            """
            try:
                tool_record = ToolExecutionRecord(
                    message_id=message_id,
                    tool_name=tool_name,
                    tool_args=tool_args,
                    tool_result=tool_result,
                    duration_ms=duration_ms,
                    success="true"
                )
                execution = await self.db.create_tool_execution(tool_record)

                await ctx.info(f"已记录工具执行: {tool_name}")
                return f"工具执行已记录，执行ID: {execution.id}"

            except Exception as e:
                await ctx.error(f"记录工具执行失败: {str(e)}")
                return f"记录失败: {str(e)}"

        @self.mcp.tool()
        async def search_conversations(ctx: Context[ServerSession, None], query: str, limit: int = 10) -> str:
            """搜索对话会话

            Args:
                query: 搜索关键词
                limit: 返回结果数量限制
            """
            try:
                # 检查缓存
                cached_results = await self.cache.get_cached_search_results(f"conv:{query}")
                if cached_results:
                    await ctx.info("使用缓存的搜索结果")
                    return json.dumps(cached_results, ensure_ascii=False, indent=2)

                # 搜索数据库
                conversations = await self.db.search_conversations(query, limit)
                results = []

                for conv in conversations:
                    stats = await self.db.get_conversation_stats(conv.id)
                    results.append({
                        "id": conv.id,
                        "title": conv.title,
                        "created_at": conv.created_at.isoformat(),
                        "updated_at": conv.updated_at.isoformat(),
                        "message_count": stats["message_count"],
                        "tool_execution_count": stats["tool_execution_count"],
                        "summary_count": stats["summary_count"],
                    })

                # 缓存结果
                await self.cache.cache_search_results(f"conv:{query}", {"conversations": results})

                await ctx.info(f"搜索到 {len(results)} 个会话")
                return json.dumps({"conversations": results}, ensure_ascii=False, indent=2)

            except Exception as e:
                await ctx.error(f"搜索会话失败: {str(e)}")
                return f"搜索失败: {str(e)}"

        @self.mcp.tool()
        async def search_messages(
            ctx: Context[ServerSession, None],
            query: str,
            conversation_id: Optional[str] = None,
            role: Optional[str] = None,
            limit: int = 20
        ) -> str:
            """搜索消息内容

            Args:
                query: 搜索关键词
                conversation_id: 指定会话ID进行搜索
                role: 消息角色过滤 (user/assistant/system/tool)
                limit: 返回结果数量限制
            """
            try:
                # 检查缓存
                cache_key = f"msg:{query}:{conversation_id}:{role}"
                cached_results = await self.cache.get_cached_search_results(cache_key)
                if cached_results:
                    await ctx.info("使用缓存的搜索结果")
                    return json.dumps(cached_results, ensure_ascii=False, indent=2)

                # 搜索数据库
                messages = await self.db.search_messages(
                    query=query,
                    conversation_id=conversation_id,
                    role=role,
                    limit=limit
                )

                results = []
                for msg in messages:
                    results.append({
                        "id": msg.id,
                        "conversation_id": msg.conversation_id,
                        "role": msg.role,
                        "content": msg.content[:200] + "..." if len(msg.content) > 200 else msg.content,
                        "content_type": msg.content_type,
                        "timestamp": msg.timestamp.isoformat(),
                        "metadata": msg.metadata,
                    })

                # 缓存结果
                await self.cache.cache_search_results(cache_key, {"messages": results, "total": len(results)})

                await ctx.info(f"搜索到 {len(results)} 条消息")
                return json.dumps({"messages": results, "total": len(results)}, ensure_ascii=False, indent=2)

            except Exception as e:
                await ctx.error(f"搜索消息失败: {str(e)}")
                return f"搜索失败: {str(e)}"

        @self.mcp.tool()
        async def get_conversation_messages(ctx: Context[ServerSession, None], conversation_id: str, limit: int = 50) -> str:
            """获取会话的所有消息

            Args:
                conversation_id: 会话ID
                limit: 返回消息数量限制
            """
            try:
                # 检查缓存
                cached_messages = await self.cache.get_cached_conversation_messages(conversation_id)
                if cached_messages:
                    await ctx.info("使用缓存的消息数据")
                    return json.dumps({"messages": cached_messages}, ensure_ascii=False, indent=2)

                # 从数据库获取
                messages = await self.db.get_messages(conversation_id, limit)

                results = []
                for msg in messages:
                    results.append({
                        "id": msg.id,
                        "role": msg.role,
                        "content": msg.content,
                        "content_type": msg.content_type,
                        "timestamp": msg.timestamp.isoformat(),
                        "metadata": msg.metadata,
                    })

                # 缓存消息
                await self.cache.cache_conversation_messages(conversation_id, results)

                await ctx.info(f"获取到 {len(results)} 条消息")
                return json.dumps({"messages": results}, ensure_ascii=False, indent=2)

            except Exception as e:
                await ctx.error(f"获取会话消息失败: {str(e)}")
                return f"获取失败: {str(e)}"

        @self.mcp.tool()
        async def generate_conversation_summary(ctx: Context[ServerSession, None], conversation_id: str) -> str:
            """生成会话总结

            Args:
                conversation_id: 会话ID
            """
            try:
                # 获取会话消息
                messages = await self.db.get_messages(conversation_id, limit=100)

                if not messages:
                    return "会话中没有消息，无法生成总结"

                # 构建对话内容
                conversation_text = ""
                for msg in messages:
                    role_name = {
                        "user": "用户",
                        "assistant": "助手",
                        "system": "系统",
                        "tool": "工具"
                    }.get(msg.role, msg.role)

                    conversation_text += f"{role_name}: {msg.content}\n\n"

                # 简单的总结生成（实际项目中可以调用 LLM 生成更智能的总结）
                summary_content = f"这是一个包含 {len(messages)} 条消息的对话。主要涉及用户与助手之间的交互。"

                # 创建总结记录
                summary_data = SummaryCreate(
                    conversation_id=conversation_id,
                    content=summary_content,
                    summary_type="auto",
                    metadata={
                        "message_count": len(messages),
                        "generated_at": datetime.utcnow().isoformat()
                    }
                )

                summary = await self.db.create_summary(summary_data)

                await ctx.info(f"为会话 {conversation_id} 生成总结")
                return f"总结已生成: {summary_content}"

            except Exception as e:
                await ctx.error(f"生成总结失败: {str(e)}")
                return f"生成失败: {str(e)}"

        @self.mcp.tool()
        async def get_conversation_stats(ctx: Context[ServerSession, None], conversation_id: str) -> str:
            """获取会话统计信息

            Args:
                conversation_id: 会话ID
            """
            try:
                # 检查缓存
                cached_stats = await self.cache.get_cached_conversation_stats(conversation_id)
                if cached_stats:
                    await ctx.info("使用缓存的统计信息")
                    return json.dumps(cached_stats, ensure_ascii=False, indent=2)

                # 从数据库获取
                stats = await self.db.get_conversation_stats(conversation_id)

                # 获取会话信息
                conversation = await self.db.get_conversation(conversation_id)
                if conversation:
                    stats.update({
                        "conversation_title": conversation.title,
                        "created_at": conversation.created_at.isoformat(),
                        "updated_at": conversation.updated_at.isoformat(),
                    })

                # 缓存统计信息
                await self.cache.cache_conversation_stats(conversation_id, stats)

                await ctx.info(f"获取会话 {conversation_id} 的统计信息")
                return json.dumps(stats, ensure_ascii=False, indent=2)

            except Exception as e:
                await ctx.error(f"获取统计信息失败: {str(e)}")
                return f"获取失败: {str(e)}"

        @self.mcp.tool()
        async def list_recent_conversations(ctx: Context[ServerSession, None], limit: int = 10) -> str:
            """列出最近的对话会话

            Args:
                limit: 返回会话数量限制
            """
            try:
                conversations = await self.db.list_conversations(limit=limit)

                results = []
                for conv in conversations:
                    stats = await self.db.get_conversation_stats(conv.id)
                    results.append({
                        "id": conv.id,
                        "title": conv.title,
                        "created_at": conv.created_at.isoformat(),
                        "updated_at": conv.updated_at.isoformat(),
                        "message_count": stats["message_count"],
                        "metadata": conv.metadata,
                    })

                await ctx.info(f"列出最近 {len(results)} 个会话")
                return json.dumps({"conversations": results}, ensure_ascii=False, indent=2)

            except Exception as e:
                await ctx.error(f"列出会话失败: {str(e)}")
                return f"列出失败: {str(e)}"

        @self.mcp.tool()
        async def get_memory_system_status(ctx: Context[ServerSession, None]) -> str:
            """获取记忆系统的状态信息"""
            try:
                # 获取数据库统计
                conv_count_result = await self.db.db.async_session.execute("SELECT COUNT(*) FROM conversations")
                conv_count = conv_count_result.scalar() or 0

                msg_count_result = await self.db.db.async_session.execute("SELECT COUNT(*) FROM messages")
                msg_count = msg_count_result.scalar() or 0

                # 获取缓存统计
                memory_info = await self.cache.get_memory_usage()

                status = {
                    "database": {
                        "conversations": conv_count,
                        "messages": msg_count,
                    },
                    "cache": memory_info,
                    "timestamp": datetime.utcnow().isoformat(),
                }

                await ctx.info("获取系统状态信息")
                return json.dumps(status, ensure_ascii=False, indent=2)

            except Exception as e:
                await ctx.error(f"获取系统状态失败: {str(e)}")
                return f"获取失败: {str(e)}"

    async def run_stdio(self):
        """以 stdio 模式运行 MCP 服务器"""
        await self.mcp.run(transport="stdio")

    async def run_streamable_http(self, host: str = "0.0.0.0", port: int = 8000):
        """以 Streamable HTTP 模式运行 MCP 服务器"""
        await self.mcp.run(transport="streamable-http", host=host, port=port)
