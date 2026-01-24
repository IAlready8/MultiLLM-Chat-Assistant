import redis.asyncio as redis
from redis.asyncio import ConnectionPool
from .config import settings
from typing import Optional

pool: Optional[ConnectionPool] = None

def get_redis_pool() -> ConnectionPool:
    """
    Initializes and returns a singleton async Redis connection pool.
    """
    global pool
    if pool is None:
        if not settings.REDIS_URL:
            raise ValueError("REDIS_URL is not set. Caching service cannot start.")
        
        print(f"Initializing Redis connection pool for: {settings.REDIS_URL}")
        pool = redis.ConnectionPool.from_url(
            settings.REDIS_URL, 
            max_connections=10, 
            decode_responses=True
        )
    return pool

async def get_redis_client() -> redis.Redis:
    """
    Returns a Redis client from the connection pool.
    """
    pool = get_redis_pool()
    return redis.Redis(connection_pool=pool)

async def test_redis_connection():
    """
    A simple health check for the Redis connection.
    """
    try:
        client = await get_redis_client()
        pong = await client.ping()
        if pong:
            print("Redis connection successful (PING/PONG).")
            return True
    except Exception as e:
        print(f"Redis connection failed: {e}")
    return False