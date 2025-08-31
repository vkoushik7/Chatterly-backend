const { redis } = require('../utils/redis');

const DIRTY_SET = 'lastRead:dirty';

function key(conversationId, userId) {
  return `lastRead:${conversationId}:${userId}`;
}

async function setLastRead(conversationId, userId, timestampMs = Date.now()) {
  const k = key(conversationId, userId);
  const ts = Number(timestampMs);
  const pipe = redis.multi();
  pipe.set(k, String(ts));
  pipe.sadd(DIRTY_SET, k);
  await pipe.exec();
  return { key: k, ts };
}

async function getLastRead(conversationId, userId) {
  const v = await redis.get(key(conversationId, userId));
  return v ? Number(v) : null;
}

async function popDirty(batchSize = 500) {
  // Atomically pop up to batchSize keys to process
  const keys = await redis.spop(DIRTY_SET, batchSize);
  if (!keys) return [];
  return Array.isArray(keys) ? keys : [keys];
}

module.exports = { setLastRead, getLastRead, popDirty, DIRTY_SET, key };
