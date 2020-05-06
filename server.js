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
        this.maxPlayers = 4;
        this.tickInterval = 250;

        this.id = id;
        this.players = new Map();
        this.gameStarted = false;
        this.gameEnded = false;
    }

    sendLobby() {
        const usernames = Array.from(this.players.values()).map(x => x.username)
        let first = true;
        for(const socketid of this.players.keys()) {
            io.to(socketid).emit('sendLobby', this.id, usernames, first);
            first = false;
        }
    }

    addPlayer(socket, username) {
        socket.join(this.id);
        socketToServer.set(socket.id, this);
        this.players.set(socket.id, {
            username,
            action: null,
            clientTick: null
        });
        this.sendLobby();
    }

    startGame() {
        this.gameStarted = true;

        const usernames = Array.from(this.players.values()).map(x => x.username)
        let i = 0;
        for(const socketid of this.players.keys()) {
            io.to(socketid).emit('startGame', this.id, usernames, i);
            i++;
        }

        const loop = setInterval(() => {
            // TODO: action broadcasting

            if(this.gameEnded) {
                clearInterval(loop);

                this.players.forEach(v => {
                    v.action = null;
                    v.clientTick = null;
                });
                this.gameStarted = false;
                this.gameEnded = false;

                this.sendLobby();
            }
        }, this.tickInterval);
    }

    endGame() {
        this.gameEnded = true;
    }

    disconnect(socket) {
        this.players.delete(socket.id);
        this.sendLobby();
        if(this.players.size === 0) {
            servers.delete(this.id);
        }
    }

    isFull() {
        return this.players.size === this.maxPlayers;
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
    socket.on('startGame', () => {
        socketToServer.get(socket.id).startGame();
    });
    socket.on('joinGame', (username, lobbyno) => {
        if(servers.has(lobbyno)) {
            const server = servers.get(lobbyno);
            if(server.isFull()) {
                socket.emit('joinFail', 'server is full');
            } else if(server.gameStarted) {
                socket.emit('joinFail', 'game already started');
            } else {
                server.addPlayer(socket, username);
            }
        } else {
            socket.emit('joinFail', 'server not found');
        }
    })
    socket.on('endGame', () => {
        socketToServer.get(socket.id).endGame();
    })
    socket.on('disconnect', () => {
        if(socketToServer.has(socket.id)) {
            socketToServer.get(socket.id).disconnect(socket);
            socketToServer.delete(socket.id);
        }
    })
})

