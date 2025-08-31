const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();
const {User, validate} = require('../models/user');
const _ = require('lodash');
const bcrypt = require('bcrypt');

router.get('/', (req,res) => {
    res.send('send post request to /signup');
});

router.post('/', async (req,res) => {

    const {error} = validate(req.body);
    if (error) return res.status(400).send(error.details[0].message);

    let user = await User.findOne({email:req.body.email});
    if (user) return res.status(400).send('User already registered');

    user = await User.findOne({username:req.body.username});
    if (user) return res.status(400).send('Username already taken!');

    user = new User(_.pick(req.body, ['name','username','email','password']));
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(user.password, salt);
    await user.save();

        const token = user.generateAuthToken();
        const decoded = require('jsonwebtoken').decode(token);
        res.header('x-auth-token', token)
             .status(201)
             .json({
                 token,
                 exp: decoded && decoded.exp ? decoded.exp * 1000 : null,
                 user: _.pick(user, ['_id','name','username','email'])
             });
});

module.exports = router;