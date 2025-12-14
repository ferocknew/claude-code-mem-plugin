"""
FastAPI 主服务
提供 REST API 接口和 MCP 服务器
"""
import asyncio
import os
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

from .database import DatabaseManager
from .redis_cache import RedisCache, CacheConfig
from .mcp_server import MemoryMCPServer
from .models import (
    MessageCreate,
    ConversationCreate,
    SummaryCreate,
    ConversationResponse,
    MessageResponse,
)

# 全局变量
db_manager: Optional[DatabaseManager] = None
cache: Optional[RedisCache] = None
mcp_server: Optional[MemoryMCPServer] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    global db_manager, cache, mcp_server

    # 初始化数据库
    database_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./memory.db")
    db_manager = DatabaseManager(database_url)
    await db_manager.init_db()

    # 初始化缓存
    cache_config = CacheConfig(
        host=os.getenv("REDIS_HOST", "localhost"),
        port=int(os.getenv("REDIS_PORT", "6379")),
        password=os.getenv("REDIS_PASSWORD"),
        db=int(os.getenv("REDIS_DB", "0")),
    )
    cache = RedisCache(cache_config)
    try:
        await cache.connect()
    except Exception as e:
        print(f"Redis 连接失败，使用无缓存模式: {e}")
        cache = None

    # 初始化 MCP 服务器
    mcp_server = MemoryMCPServer(db_manager, cache)

    print("服务启动完成")
    yield

    # 清理资源
    if cache:
        await cache.disconnect()
    if db_manager:
        await db_manager.close()
    print("服务关闭完成")

# 创建 FastAPI 应用
app = FastAPI(
    title="Claude Code Memory Plugin",
    description="基于 MCP 的 Claude Code 对话记忆插件服务端",
    version="0.1.0",
    lifespan=lifespan,
)

# 添加 CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 在生产环境中应该更严格
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 请求/响应模型
class CreateConversationRequest(BaseModel):
    title: str
    metadata: Optional[dict] = None

class CreateMessageRequest(BaseModel):
    conversation_id: str
    role: str
    content: str
    content_type: str = "text"
    metadata: Optional[dict] = None

class SearchRequest(BaseModel):
    query: str
    conversation_id: Optional[str] = None
    role: Optional[str] = None
    limit: int = 50

# 依赖注入
async def get_db_manager() -> DatabaseManager:
    if not db_manager:
        raise HTTPException(status_code=500, detail="数据库未初始化")
    return db_manager

async def get_cache() -> Optional[RedisCache]:
    return cache

# API 路由
@app.get("/")
async def root():
    """根路径"""
    return {"message": "Claude Code Memory Plugin API", "version": "0.1.0"}

@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy"}

@app.post("/conversations", response_model=ConversationResponse)
async def create_conversation(
    request: CreateConversationRequest,
    db: DatabaseManager = Depends(get_db_manager)
):
    """创建新对话会话"""
    try:
        conv_data = ConversationCreate(**request.dict())
        conversation = await db.create_conversation(conv_data)
        return db.conversation_to_response(conversation)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建会话失败: {str(e)}")

@app.get("/conversations", response_model=list[ConversationResponse])
async def list_conversations(
    limit: int = 20,
    offset: int = 0,
    db: DatabaseManager = Depends(get_db_manager)
):
    """列出对话会话"""
    try:
        conversations = await db.list_conversations(limit=limit, offset=offset)
        return [db.conversation_to_response(conv) for conv in conversations]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取会话列表失败: {str(e)}")

@app.get("/conversations/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: str,
    db: DatabaseManager = Depends(get_db_manager)
):
    """获取指定对话会话"""
    try:
        conversation = await db.get_conversation(conversation_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="会话不存在")
        return db.conversation_to_response(conversation)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取会话失败: {str(e)}")

