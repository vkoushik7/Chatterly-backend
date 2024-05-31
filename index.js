const express = require('express');
const mongoose = require('mongoose');
const app = express();
const config = require('config');
require('dotenv').config();
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20');
const { User } = require('./models/user');
const jwt = require('jsonwebtoken');

if (!process.env.jwtPrivateKey){
    console.error('FATAL ERROR: jwtPrivateKey is not defined');
    process.exit(1);
}

app.use(express.json());
mongoose.connect(process.env.mongodb_url)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB', err));

app.get('/', (req,res) => {
    res.send('visit /signup or /login');
});

app.use(cors());
app.use('/signup', require('./routes/signup'));
app.use('/login', require('./routes/login'));
app.use('/users',require('./routes/users'));
app.use('/chat',require('./routes/chat'));
app.use('/', require('./routes/login'));

passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/auth/google/callback",
        userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
        scope: ['email', 'profile']
    },
    async function(accessToken, refreshToken, profile, cb) {
        try {
            let user = await User.findOne({ googleId: profile.id });
            if (!user) {
                console.log(profile)
            }
            return cb(null, user);
        } catch (err) {
            return cb(err);
        }
    }
));


const server = http.createServer(app);
const io = socketIo(server,{
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
});
app.set('io',io);

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (token) {
        jwt.verify(token, process.env.jwtPrivateKey, (err, decoded) => {
            if (err) return next(new Error('Authentication error'));
            // console.log(decoded._id);
            socket.userid = decoded._id;
            // console.log(socket.user);
            next();
        });
    } else {
        console.log('no token')
        next(new Error('Authentication error'));
    }
});


io.on('connection', (socket) => {
    socket.on('disconnect', () => {
        
    });
    socket.on('chat message', (data) => {
        const room = data.room;
        const msg = {...data};
        const reciever = msg.reciever;
        io.in(reciever).emit('chat message', msg);
        delete msg.room;
        if (socket.rooms.has(room)) { 
            io.in(room).emit('chat message', msg);
        } else {
            console.log(`User tried to send a message to a room they're not in: ${room}`);
        }
    });
    socket.on('join', (data) => {
        console.log(data);
        const room = data.room;
        socket.join(room);
    });
    socket.on('join room', (data) => {
        const user1 = data.user1;
        const user2 = data.user2;
        const room = [user1,user2].sort().join('-');
        socket.join(room);
    });
    socket.on('leave room', (data) => {
        const room = data.room;
        socket.leave(room);
    });
});


const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});