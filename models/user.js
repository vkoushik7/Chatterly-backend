const config = require('config');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        minlength: 3,
        maxlength: 50
    },
    username: {
        type: String,
        required: true,
        minlength: 5,
        maxlength: 20,
        unique: true,
        index: true
    },
    email: {
        type: String,
        required: true,
        minlength: 5,
        maxlength: 255,
        unique: true
    },
    password: {
        type: String,
        required: true,
        minlength: 5,
        maxlength: 1024
    },
    lastSeen: { type: Date, default: null },
    bio: { type: String, maxlength: 500, default: null },
    avatarUrl: { type: String, default: null }
}, { timestamps: true });


userSchema.index({ lastSeen: -1 });
userSchema.methods.generateAuthToken = function(){
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d'; // e.g., '1h', '7d'
    const token = jwt.sign({ _id: this._id }, process.env.jwtPrivateKey, { expiresIn });
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