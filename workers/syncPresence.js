const mongoose = require('mongoose');
const { redis } = require('../utils/redis');
const { LASTSEEN_ZSET } = require('../services/presenceService');
const { User } = require('../models/user');

// Atomically consume presence updates and batch-write to Mongo
async function runOnce(batchSize = 500) {
  // Pop up to batchSize entries: [userId1, score1, userId2, score2, ...]
  const flat = await redis.zpopmin(LASTSEEN_ZSET, batchSize);
  if (!flat || flat.length === 0) return 0;

  // Deduplicate per user, keep the latest timestamp within this batch
  const latest = new Map();
  for (let i = 0; i < flat.length; i += 2) {
    const uid = flat[i];
    const ts = Number(flat[i + 1]);
    if (!uid || !ts) continue;
    const prev = latest.get(uid) || 0;
    if (ts > prev) latest.set(uid, ts);
  }

  if (latest.size === 0) return 0;

  const ops = Array.from(latest.entries()).map(([uid, ts]) => ({
    updateOne: {
      filter: { _id: new mongoose.Types.ObjectId(uid) },
      update: { $set: { lastSeen: new Date(ts) } },
      upsert: false
    }
  }));

  if (ops.length > 0) {
    await User.bulkWrite(ops, { ordered: false });
  }
  return ops.length;
}

function startPresenceSyncWorker(intervalMs = Number(process.env.PRESENCE_SYNC_INTERVAL_MS) || 60000) {
  const timer = setInterval(() => {
    runOnce().catch(() => {});
  }, intervalMs);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}

module.exports = { startPresenceSyncWorker, runOnce };
