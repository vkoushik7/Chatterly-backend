const router = require('express').Router();
const {User} = require('../models/user');
const auth = require('../middleware/auth');
const mongoose = require('mongoose');
const _ = require('lodash');
const bcrypt = require('bcrypt');

router.get('/', auth, async (req,res) => {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) return res.status(404).send('User not found');
    const userObj = _.pick(user, ['_id','name','username','email','avatarUrl','bio','lastSeen']);
    res.send(userObj);
});

router.get('/me', auth, async (req,res) => {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) return res.status(404).send('User not found');
    const userObj = _.pick(user, ['_id','name','username','email','avatarUrl','bio','lastSeen']);
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
    if (req.body.bio !== undefined) user.bio = req.body.bio;
    if (req.body.avatarUrl !== undefined) user.avatarUrl = req.body.avatarUrl;
    await user.save();
    res.send(_.pick(user, ['_id','name','username','email','bio','avatarUrl']));
});

// Lightweight endpoint to only update profile bio / avatar
router.put('/profile', auth, async (req,res) => {
    const { bio, avatarUrl } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).send('User not found');
    if (bio !== undefined) {
        if (typeof bio !== 'string' || bio.length > 500) return res.status(400).send('Invalid bio');
        user.bio = bio;
    }
    if (avatarUrl !== undefined) {
        if (avatarUrl !== null && typeof avatarUrl !== 'string') return res.status(400).send('Invalid avatarUrl');
        user.avatarUrl = avatarUrl;
    }
    await user.save();
    res.json(_.pick(user, ['_id','username','bio','avatarUrl']));
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

router.get('/:username', async (req,res) => {
    try {
        const profileUser = await User.findOne({ username: req.params.username })
            .select('username name avatarUrl bio lastSeen');
        if (!profileUser) return res.status(404).json({ error: 'User not found' });
        res.json(profileUser);
    } catch (e) {
        console.error('Error fetching public profile', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;