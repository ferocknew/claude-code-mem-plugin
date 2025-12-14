"""
记忆服务器测试
"""
import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock
from server.database import DatabaseManager
from server.redis_cache import RedisCache, CacheConfig
from server.mcp_server import MemoryMCPServer

class TestMemoryMCPServer:
    """测试记忆 MCP 服务器"""

    @pytest.fixture
    async def db_manager(self):
        """数据库管理器 fixture"""
        db = DatabaseManager(":memory:")
        await db.init_db()
        yield db
        await db.close()

    @pytest.fixture
    async def cache(self):
        """缓存 fixture"""
        cache_config = CacheConfig(host="localhost", port=6379)
        cache = RedisCache(cache_config)
        # Mock Redis connection for testing
        cache.redis = AsyncMock()
        yield cache

    @pytest.fixture
    async def mcp_server(self, db_manager, cache):
        """MCP 服务器 fixture"""
        server = MemoryMCPServer(db_manager, cache)
        yield server

    @pytest.mark.asyncio
    async def test_record_user_input(self, mcp_server):
        """测试记录用户输入"""
        # 这里需要 mock FastMCP 的 context
        # 实际测试需要更完整的设置
        assert mcp_server is not None
        assert mcp_server.db is not None
        assert mcp_server.cache is not None

    @pytest.mark.asyncio
    async def test_server_initialization(self, db_manager, cache):
        """测试服务器初始化"""
        server = MemoryMCPServer(db_manager, cache)
        assert server.mcp is not None
        assert server.db == db_manager
        assert server.cache == cache

if __name__ == "__main__":
    pytest.main([__file__])
