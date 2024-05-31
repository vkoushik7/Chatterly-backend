const router = require('express').Router();
const {User} = require('../models/user');
const auth = require('../middleware/auth');
const mongoose = require('mongoose');
const _ = require('lodash');
const bcrypt = require('bcrypt');

router.get('/', auth, async (req,res) => {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) return res.status(404).send('User not found');
    const userObj = _.pick(user, ['_id','name','username','email']);
    res.send(userObj);
});

router.put('/', auth, async (req,res) => {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).send('User not found');
    
    const userWithNewEmail = await User.findOne({email: req.body.email});
    if (userWithNewEmail && userWithNewEmail._id != req.user._id) return res.status(400).send('Email already in use');

    const userWithNewUsername = await User.findOne({username: req.body.username});
    if (userWithNewUsername && userWithNewUsername._id != req.user._id) return res.status(400).send('Username already in use');

    user.name = req.body.name;
    user.username = req.body.username;
    user.email = req.body.email;
    await user.save();
    res.send(_.pick(user, ['_id','name','username','email']));
});

router.put('/password', auth, async (req,res) => {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).send('User not found');

    const validPassword = await bcrypt.compare(req.body.oldPassword, user.password);
    if (!validPassword) return res.status(400).send('Invalid current password');

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(req.body.newPassword, salt);
    await user.save();
    res.send('Password updated');
});

router.delete('/', auth, async (req,res) => {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).send('User not found');

    const validPassword = await bcrypt.compare(req.body.password, user.password);
    if (!validPassword) return res.status(400).send('Invalid password');

    await User.deleteOne({_id: req.user._id});
    res.send('User deleted');
});

module.exports = router;