@app.post("/messages", response_model=MessageResponse)
async def create_message(
    request: CreateMessageRequest,
    db: DatabaseManager = Depends(get_db_manager)
):
    """创建消息"""
    try:
        msg_data = MessageCreate(**request.dict())
        message = await db.create_message(msg_data)
        return db.message_to_response(message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建消息失败: {str(e)}")

@app.get("/conversations/{conversation_id}/messages", response_model=list[MessageResponse])
async def get_conversation_messages(
    conversation_id: str,
    limit: int = 100,
    offset: int = 0,
    db: DatabaseManager = Depends(get_db_manager)
):
    """获取会话消息"""
    try:
        messages = await db.get_messages(conversation_id, limit=limit, offset=offset)
        return [db.message_to_response(msg) for msg in messages]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取消息失败: {str(e)}")

@app.post("/conversations/{conversation_id}/summary")
async def create_conversation_summary(
    conversation_id: str,
    summary_data: SummaryCreate,
    db: DatabaseManager = Depends(get_db_manager)
):
    """创建会话总结"""
    try:
        summary_data.conversation_id = conversation_id
        summary = await db.create_summary(summary_data)
        return {
            "id": summary.id,
            "conversation_id": summary.conversation_id,
            "content": summary.content,
            "created_at": summary.created_at.isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建总结失败: {str(e)}")

@app.get("/conversations/{conversation_id}/summary")
async def get_conversation_summaries(
    conversation_id: str,
    db: DatabaseManager = Depends(get_db_manager)
):
    """获取会话总结"""
    try:
        summaries = await db.get_summaries(conversation_id)
        return [
            {
                "id": summary.id,
                "content": summary.content,
                "summary_type": summary.summary_type,
                "created_at": summary.created_at.isoformat(),
                "metadata": summary.metadata,
            }
            for summary in summaries
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取总结失败: {str(e)}")

@app.post("/search/conversations")
async def search_conversations(
    request: SearchRequest,
    db: DatabaseManager = Depends(get_db_manager),
    cache: Optional[RedisCache] = Depends(get_cache)
):
    """搜索对话会话"""
    try:
        # 检查缓存
        if cache:
            cached_results = await cache.get_cached_search_results(f"conv:{request.query}")
            if cached_results:
                return cached_results

        # 搜索数据库
        conversations = await db.search_conversations(request.query, request.limit)
        results = []

        for conv in conversations:
            stats = await db.get_conversation_stats(conv.id)
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
        if cache:
            await cache.cache_search_results(f"conv:{request.query}", {"conversations": results})

        return {"conversations": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"搜索会话失败: {str(e)}")

@app.post("/search/messages")
async def search_messages(
    request: SearchRequest,
    db: DatabaseManager = Depends(get_db_manager),
    cache: Optional[RedisCache] = Depends(get_cache)
):
    """搜索消息"""
    try:
        # 检查缓存
        cache_key = f"msg:{request.query}:{request.conversation_id}:{request.role}"
        if cache:
            cached_results = await cache.get_cached_search_results(cache_key)
            if cached_results:
                return cached_results

        # 搜索数据库
        messages = await db.search_messages(
            query=request.query,
            conversation_id=request.conversation_id,
            role=request.role,
            limit=request.limit
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
        if cache:
            await cache.cache_search_results(cache_key, {"messages": results, "total": len(results)})

        return {"messages": results, "total": len(results)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"搜索消息失败: {str(e)}")

@app.get("/stats")
async def get_system_stats(
    db: DatabaseManager = Depends(get_db_manager),
    cache: Optional[RedisCache] = Depends(get_cache)
):
    """获取系统统计信息"""
    try:
        # 数据库统计
        conv_count_result = await db.db.async_session.execute("SELECT COUNT(*) FROM conversations")
        conv_count = conv_count_result.scalar() or 0

        msg_count_result = await db.db.async_session.execute("SELECT COUNT(*) FROM messages")
        msg_count = msg_count_result.scalar() or 0

        tool_count_result = await db.db.async_session.execute("SELECT COUNT(*) FROM tool_executions")
        tool_count = tool_count_result.scalar() or 0

        # 缓存统计
        memory_info = {}
        if cache:
            memory_info = await cache.get_memory_usage()

        return {
            "database": {
                "conversations": conv_count,
                "messages": msg_count,
                "tool_executions": tool_count,
            },
            "cache": memory_info,
            "timestamp": asyncio.get_event_loop().time(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取统计信息失败: {str(e)}")

# MCP 服务器路由
@app.get("/mcp")
async def mcp_endpoint():
    """MCP Streamable HTTP 端点"""
    if not mcp_server:
        raise HTTPException(status_code=500, detail="MCP 服务器未初始化")
    # 这里会由 FastMCP 处理
    pass

# 挂载 MCP 服务器
if mcp_server:
    # 使用 Streamable HTTP transport
    mcp_app = mcp_server.mcp.streamable_http_app()
    app.mount("/mcp", mcp_app)

if __name__ == "__main__":
    # 直接运行 FastAPI 服务
    uvicorn.run(
        "server.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        reload=True,
    )
