const jwt = require('jsonwebtoken');
const config = require('config');
const {User} = require('../models/user');

module.exports = async function(req,res,next){
    const token = req.header('x-auth-token');
    if (!token) return res.status(401).send('Access Denied, No Token provided!');

    try{
        const decoded = jwt.verify(token,process.env.jwtPrivateKey);
        req.user = decoded;
        const user = await User.findById(req.user._id).select('-password');
        if (!user) return res.status(404).send('User not found');
        next();
    }
    catch(ex) {
        res.status(400).send('Invalid token!');
    }

}