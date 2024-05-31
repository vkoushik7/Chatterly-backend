const config = require('config');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name:{
        type: String,
        required: true,
        minlength: 3,
        maxlength: 50
    },
    username:{
        type: String,
        required: true,
        minlength: 5,
        maxlength: 20,
        unique: true
    },
    email: {
        type:String,
        required: true,
        minlength: 5,
        maxlength: 255,
        unique: true
    },
    password:{
        type:String,
        required: true,
        minlength: 5,
        maxlength: 1024
    },
    conversations: [{
        partnerUsername: String,
        recentMessage: String,
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Conversation'
        },
        timestamp: Date,
    }]
});


userSchema.methods.generateAuthToken = function(){
    const token = jwt.sign({_id: this._id}, process.env.jwtPrivateKey);
    return token;
}

const User = mongoose.model('User', userSchema);

function validateUser(user){
    const schema = Joi.object({
        name: Joi.string().min(3).max(50).required(),
        username: Joi.string().min(5).max(20).required(),
        email: Joi.string().min(5).max(50).required().email(),
        password: Joi.string().min(5).max(1024).required()
    });
    return schema.validate(user);
}

exports.User = User;
exports.validate = validateUser;