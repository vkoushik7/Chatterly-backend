const router = require('express').Router();
const {User} = require('../models/user');
const auth = require('../middleware/chat_auth');
const {getRecentMessages, getChatHistory, sendMessage, clearChat, markReadByUsername} = require('../services/chatService');
const { setLastRead } = require('../services/readReceipts');

// GET /chat?limit=20&beforeUpdatedAt=ISODate
router.get('/',auth,async (req,res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const beforeUpdatedAt = req.query.beforeUpdatedAt; // optional ISO string
        const recMsg = await getRecentMessages(req.user._id, limit, beforeUpdatedAt);
        res.status(200).json({ conversations: recMsg, nextCursor: recMsg.length ? recMsg[recMsg.length-1].updatedAt : null });
    }
    catch (ex) {
        console.error('Error fetching recent messages!',ex);
        res.status(500).json({error: 'Internal Server Error!'});
    }
});

// GET /chat/:username?limit=20&beforeMessageId=<messageId>
router.get('/:username',auth, async (req,res) => {
    const targetUsername = req.params.username;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const beforeMessageId = req.query.beforeMessageId;

    try {
        const targetUser = await User.findOne({username:targetUsername}).select('_id');
        if (!targetUser) return res.status(404).json({error:'Receiver User not found'});
        
        const chat = await getChatHistory(req.user._id, targetUsername, limit, beforeMessageId);
        // Optionally return messages oldest-first for UI convenience
        const ordered = [...chat.messages].reverse();
        res.status(200).json({
            conversationId: chat.conversationId,
            messages: ordered,
            nextCursor: chat.nextCursor,
            readReceipts: chat.readReceipts
        });
    }
    catch(ex) {
        console.error('Error fetching chat history! ',ex);
        res.status(500).json({error: 'Internal Server Error!'});
    }
});

router.post('/:username',auth,async (req,res) => {
    const targetUsername = req.params.username;
    const content = req.body.content;
    try {
        const [targetUser, senderUser] = await Promise.all([
            User.findOne({ username: targetUsername }).select('_id username'),
            User.findById(req.user._id).select('username')
        ]);
        if (!targetUser) return res.status(404).json({error:'Reciever User not found'});
        const chat = await sendMessage(req.user._id,targetUsername,content);

        const io = req.app.get('io');
        const senderName = senderUser && senderUser.username ? senderUser.username : null;
        if (senderName) {
            const room = [senderName, targetUsername].sort().join('-');
            io.to(room).emit('chat message', chat);           // conversation room
        }
        io.to(targetUsername).emit('chat message', chat);     // receiver's personal room (optional fallback)
        
        res.status(200).json(chat);
    }
    catch(ex) {
        console.error('Error sending message! ',ex);
        res.status(500).json({error: 'Internal Server Error!'});
    }
});

// POST /chat/:username/read  { lastReadMessageId }
router.post('/:username/read', auth, async (req, res) => {
    try {
        const targetUsername = req.params.username;
        const { lastReadMessageId } = req.body || {};
        const result = await markReadByUsername(req.user._id, targetUsername, lastReadMessageId);

        // Also cache timestamp-based receipt in Redis for batch syncing
        await setLastRead(result.conversationId, req.user._id, Date.now());

        // Emit only if pointer advanced
        if (result.updated) {
            const io = req.app.get('io');
            const me = await User.findById(req.user._id).select('username');
            const myName = me && me.username ? me.username : null;
            const room = [myName, result.partnerUsername].filter(Boolean).sort().join('-');
            io.in(room).emit('message:read', {
                conversationId: result.conversationId,
                userId: String(req.user._id),
                lastReadMessageId: result.lastReadMessageId,
                at: result.readAt
            });
            // Also update Redis message window readReceipts
            try {
                const { updateReadReceipts } = require('../services/messageCache');
                await updateReadReceipts(result.conversationId, {
                    userId: String(req.user._id),
                    lastReadMessageId: result.lastReadMessageId,
                    at: result.readAt
                });
            } catch {}
        }
        return res.status(200).json({ ok: true, ...result });
    } catch (ex) {
        console.error('Error marking read! ', ex);
        res.status(500).json({ error: 'Internal Server Error!' });
    }
});

router.get('/exists/:username', async (req,res) => {
    const username = req.params.username;
    try {
        const user = await User.findOne({username:username});
        if (user) res.status(200).json({ exists: true });
        else res.status(200).json({ exists: false });
    }
    catch (err) {
        console.error('Error checking user existence! ',err);
        res.status(500).json({error: 'Internal Server Error!'});
    }
});

router.delete('/:username',auth,async (req,res) => {
    const targetUsername = req.params.username;
    try {
        const targetUser = await User.findOne({username:targetUsername});
        if (!targetUser) return res.status(404).json({error:'Reciever User not found'});
        clearChat(req.user._id,targetUsername);
        return res.status(200).json({message: 'Chat history deleted successfully!'});
    }
    catch(ex) {
        console.error('Error deleting chat history! ',ex);
        res.status(500).json({error: 'Internal Server Error!'});
    }
});

module.exports = router;