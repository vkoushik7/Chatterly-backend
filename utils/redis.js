const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 2,
  enableOfflineQueue: false
});

async function initRedis() {
  try {
    if (redis.status !== 'ready' && redis.status !== 'connecting') {
      await redis.connect();
    }
    console.log('Connected to Redis');
  } catch (e) {
    console.error('Redis connection failed:', e?.message || e);
  }
  return redis;
}

module.exports = { redis, initRedis };
