const router = require('express').Router();
const {User} = require('../models/user');
const auth = require('../middleware/chat_auth');
const {getRecentMessages, getChatHistory, sendMessage, clearChat} = require('../services/chatService');

router.get('/',auth,async (req,res) => {
    try {
        const recMsg = await getRecentMessages(req.user._id);
        res.status(200).json(recMsg);
    }
    catch (ex) {
        console.error('Error fetching recent messages!',ex);
        res.status(500).json({error: 'Internal Server Error!'});
    }
});

router.get('/:username',auth, async (req,res) => {
    const targetUsername = req.params.username;
    const pageNumber = parseInt(req.query.pageNumber) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;

    try {
        const targetUser = await User.findOne({username:targetUsername});
        if (!targetUser) return res.status(404).json({error:'Reciever User not found'});
        const chat = await getChatHistory(req.user._id,targetUsername,pageNumber,pageSize);
        res.status(200).json(chat);
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
        const targetUser = await User.findOne({username:targetUsername});
        if (!targetUser) return res.status(404).json({error:'Reciever User not found'});
        const chat = await sendMessage(req.user._id,targetUsername,content);

        const room = [req.user.username, targetUsername].sort().join('-');
        req.app.get('io').to(room).emit('chat message', chat);
        
        res.status(200).json(chat);
    }
    catch(ex) {
        console.error('Error sending message! ',ex);
        res.status(500).json({error: 'Internal Server Error!'});
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