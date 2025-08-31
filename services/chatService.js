const {User} = require('../models/user');
const {Conversation, Message} = require('../models/messageSchema');
const mongoose = require('mongoose');

// Helper: find or create a direct conversation between two users (pre-participantsKey version)
async function findOrCreateDirectConversation(userId, targetUserId) {
    let conversation = await Conversation.findOne({
        type: 'direct',
        'participants.userId': { $all: [userId, targetUserId] }
    });
    if (conversation && conversation.participants.length !== 2) {
        conversation = null; // safety if a group somehow matches
    }
    if (!conversation) {
        conversation = await Conversation.create({
            type: 'direct',
            participants: [
                { userId, role: 'member', joinedAt: new Date() },
                { userId: targetUserId, role: 'member', joinedAt: new Date() }
            ]
        });
    }
    return conversation;
}

// Recent conversations list for a user with unread counts
async function getRecentMessages(userId, limit = 20, beforeUpdatedAt) {
    const user = await User.findById(userId).select('_id');
    if (!user) throw new Error('User not found!');

    const query = { 'participants.userId': userId };
    if (beforeUpdatedAt) {
        query.updatedAt = { $lt: new Date(beforeUpdatedAt) };
    }

    const conversations = await Conversation.find(query)
        .sort({ updatedAt: -1 })
        .limit(limit)
        .lean();

    const partnerIds = [];
    const convoPartnerMap = new Map();
    for (const conv of conversations) {
        if (conv.type !== 'direct') continue;
        const otherParticipant = conv.participants.find(p => p.userId.toString() !== userId.toString());
        if (!otherParticipant) continue;
        partnerIds.push(otherParticipant.userId);
        convoPartnerMap.set(conv._id.toString(), otherParticipant.userId.toString());
    }
    const partners = await User.find({ _id: { $in: partnerIds } }).select('username avatarUrl').lean();
    const partnerLookup = new Map(partners.map(p => [p._id.toString(), p]));

    return conversations
        .filter(conv => conv.type === 'direct')
        .map(conv => {
            const pid = convoPartnerMap.get(conv._id.toString());
            const otherUser = pid ? partnerLookup.get(pid) : null;
            const unreadEntry = (conv.unreadMap || []).find(u => u.userId.toString() === userId.toString());
            return {
                conversationId: conv._id,
                partnerUsername: otherUser ? otherUser.username : null,
                partnerAvatar: otherUser ? otherUser.avatarUrl : null,
                lastMessage: conv.lastMessage || null,
                unreadCount: unreadEntry ? unreadEntry.count : 0,
                updatedAt: conv.updatedAt
            };
        });
}

// Chat history with cursor pagination (beforeMessageId). Returns newest first.
async function getChatHistory(userId, targetUsername, limit = 20, beforeMessageId) {
    const [user, targetUser] = await Promise.all([
        User.findById(userId).select('_id'),
        User.findOne({ username: targetUsername }).select('_id username')
    ]);
    if (!user) throw new Error('User not found!');
    if (!targetUser) throw new Error('Receiver User not found!');

    const conversation = await findOrCreateDirectConversation(user._id, targetUser._id);

    const msgQuery = { conversationId: conversation._id };
    if (beforeMessageId) {
        msgQuery._id = { $lt: new mongoose.Types.ObjectId(beforeMessageId) };
    }
    const messages = await Message.find(msgQuery)
        .sort({ _id: -1 })
        .limit(limit)
        .lean();

    const nextCursor = messages.length === limit ? messages[messages.length - 1]._id : null;
    // console.log(messages);
    return { conversationId: conversation._id, messages, nextCursor };
}

