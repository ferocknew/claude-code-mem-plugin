"""
Redis 缓存操作模块
"""
import json
import pickle
from typing import Any, Optional, Dict, List
from datetime import datetime, timedelta
import aioredis
from pydantic import BaseModel

class CacheConfig(BaseModel):
    """缓存配置"""
    host: str = "localhost"
    port: int = 6379
    password: Optional[str] = None
    db: int = 0
    decode_responses: bool = True

class RedisCache:
    """Redis 缓存管理器"""

    def __init__(self, config: CacheConfig):
        self.config = config
        self.redis: Optional[aioredis.Redis] = None

    async def connect(self):
        """连接到 Redis"""
        self.redis = aioredis.from_url(
            f"redis://:{self.config.password}@{self.config.host}:{self.config.port}/{self.config.db}"
            if self.config.password
            else f"redis://{self.config.host}:{self.config.port}/{self.config.db}",
            decode_responses=self.config.decode_responses,
        )

    async def disconnect(self):
        """断开 Redis 连接"""
        if self.redis:
            await self.redis.close()

    async def set(self, key: str, value: Any, expire: Optional[int] = None):
        """设置缓存"""
        if not self.redis:
            return

        # 序列化值
        if isinstance(value, (dict, list)):
            serialized_value = json.dumps(value)
        elif isinstance(value, (int, float, str, bool)):
            serialized_value = str(value)
        else:
            # 对于复杂对象，使用 pickle
            serialized_value = pickle.dumps(value).decode('latin1')

        await self.redis.set(key, serialized_value, ex=expire)

    async def get(self, key: str) -> Any:
        """获取缓存"""
        if not self.redis:
            return None

        value = await self.redis.get(key)
        if value is None:
            return None

        # 尝试反序列化
        try:
            # 首先尝试 JSON
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            try:
                # 然后尝试 pickle
                return pickle.loads(value.encode('latin1'))
            except (pickle.UnpicklingError, AttributeError):
                # 如果都失败，返回字符串
                return value

    async def delete(self, key: str):
        """删除缓存"""
        if self.redis:
            await self.redis.delete(key)

    async def exists(self, key: str) -> bool:
        """检查键是否存在"""
        if not self.redis:
            return False
        return bool(await self.redis.exists(key))

    async def expire(self, key: str, seconds: int):
        """设置过期时间"""
        if self.redis:
            await self.redis.expire(key, seconds)

    async def ttl(self, key: str) -> int:
        """获取剩余过期时间"""
        if not self.redis:
            return -1
        return await self.redis.ttl(key)

    # 会话相关缓存操作
    async def cache_conversation_messages(self, conversation_id: str, messages: List[Dict], expire_hours: int = 24):
        """缓存会话消息"""
        key = f"conversation:{conversation_id}:messages"
        await self.set(key, messages, expire=expire_hours * 3600)

    async def get_cached_conversation_messages(self, conversation_id: str) -> Optional[List[Dict]]:
        """获取缓存的会话消息"""
        key = f"conversation:{conversation_id}:messages"
        return await self.get(key)

    async def cache_search_results(self, query: str, results: Dict, expire_minutes: int = 30):
        """缓存搜索结果"""
        key = f"search:{hash(query)}"
        await self.set(key, results, expire=expire_minutes * 60)

    async def get_cached_search_results(self, query: str) -> Optional[Dict]:
        """获取缓存的搜索结果"""
        key = f"search:{hash(query)}"
        return await self.get(key)

    # 统计信息缓存
    async def cache_conversation_stats(self, conversation_id: str, stats: Dict, expire_hours: int = 1):
        """缓存会话统计信息"""
        key = f"stats:{conversation_id}"
        await self.set(key, stats, expire=expire_hours * 3600)

    async def get_cached_conversation_stats(self, conversation_id: str) -> Optional[Dict]:
        """获取缓存的会话统计信息"""
        key = f"stats:{conversation_id}"
        return await self.get(key)

    # 实时会话状态
    async def set_active_conversation(self, user_id: str, conversation_id: str, expire_minutes: int = 30):
        """设置用户活跃会话"""
        key = f"active:{user_id}"
        await self.set(key, conversation_id, expire=expire_minutes * 60)

    async def get_active_conversation(self, user_id: str) -> Optional[str]:
        """获取用户活跃会话"""
        key = f"active:{user_id}"
        return await self.get(key)

    # 工具执行缓存
    async def cache_tool_result(self, tool_name: str, args_hash: str, result: Dict, expire_minutes: int = 60):
        """缓存工具执行结果"""
        key = f"tool:{tool_name}:{args_hash}"
        await self.set(key, result, expire=expire_minutes * 60)

    async def get_cached_tool_result(self, tool_name: str, args_hash: str) -> Optional[Dict]:
        """获取缓存的工具执行结果"""
        key = f"tool:{tool_name}:{args_hash}"
        return await self.get(key)

    # 批量操作
    async def batch_set(self, key_value_pairs: Dict[str, Any], expire: Optional[int] = None):
        """批量设置缓存"""
        if not self.redis:
            return

        async with self.redis.pipeline() as pipe:
            for key, value in key_value_pairs.items():
                if isinstance(value, (dict, list)):
                    serialized_value = json.dumps(value)
                elif isinstance(value, (int, float, str, bool)):
                    serialized_value = str(value)
                else:
                    serialized_value = pickle.dumps(value).decode('latin1')

                pipe.set(key, serialized_value, ex=expire)
            await pipe.execute()

    async def batch_get(self, keys: List[str]) -> Dict[str, Any]:
        """批量获取缓存"""
        if not self.redis:
            return {}

        values = await self.redis.mget(keys)
        result = {}

        for key, value in zip(keys, values):
            if value is None:
                continue

            try:
                result[key] = json.loads(value)
            except (json.JSONDecodeError, TypeError):
                try:
                    result[key] = pickle.loads(value.encode('latin1'))
                except (pickle.UnpicklingError, AttributeError):
                    result[key] = value

        return result

    async def clear_pattern(self, pattern: str):
        """清除匹配模式的所有键"""
        if not self.redis:
            return

        # 获取所有匹配的键
        keys = await self.redis.keys(pattern)
        if keys:
            await self.redis.delete(*keys)

    async def get_memory_usage(self) -> Dict[str, Any]:
        """获取内存使用情况"""
        if not self.redis:
            return {}

        info = await self.redis.info("memory")
        return {
            "used_memory": info.get("used_memory"),
            "used_memory_human": info.get("used_memory_human"),
            "used_memory_peak": info.get("used_memory_peak"),
            "used_memory_peak_human": info.get("used_memory_peak_human"),
            "total_system_memory": info.get("total_system_memory"),
            "total_system_memory_human": info.get("total_system_memory_human"),
        }
