const bcrypt = require('bcrypt');
const _ = require('lodash');
const Joi = require('joi');
const {User} = require('../models/user');
const express = require('express');
const router = express.Router();


router.get('/', (req,res) => {
    res.send('send post request to /login');
});

router.post('/', async (req,res) => {
    const {error} = validate(req.body);
    if (error) return res.status(400).send(error.details[0].message);

    let user = await User.findOne({email:req.body.email});
    if (!user) return res.status(400).send('Invalid email or password');
    
    const pswd = await bcrypt.compare(req.body.password, user.password);
    if (!pswd) return res.status(400).send('Invalid email or password');
    
    const token = user.generateAuthToken();
    // decode to get exp for client-side handling
    const decoded = require('jsonwebtoken').decode(token);
    res.status(200).json({ token, exp: decoded && decoded.exp ? decoded.exp * 1000 : null });
});

function validate(req){
    const schema = Joi.object({
        email: Joi.string().min(5).max(50).required().email(),
        password: Joi.string().min(5).max(1024).required()
    });
    return schema.validate(req);
}

module.exports = router;