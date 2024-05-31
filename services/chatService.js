const {User} = require('../models/user');
const {Conversation, Message} = require('../models/messageSchema');

async function getRecentMessages(userId) {

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found!');

    if (user.conversations.length === 0) return [];
    let recentMessages = [];
    user.conversations.forEach(async conversation => {
        recentMessages.push({
            partnerUsername: conversation.partnerUsername,
            content: conversation.recentMessage,
            timestamp: conversation.timestamp
        });
    });
    return recentMessages;
}

async function getChatHistoryComplete(userId, targetUsername) {

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found!');
    
    const targetUser = await User.findOne({username: targetUsername});
    if (!targetUser) throw new Error('Receiver User not found!');
    
    let conversationId = null;
    user.conversations.forEach(conversation => {
        if (conversation.partnerUsername === targetUsername) {
            conversationId = conversation.conversationId;
            return;
        }
    });

    if (conversationId) {
        const conversation = await Conversation.findById(conversationId);
        return conversation.messages;
    } else {
        return [];
    }
}

async function getChatHistory(userId, targetUsername, pageNumber=1, pageSize=10) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found!');

    const conversationIndex = user.conversations.findIndex(conversation => conversation.partnerUsername === targetUsername);

    if (conversationIndex !== -1) {
        const conversationId = user.conversations[conversationIndex].conversationId;
        const conversation = await Conversation.findById(conversationId)
        .select('messages')
        .slice('messages', [(pageNumber-1)*pageSize, pageSize]);
        return conversation.messages;
    }
    else {
        return [];
    }
};

async function sendMessage(userId, targetUsername, content) {
    const [user, targetUser] = await Promise.all([
        User.findById(userId),
        User.findOne({username: targetUsername})
    ]);

    if (!user) throw new Error('User not found!');
    if (!targetUser) throw new Error('Receiver User not found!');

    const conversationIndex = user.conversations.findIndex(conversation => conversation.partnerUsername === targetUsername);

    const timestamp = Date.now();
    const message = {
        sender: userId,
        receiver: targetUser._id,
        content: content
    };

    if (conversationIndex !== -1) {
        const conversationId = user.conversations[conversationIndex].conversationId;
        await Conversation.updateOne(
            { _id: conversationId },
            { $push: { messages: { $each: [message], $position: 0 } } }
        );

        user.conversations[conversationIndex].timestamp = timestamp;
        user.conversations[conversationIndex].recentMessage = content;
        user.conversations.unshift(user.conversations.splice(conversationIndex, 1)[0]);
        await user.save();

        const targetConversationIndex = targetUser.conversations.findIndex(conversation => conversation.partnerUsername === user.username);
        targetUser.conversations[targetConversationIndex].timestamp = timestamp;
        targetUser.conversations[targetConversationIndex].recentMessage = content;
        targetUser.conversations.unshift(targetUser.conversations.splice(targetConversationIndex, 1)[0]);
        await targetUser.save();

        return "message sent successfully!";
    }
    else {
        const conversation = new Conversation({
            participants: [userId, targetUser._id],
            messages: [message]
        });
        await conversation.save();

        user.conversations.unshift({
            partnerUsername: targetUsername,
            conversationId: conversation._id,
            timestamp: timestamp
        });
        await user.save();

        targetUser.conversations.unshift({
            partnerUsername: user.username,
            conversationId: conversation._id,
            timestamp: timestamp
        });
        await targetUser.save();

        return "message sent successfully!";
    }
}

async function clearChat(userId, targetUsername) {
    const [user, targetUser] = await Promise.all([
        User.findById(userId),
        User.findOne({username: targetUsername})
    ]);

    if (!user) throw new Error('User not found!');
    if (!targetUser) throw new Error('Receiver User not found!');

    const conversationIndex = user.conversations.findIndex(conversation => conversation.partnerUsername === targetUsername);
    const convId = user.conversations.find(conversation => conversation.partnerUsername === targetUsername).conversationId;

    await Conversation.updateOne({_id: convId}, { $set: { messages: [] } });
    
    user.conversations[conversationIndex].recentMessage = "Chat cleared";
    await user.save();

    const targetConversationIndex = targetUser.conversations.findIndex(conversation => conversation.partnerUsername === user.username);
    targetUser.conversations[targetConversationIndex].recentMessage = "Chat cleared";
    await targetUser.save();
    
    return "Chat history deleted successfully!";
}

module.exports = {getRecentMessages, getChatHistoryComplete, getChatHistory, sendMessage, clearChat};  