async function sendMessage(userId, targetUsername, content) {
    if (!content || !content.trim()) throw new Error('Message content required');
    const [user, targetUser] = await Promise.all([
        User.findById(userId).select('_id username'),
        User.findOne({ username: targetUsername }).select('_id username')
    ]);
    if (!user) throw new Error('User not found!');
    if (!targetUser) throw new Error('Receiver User not found!');

    const conversation = await findOrCreateDirectConversation(user._id, targetUser._id);

    const message = await Message.create({
        conversationId: conversation._id,
        sender: user._id,
        receiver: targetUser._id,
        content: content.trim(),
        type: 'text'
    });

    // Update conversation lastMessage
    conversation.lastMessage = {
        messageId: message._id,
        senderId: user._id,
        contentPreview: message.content.slice(0, 120),
        at: message.timestamp
    };
    // Update unread counts: increment for receiver, reset for sender
    conversation.unreadMap = conversation.unreadMap || [];
    for (const participant of conversation.participants) {
        const pid = participant.userId.toString();
        let entry = conversation.unreadMap.find(u => u.userId.toString() === pid);
        if (!entry) {
            entry = { userId: participant.userId, count: 0 };
            conversation.unreadMap.push(entry);
        }
        if (pid === user._id.toString()) {
            entry.count = 0; // sender has read their own message
            participant.lastReadMessageId = message._id;
            participant.lastReadAt = new Date();
        } else {
            entry.count += 1;
        }
    }
    await conversation.save();

    return {
        _id: message._id,
        conversationId: conversation._id,
        sender: user._id,
        receiver: targetUser._id,
        content: message.content,
        timestamp: message.timestamp
    };
}

async function clearChat(userId, targetUsername) {
    const [user, targetUser] = await Promise.all([
        User.findById(userId).select('_id'),
        User.findOne({ username: targetUsername }).select('_id')
    ]);
    if (!user) throw new Error('User not found!');
    if (!targetUser) throw new Error('Receiver User not found!');

    const conversation = await Conversation.findOne({
        type: 'direct',
        'participants.userId': { $all: [user._id, targetUser._id] }
    });
    if (!conversation) return 'No conversation to clear';

    await Message.deleteMany({ conversationId: conversation._id });
    conversation.lastMessage = null;
    await conversation.save();
    return 'Chat history deleted successfully!';
}

// Efficient: Mark conversation read by target username; idempotent (only updates if pointer advances)
async function markReadByUsername(userId, targetUsername, lastReadMessageId) {
    const [me, target] = await Promise.all([
        User.findById(userId).select('_id username'),
        User.findOne({ username: targetUsername }).select('_id username')
    ]);
    if (!me) throw new Error('User not found');
    if (!target) throw new Error('Receiver User not found');

    const conversation = await findOrCreateDirectConversation(me._id, target._id);

    // Resolve newest message id if not provided
    let effectiveId = lastReadMessageId;
    if (!effectiveId) {
        const newest = await Message.findOne({ conversationId: conversation._id })
            .sort({ _id: -1 })
            .select('_id')
            .lean();
        effectiveId = newest ? newest._id.toString() : null;
    }
    if (!effectiveId) {
        return { updated: false, conversationId: conversation._id.toString(), partnerUsername: target.username, lastReadMessageId: null, readAt: new Date() };
    }

    // Check current pointer to avoid unnecessary write
    const current = (conversation.participants || []).find(p => p.userId.toString() === me._id.toString());
    const currentPtr = current && current.lastReadMessageId ? current.lastReadMessageId.toString() : null;
    if (currentPtr && currentPtr >= effectiveId) {
        return { updated: false, conversationId: conversation._id.toString(), partnerUsername: target.username, lastReadMessageId: effectiveId, readAt: new Date() };
    }

    const now = new Date();
    await Conversation.updateOne(
        { _id: conversation._id },
        {
            $set: {
                'participants.$[p].lastReadMessageId': new mongoose.Types.ObjectId(effectiveId),
                'participants.$[p].lastReadAt': now
            }
        },
        { arrayFilters: [{ 'p.userId': me._id }] }
    );

    // Optionally zero unreadMap here in a second lightweight op if used
    // await Conversation.updateOne({ _id: conversation._id }, { $set: { 'unreadMap.$[u].count': 0 } }, { arrayFilters: [{ 'u.userId': me._id }] });

    return { updated: true, conversationId: conversation._id.toString(), partnerUsername: target.username, lastReadMessageId: effectiveId, readAt: now };
}

module.exports = { getRecentMessages, getChatHistory, sendMessage, clearChat, markReadByUsername };