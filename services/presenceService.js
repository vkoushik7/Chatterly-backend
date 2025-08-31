const { redis } = require('../utils/redis');
const { User } = require('../models/user');

const ONLINE_SET = 'presence:online';
const LASTSEEN_ZSET = 'presence:lastSeen'; // score = epoch ms

async function markOnline(userId) {
  if (!userId) return;
  await redis.sadd(ONLINE_SET, String(userId));
}

async function markOffline(userId) {
  if (!userId) return;
  const now = Date.now();
  await redis.srem(ONLINE_SET, String(userId));
  await redis.zadd(LASTSEEN_ZSET, now, String(userId));
}

async function isOnline(userId) {
  if (!userId) return false;
  const v = await redis.sismember(ONLINE_SET, String(userId));
  return v === 1;
}

async function getLastSeen(userId) {
  if (!userId) return null;
  // Prefer Redis ZSET
  const ts = await redis.zscore(LASTSEEN_ZSET, String(userId));
  if (ts) return new Date(Number(ts));
  // Fallback to Mongo field
  try {
    const doc = await User.findById(userId).select('lastSeen').lean();
    return doc && doc.lastSeen ? doc.lastSeen : null;
  } catch {
    return null;
  }
}

module.exports = { markOnline, markOffline, isOnline, getLastSeen, ONLINE_SET, LASTSEEN_ZSET };
