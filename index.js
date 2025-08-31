const express = require('express');
const mongoose = require('mongoose');
const app = express();
require('dotenv').config();
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const { User } = require('./models/user');
const { initRedis } = require('./utils/redis');
const { markOnline, markOffline } = require('./services/presenceService');
const { startPresenceSyncWorker } = require('./workers/syncPresence');
const { startReadSyncWorker } = require('./workers/syncReads');

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

(async () => {
  try {
    await initRedis();
  } catch {}
})();

const server = http.createServer(app);
const io = socketIo(server,{
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
});
app.set('io',io);

// start workers
startPresenceSyncWorker();
startReadSyncWorker();

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (token) {
        jwt.verify(token, process.env.jwtPrivateKey, (err, decoded) => {
            if (err) return next(new Error('Authentication error'));
            socket.userid = decoded._id;
            next();
        });
    } else {
        next(new Error('Authentication error'));
    }
});

io.on('connection', async (socket) => {
    try {
        if (socket.userid) {
            await markOnline(socket.userid);
            const me = await User.findById(socket.userid).select('username');
            if (me && me.username) {
                socket.join(me.username);
            }
        }
    } catch {}

    socket.on('disconnect', async () => {
        try {
            if (socket.userid) await markOffline(socket.userid);
        } catch {}
    });
    socket.on('chat message', (data) => {
        const room = data.room;
        const msg = {...data};
        const reciever = msg.reciever;
        io.in(reciever).emit('chat message', msg);
        delete msg.room;
        if (socket.rooms.has(room)) { 
            io.in(room).emit('chat message', msg);
        } 
        else {
            console.log(`User tried to send a message to a room they're not in: ${room}`);
        }
    });
    socket.on('join', (data) => {
        const room = data.room;
        console.log("join: "+room);
        socket.join(room);
    });
    socket.on('join room', async (data) => {
        try {
            const user1 = data.user1;
            const user2 = data.user2;
            const room = [user1, user2].sort().join('-');
            socket.join(room);

            // Presence notify for the counterpart
            const counterpart = socket.userid ? await (async () => {
                // figure out which username is the other side
                const me = await User.findById(socket.userid).select('username _id');
                if (!me) return null;
                const otherUsername = me.username === user1 ? user2 : user1;
                const other = await User.findOne({ username: otherUsername }).select('_id username');
                return other;
            })() : null;

            if (counterpart) {
                const { isOnline, getLastSeen } = require('./services/presenceService');
                const online = await isOnline(counterpart._id);
                const lastSeen = online ? null : await getLastSeen(counterpart._id);
                // Emit to the joining socket the counterpart's presence
                socket.emit('presence:update', {
                    username: counterpart.username,
                    isOnline: online,
                    lastSeen
                });
                // Also notify everyone in room that this user (the joiner) is online now
                const me = await User.findById(socket.userid).select('username');
                if (me && me.username) {
                    socket.to(room).emit('presence:update', {
                        username: me.username,
                        isOnline: true,
                        lastSeen: null
                    });
                }
            }
        } catch {}
    });
    socket.on('leave room', (data) => {
        const room = data.room;
        console.log("leave room: "+room);
        socket.leave(room);
    });

    socket.on('call offer',(data) => {
        socket.to(data.to).emit('call offer',{
            from: socket.id,
            offer: data.offer
        });
    });
    socket.on('call answer', (data) => {
        socket.to(data.to).emit('call answer', {
            from: socket.id,
            answer: data.answer
        });
    });
    socket.on('ice candidate', (data)=> {
        socket.to(data.to).emit('ice candidate', {
            from: socket.id,
            candidate: data.candidate
        });
    });
});


const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});