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

        // Sliding refresh: if expiring within REFRESH_WINDOW_MS, attach a fresh token
        const expMs = decoded && decoded.exp ? decoded.exp * 1000 : null;
        const now = Date.now();
        const windowMs = Number(process.env.JWT_REFRESH_WINDOW_MS || 5 * 60 * 1000); // 5 minutes default
        if (expMs && expMs - now <= windowMs) {
            const fresh = user.generateAuthToken();
            res.setHeader('x-refresh-token', fresh);
        }

        next();
    }
    catch(ex) {
        res.status(400).send('Invalid token!');
    }

}