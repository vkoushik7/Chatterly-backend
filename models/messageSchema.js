const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        index: true,
        required: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    receiver: { // for direct chats; for group this may be null
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    content: {
        type: String,
        required: true,
        trim: true,
        maxlength: 4000
    },
    type: {
        type: String,
        enum: ['text','image','file','system','call','reaction'],
        default: 'text'
    },
    media: {
        url: { type: String, default: null },
        mime: { type: String, default: null },
        size: { type: Number, default: null },
        width: { type: Number, default: null },
        height: { type: Number, default: null }
    },
    replyToMessageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        default: null
    },
    readBy: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now }
    }],
    deleted: { type: Boolean, default: false },
    edited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    timestamp: { type: Date, default: Date.now }
}, { timestamps: false });

messageSchema.index({ conversationId: 1, _id: -1 });
messageSchema.index({ conversationId: 1, timestamp: -1 });

// Conversation schema (refined).
const conversationSchema = new mongoose.Schema({
    type: { type: String, enum: ['direct','group','system'], default: 'direct' },
    participants: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        role: { type: String, enum: ['member','admin','owner'], default: 'member' },
        joinedAt: { type: Date, default: Date.now },
        lastReadMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
        lastReadAt: { type: Date, default: null }
    }],
    lastMessage: {
        messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
        senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        contentPreview: { type: String },
        at: { type: Date }
    },
    unreadMap: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        count: { type: Number, default: 0 }
    }],
    metadata: { // group / system specific metadata
        title: { type: String, default: null },
        topic: { type: String, default: null },
        avatarUrl: { type: String, default: null }
    }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

conversationSchema.index({ 'participants.userId': 1, updatedAt: -1 });
conversationSchema.index({ updatedAt: -1 });
conversationSchema.index({ type: 1, updatedAt: -1 });

const Conversation = mongoose.model('Conversation', conversationSchema);
const Message = mongoose.model('Message', messageSchema);

module.exports = {Conversation, Message}; 