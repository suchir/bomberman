const express = require('express')
const path = require('path');
const app = express()
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 4242;

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
http.listen(port, () => console.log(`serving on port ${port}`));

const servers = new Map();
const socketToServer = new Map();

class Server {
    constructor(id) {
        this.id = id;
        this.players = new Map();
        this.maxPlayers = 4;
        this.numReady = 0;
    }

    sendLobby() {
        const lobby = {
            id: this.id,
            players: Array.from(this.players.values())
        }
        io.to(this.id).emit('sendLobby', lobby);
    }

    addPlayer(socket, username) {
        socket.join(this.id);
        socketToServer.set(socket.id, this);
        this.players.set(socket.id, {username, ready: false});
        this.sendLobby();
    }

    playerReady(socket) {
        this.players.get(socket.id).ready = true;
        this.numReady++;
        this.sendLobby();
    }

    disconnect(socket) {
        this.players.delete(socket.id);
        this.numReady--;
        this.sendLobby();
    }

    full() {
        return this.players.size == this.maxPlayers;
    }

    static create() {
        const id = Math.floor(Math.random()*1e9);
        const server = new Server(id);
        servers.set(id, server);
        return server;    
    }
}


io.on('connection', (socket) => {
    socket.on('createGame', username => {
        server = Server.create();
        server.addPlayer(socket, username);
    });
    socket.on('playerReady', () => {
        socketToServer.get(socket.id).playerReady(socket);
    });
    socket.on('joinGame', (username, lobbyno) => {
        if(servers.has(lobbyno)) {
            const server = servers.get(lobbyno);
            if(server.full()) {
                socket.emit('joinFail', 'server is full');
            } else {
                server.addPlayer(socket, username);
            }
        } else {
            socket.emit('joinFail', 'server not found');
        }
    })
    socket.on('disconnect', () => {
        if(socketToServer.has(socket.id)) {
            socketToServer.get(socket.id).disconnect(socket);
        }
    })
})

