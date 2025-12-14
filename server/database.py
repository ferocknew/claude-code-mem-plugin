"""
数据库操作模块
"""
import asyncio
from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import select, func, and_, or_, desc
from sqlalchemy.orm import selectinload

from .models import (
    Base,
    Conversation,
    Message,
    ToolExecution,
    Summary,
    MessageCreate,
    ConversationCreate,
    ToolExecutionRecord,
    SummaryCreate,
    ConversationResponse,
    MessageResponse,
    SearchResult,
)

class DatabaseManager:
    """数据库管理器"""

    def __init__(self, database_url: str = "sqlite+aiosqlite:///./memory.db"):
        self.engine = create_async_engine(database_url, echo=False)
        self.async_session = async_sessionmaker(self.engine, expire_on_commit=False)

    async def init_db(self):
        """初始化数据库"""
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def close(self):
        """关闭数据库连接"""
        await self.engine.dispose()

    # 会话操作
    async def create_conversation(self, conv_data: ConversationCreate) -> Conversation:
        """创建新会话"""
        async with self.async_session() as session:
            conversation = Conversation(
                id=f"conv_{int(datetime.utcnow().timestamp() * 1000000)}",
                title=conv_data.title,
                metadata=conv_data.metadata or {},
            )
            session.add(conversation)
            await session.commit()
            await session.refresh(conversation)
            return conversation

    async def get_conversation(self, conversation_id: str) -> Optional[Conversation]:
        """获取会话"""
        async with self.async_session() as session:
            result = await session.execute(
                select(Conversation).where(Conversation.id == conversation_id)
            )
            return result.scalar_one_or_none()

    async def list_conversations(self, limit: int = 50, offset: int = 0) -> List[Conversation]:
        """列出会话"""
        async with self.async_session() as session:
            result = await session.execute(
                select(Conversation)
                .order_by(desc(Conversation.updated_at))
                .limit(limit)
                .offset(offset)
            )
            return list(result.scalars().all())

    async def update_conversation_title(self, conversation_id: str, title: str):
        """更新会话标题"""
        async with self.async_session() as session:
            result = await session.execute(
                select(Conversation).where(Conversation.id == conversation_id)
            )
            conversation = result.scalar_one_or_none()
            if conversation:
                conversation.title = title
                await session.commit()

    # 消息操作
    async def create_message(self, msg_data: MessageCreate) -> Message:
        """创建消息"""
        async with self.async_session() as session:
            message = Message(
                id=f"msg_{int(datetime.utcnow().timestamp() * 1000000)}",
                conversation_id=msg_data.conversation_id,
                role=msg_data.role,
                content=msg_data.content,
                content_type=msg_data.content_type,
                metadata=msg_data.metadata or {},
            )
            session.add(message)

            # 更新会话的更新时间
            await session.execute(
                select(Conversation).where(Conversation.id == msg_data.conversation_id)
            )
            conversation = await session.get(Conversation, msg_data.conversation_id)
            if conversation:
                conversation.updated_at = datetime.utcnow()

            await session.commit()
            await session.refresh(message)
            return message

    async def get_messages(self, conversation_id: str, limit: int = 100, offset: int = 0) -> List[Message]:
        """获取会话消息"""
        async with self.async_session() as session:
            result = await session.execute(
                select(Message)
                .where(Message.conversation_id == conversation_id)
                .order_by(Message.timestamp)
                .limit(limit)
                .offset(offset)
            )
            return list(result.scalars().all())

    async def get_message(self, message_id: str) -> Optional[Message]:
        """获取单条消息"""
        async with self.async_session() as session:
            result = await session.execute(
                select(Message).where(Message.id == message_id)
            )
            return result.scalar_one_or_none()

    # 工具执行记录
    async def create_tool_execution(self, tool_data: ToolExecutionRecord) -> ToolExecution:
        """创建工具执行记录"""
        async with self.async_session() as session:
            tool_execution = ToolExecution(
                id=f"tool_{int(datetime.utcnow().timestamp() * 1000000)}",
                message_id=tool_data.message_id,
                tool_name=tool_data.tool_name,
                tool_args=tool_data.tool_args,
                tool_result=tool_data.tool_result,
                duration_ms=tool_data.duration_ms,
                success=tool_data.success,
            )
            session.add(tool_execution)
            await session.commit()
            await session.refresh(tool_execution)
            return tool_execution

    async def get_tool_executions(self, message_id: str) -> List[ToolExecution]:
        """获取消息的工具执行记录"""
        async with self.async_session() as session:
            result = await session.execute(
                select(ToolExecution).where(ToolExecution.message_id == message_id)
            )
            return list(result.scalars().all())

    # 总结操作
    async def create_summary(self, summary_data: SummaryCreate) -> Summary:
        """创建总结"""
        async with self.async_session() as session:
            summary = Summary(
                id=f"sum_{int(datetime.utcnow().timestamp() * 1000000)}",
                conversation_id=summary_data.conversation_id,
                content=summary_data.content,
                summary_type=summary_data.summary_type,
                metadata=summary_data.metadata or {},
            )
            session.add(summary)
            await session.commit()
            await session.refresh(summary)
            return summary

    async def get_summaries(self, conversation_id: str) -> List[Summary]:
        """获取会话总结"""
        async with self.async_session() as session:
            result = await session.execute(
                select(Summary)
                .where(Summary.conversation_id == conversation_id)
                .order_by(desc(Summary.created_at))
            )
            return list(result.scalars().all())

    # 搜索功能
    async def search_conversations(self, query: str, limit: int = 20) -> List[Conversation]:
        """搜索会话"""
        async with self.async_session() as session:
            result = await session.execute(
                select(Conversation)
                .where(
                    or_(
                        Conversation.title.ilike(f"%{query}%"),
                        Conversation.metadata.cast(String).ilike(f"%{query}%")
                    )
                )
                .order_by(desc(Conversation.updated_at))
                .limit(limit)
            )
            return list(result.scalars().all())

    async def search_messages(
        self,
        query: str,
        conversation_id: Optional[str] = None,
        role: Optional[str] = None,
        content_type: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[Message]:
        """搜索消息"""
        async with self.async_session() as session:
            conditions = [
                or_(
                    Message.content.ilike(f"%{query}%"),
                    Message.metadata.cast(String).ilike(f"%{query}%")
                )
            ]

            if conversation_id:
                conditions.append(Message.conversation_id == conversation_id)
            if role:
                conditions.append(Message.role == role)
            if content_type:
                conditions.append(Message.content_type == content_type)

            result = await session.execute(
                select(Message)
                .where(and_(*conditions))
                .order_by(desc(Message.timestamp))
                .limit(limit)
                .offset(offset)
            )
            return list(result.scalars().all())

    async def get_conversation_stats(self, conversation_id: str) -> Dict[str, Any]:
        """获取会话统计信息"""
        async with self.async_session() as session:
            # 消息数量
            msg_count_result = await session.execute(
                select(func.count(Message.id)).where(Message.conversation_id == conversation_id)
            )
            message_count = msg_count_result.scalar() or 0

            # 工具执行数量
            tool_count_result = await session.execute(
                select(func.count(ToolExecution.id))
                .join(Message)
                .where(Message.conversation_id == conversation_id)
            )
            tool_count = tool_count_result.scalar() or 0

            # 总结数量
            summary_count_result = await session.execute(
                select(func.count(Summary.id)).where(Summary.conversation_id == conversation_id)
            )
            summary_count = summary_count_result.scalar() or 0

            return {
                "message_count": message_count,
                "tool_execution_count": tool_count,
                "summary_count": summary_count,
            }

    # 转换函数
    def conversation_to_response(self, conv: Conversation) -> ConversationResponse:
        """转换会话为响应模型"""
        return ConversationResponse(
            id=conv.id,
            title=conv.title,
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            metadata=conv.metadata or {},
        )

    def message_to_response(self, msg: Message) -> MessageResponse:
        """转换消息为响应模型"""
        return MessageResponse(
            id=msg.id,
            conversation_id=msg.conversation_id,
            role=msg.role,
            content=msg.content,
            content_type=msg.content_type,
            timestamp=msg.timestamp,
            metadata=msg.metadata or {},
        )
