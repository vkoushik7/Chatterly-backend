const { redis } = require('../utils/redis');

const DEFAULT_TTL_SEC = Number(process.env.MESSAGES_CACHE_TTL_SEC || 600); // 10 minutes

function key(conversationId) {
  return `chat:last20:${conversationId}`;
}

async function getWindow(conversationId) {
  const raw = await redis.get(key(conversationId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setWindow(conversationId, payload, ttlSec = DEFAULT_TTL_SEC) {
  const k = key(conversationId);
  const v = JSON.stringify(payload);
  if (ttlSec > 0) {
    await redis.setex(k, ttlSec, v);
  } else {
    await redis.set(k, v);
  }
}

async function updateAfterSend(conversationId, message, readReceipts, limit = 20) {
  const k = key(conversationId);
  const raw = await redis.get(k);
  if (!raw) return false;
  try {
    const payload = JSON.parse(raw);
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    // Prepend newest message and trim
    const updated = [message, ...messages].slice(0, limit);
    const nextCursor = updated.length ? updated[updated.length - 1]._id : null;
    const newPayload = { messages: updated, nextCursor, readReceipts };
    await setWindow(conversationId, newPayload);
    return true;
  } catch {
    return false;
  }
}

async function updateReadReceipts(conversationId, patch) {
  // patch: { userId, lastReadMessageId, at }
  const k = key(conversationId);
  const raw = await redis.get(k);
  if (!raw) return false;
  try {
    const payload = JSON.parse(raw);
    const rr = payload.readReceipts || { me: {}, partner: {} };
    // Update whichever side matches
    const apply = (obj) => {
      if (!obj) return obj;
      if (String(obj.userId) === String(patch.userId)) {
        return { ...obj, lastReadMessageId: patch.lastReadMessageId, lastReadAt: patch.at };
      }
      return obj;
    };
    rr.me = apply(rr.me);
    rr.partner = apply(rr.partner);
    payload.readReceipts = rr;
    await setWindow(conversationId, payload);
    return true;
  } catch {
    return false;
  }
}

async function clearWindow(conversationId) {
  await redis.del(key(conversationId));
}

module.exports = { getWindow, setWindow, updateAfterSend, updateReadReceipts, clearWindow };
