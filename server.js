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
    static MAX_PLAYERS = 4;
    static TICK_INTERVAL = 15;

    constructor(id) {
        this.id = id;
        this.players = new Map();
        this.numActive = 0;
        this.gameStarted = false;
        this.voteEnd = 0;
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
            action: 0,
            tickno: null
        });
        this.numActive++;
        this.sendLobby();
    }

    startGame() {
        if(this.gameStarted) {
            return;
        }
        this.gameStarted = true;

        const usernames = Array.from(this.players.values()).map(x => x.username)
        let i = 0;
        for(const socketid of this.players.keys()) {
            io.to(socketid).emit('startGame', this.id, usernames, i);
            i++;
        }

        const loop = setInterval(() => {
            const actions = Array.from(this.players.values()).map(x => x.action);
            for(const [socketid, data] of this.players) {
                io.to(socketid).emit('broadcastActions', actions, data.tickno);
            }

            if(this.voteEnd == this.numActive) {
                clearInterval(loop);

                this.players.forEach(v => {
                    if(v.action === null) {
                        this.players.delete(v);
                    } else {
                        v.action = null;
                        v.tickno = null;
                    }
                });
                this.gameStarted = false;
                this.voteEnd = 0;

                this.sendLobby();
            }
        }, Server.TICK_INTERVAL);
    }

    sendAction(socket, action, tickno) {
        const player = this.players.get(socket.id);
        player.action = action;
        player.tickno = tickno;
    }

    endGame() {
        this.voteEnd++;
    }

    disconnect(socket) {
        this.numActive--;
        if(this.gameStarted) {
            this.players.get(socket.id).action = null;
            if(this.numActive === 0) {
                servers.delete(this.id);
            }
        } else {
            this.players.delete(socket.id);
            this.sendLobby();
            if(this.players.size === 0) {
                servers.delete(this.id);
            }
        }
    }

    isFull() {
        return this.players.size === Server.MAX_PLAYERS;
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
    });
    socket.on('endGame', () => {
        socketToServer.get(socket.id).endGame();
    });
    socket.on('sendAction', (action, tickno) => {
        socketToServer.get(socket.id).sendAction(socket, action, tickno);
    });
    socket.on('disconnect', () => {
        if(socketToServer.has(socket.id)) {
            socketToServer.get(socket.id).disconnect(socket);
            socketToServer.delete(socket.id);
        }
    });
})
