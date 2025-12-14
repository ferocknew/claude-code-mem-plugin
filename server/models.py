"""
数据模型定义
"""
from datetime import datetime
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field
from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

Base = declarative_base()

class Conversation(Base):
    """对话会话模型"""
    __tablename__ = "conversations"

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    metadata = Column(JSON, default=dict)  # 存储会话元数据

    # 关联消息
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")

class Message(Base):
    """消息模型"""
    __tablename__ = "messages"

    id = Column(String, primary_key=True)
    conversation_id = Column(String, ForeignKey("conversations.id"), nullable=False)
    role = Column(String, nullable=False)  # user, assistant, system, tool
    content = Column(Text, nullable=False)
    content_type = Column(String, default="text")  # text, tool_call, tool_result, image
    timestamp = Column(DateTime, default=datetime.utcnow)
    metadata = Column(JSON, default=dict)  # 存储消息元数据，如工具调用信息

    # 关联会话
    conversation = relationship("Conversation", back_populates="messages")

class ToolExecution(Base):
    """工具执行记录模型"""
    __tablename__ = "tool_executions"

    id = Column(String, primary_key=True)
    message_id = Column(String, ForeignKey("messages.id"), nullable=False)
    tool_name = Column(String, nullable=False)
    tool_args = Column(JSON, default=dict)
    tool_result = Column(JSON, default=dict)
    execution_time = Column(DateTime, default=datetime.utcnow)
    duration_ms = Column(Integer, default=0)
    success = Column(String, default="true")  # true, false, error

    # 关联消息
    message = relationship("Message")

class Summary(Base):
    """对话总结模型"""
    __tablename__ = "summaries"

    id = Column(String, primary_key=True)
    conversation_id = Column(String, ForeignKey("conversations.id"), nullable=False)
    content = Column(Text, nullable=False)
    summary_type = Column(String, default="auto")  # auto, manual
    created_at = Column(DateTime, default=datetime.utcnow)
    metadata = Column(JSON, default=dict)  # 存储总结元数据

    # 关联会话
    conversation = relationship("Conversation")

# Pydantic 模型用于 API
class MessageCreate(BaseModel):
    """创建消息的请求模型"""
    conversation_id: str
    role: str
    content: str
    content_type: str = "text"
    metadata: Optional[Dict[str, Any]] = None

class ConversationCreate(BaseModel):
    """创建对话的请求模型"""
    title: str
    metadata: Optional[Dict[str, Any]] = None

class ToolExecutionRecord(BaseModel):
    """工具执行记录模型"""
    message_id: str
    tool_name: str
    tool_args: Dict[str, Any]
    tool_result: Dict[str, Any]
    duration_ms: int = 0
    success: str = "true"

class SummaryCreate(BaseModel):
    """创建总结的请求模型"""
    conversation_id: str
    content: str
    summary_type: str = "auto"
    metadata: Optional[Dict[str, Any]] = None

class ConversationResponse(BaseModel):
    """对话响应模型"""
    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: int = 0
    metadata: Dict[str, Any] = Field(default_factory=dict)

class MessageResponse(BaseModel):
    """消息响应模型"""
    id: str
    conversation_id: str
    role: str
    content: str
    content_type: str
    timestamp: datetime
    metadata: Dict[str, Any] = Field(default_factory=dict)

class SearchQuery(BaseModel):
    """搜索查询模型"""
    query: str
    conversation_id: Optional[str] = None
    role: Optional[str] = None
    content_type: Optional[str] = None
    limit: int = 50
    offset: int = 0

class SearchResult(BaseModel):
    """搜索结果模型"""
    conversations: List[ConversationResponse] = Field(default_factory=list)
    messages: List[MessageResponse] = Field(default_factory=list)
    total_count: int = 0
