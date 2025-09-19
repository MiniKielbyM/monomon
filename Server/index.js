const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const app = express();
const PORT = 3000;
const server = createServer(app);
const io = new Server(server);

io.on('connection', (socket) => {
    socket.emit('message', 'Socket.io connection established');
    socket.on('message', (msg) => {
        console.log(`Received: ${msg}`);
        socket.emit('message', `Echo: ${msg}`);
    });
    socket.on('createRoom', (room) => {
        socket.join(room);
        socket.emit('message', `Room "${room}" created`);
        app.get(`/room/${room}`, (req, res) => {
            res.sendFile(__dirname + '/room.html');
        });
    })
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/dev.html');
});

server.listen(PORT, () => {
    console.log(`Server (with Socket.io) is running on http://localhost:${PORT}`);
});
