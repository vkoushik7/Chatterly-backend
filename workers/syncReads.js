const mongoose = require('mongoose');
const { redis } = require('../utils/redis');
const { key, popDirty } = require('../services/readReceipts');
const { Conversation } = require('../models/messageSchema');

// Batch sync lastRead:<conversationId>:<userId> = <timestampMs> into Conversation.participants
async function runOnce(batchSize = 500) {
  const keys = await popDirty(batchSize);
  if (!keys.length) return 0;

  // Group by conversationId for fewer DB rounds
  const perConvo = new Map();
  for (const k of keys) {
    // k format: lastRead:<conversationId>:<userId>
    const parts = k.split(':');
    if (parts.length !== 3) continue;
    const [, conversationId, userId] = parts;
    if (!perConvo.has(conversationId)) perConvo.set(conversationId, []);
    perConvo.get(conversationId).push(userId);
  }

  let totalOps = 0;

  for (const [conversationId, userIds] of perConvo.entries()) {
    // Fetch timestamps for this conversation in one MGET-like pass
    const pipe = redis.multi();
    for (const uid of userIds) pipe.get(key(conversationId, uid));
    const results = await pipe.exec();

    // Build bulk ops for all users of this conversation
    const ops = [];
    for (let i = 0; i < userIds.length; i++) {
      const uid = userIds[i];
      const res = results[i];
      const v = Array.isArray(res) ? res[1] : res; // [err, value] from ioredis multi
      const ts = v ? Number(v) : null;
      if (!ts) continue;
      ops.push({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(conversationId) },
          update: {
            $set: {
              'participants.$[p].lastReadAt': new Date(ts)
            }
          },
          arrayFilters: [{ 'p.userId': new mongoose.Types.ObjectId(uid) }]
        }
      });
    }

    if (ops.length) {
      await Conversation.bulkWrite(ops, { ordered: false });
      totalOps += ops.length;
    }
  }

  return totalOps;
}

function startReadSyncWorker(intervalMs = Number(process.env.READ_SYNC_INTERVAL_MS) || 60000) {
  const timer = setInterval(() => {
    runOnce().catch(() => {});
  }, intervalMs);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}

module.exports = { startReadSyncWorker, runOnce };
