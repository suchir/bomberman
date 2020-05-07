const socket = io();

class UI {
    static showPage(page) {
        ['#menu', '#lobby', '#game'].forEach(x => $(x).hide());
        $(`#${page}`).show();
    }
    
    static getUsername() {
        const username = $('#username').val().substr(0, 10);
        if(username === '') {
            alert('username required');
            return null;
        }
        return username;
    }
    
    static createGame() {
        const username = UI.getUsername();
        if(username !== null) {
            socket.emit('createGame', username);
        }
    }
    
    static joinGame() {
        const username = UI.getUsername(), lobbyno = $('#lobbyno').val();
        if(lobbyno === '') {
            alert('lobby # required');
        } else if(username !== null) {
            socket.emit('joinGame', username, Number(lobbyno));
        }
    }
    
    static startGame() {
        socket.emit('startGame');
    }
}

socket.on('sendLobby', (lobbyno, usernames, isHost) => {
    if(isHost) {
        $('#startgame').show();
    } else {
        $('#startgame').hide();
    }
    $('#lobbyname').text(`lobby #${lobbyno}`);
    const playerlist = $('#playerlist');
    playerlist.empty();
    usernames.forEach((username, i) => {
        playerlist.append(`<li>${username} ${i == 0? '(host)' : ''}</li>`);
    });
    UI.showPage('lobby');
});

socket.on('joinFail', message => alert(message));

class Renderer {
    static CANVAS = $('#canvas')[0]
    static CTX = $('#canvas')[0].getContext('2d');
    static ASSETS = function(assets){
        const ret = new Map();
        assets.forEach(asset => {
            const image = new Image();
            image.src = `/assets/${asset}.png`;
            ret.set(asset, image);
        });
        return ret;
    }(['block']);

    static render(asset, sn, sm, si, sj, sh, sw, i, j, h, w) {
        const image = Renderer.ASSETS.get(asset);
        sn = Math.round(image.height / sn);
        sm = Math.round(image.width / sm);
        const n = Math.round(Renderer.CANVAS.height / GameState.HEIGHT);
        const m =  Math.round(Renderer.CANVAS.width / GameState.WIDTH);
        Renderer.CTX.drawImage(
            Renderer.ASSETS.get(asset), 
            sj*sm, si*sn, sw*sm, sh*sn,
            Math.round(j*m), Math.round(i*n), Math.round(w*m), Math.round(h*n)
        );
    }
}

class Block {
    constructor(i, j, type) {
        this.i = i;
        this.j = j;
        this.type = type;
    }

    render() {
        const types = ['border', 'free', 'solid', 'sand'];
        Renderer.render('block', 1, 4, 0, types.indexOf(this.type), 1, 1, this.i, this.j, 1, 1);
    }
}

class GameState {
    static HEIGHT = 13;
    static WIDTH = 15;

    constructor(seed, usernames) {
        const h = GameState.HEIGHT, w = GameState.WIDTH;
        this.blocks = new Array(h);
        for(let i = 0; i < h; i++) {
            this.blocks[i] = new Array(w);
            for(let j = 0; j < w; j++) {
                let type;
                if(i == 0 || j == 0 || i == h-1 || j == w-1) {
                    type = 'border';
                } else if(i%2 == 0 && j%2 == 0) {
                    type = 'solid';
                } else if((i < 3 || i >= h-3) && (j < 3 || j >= w-3)) {
                    type = 'free';
                } else {
                    type = 'sand';
                }
                this.blocks[i][j] = new Block(i, j, type);
            }
        }
    }

    render() {
        const h = GameState.HEIGHT, w = GameState.WIDTH;
        for(let i = 0; i < h; i++) {
            for(let j = 0; j < w; j++) {
                this.blocks[i][j].render();
            }
        }
    }
}

class Game {
    static TICK_INTERVAL = 250;

    static start(seed, usernames, pid) {
        this.state = new GameState(seed, usernames);
        this.tickno = 0;
        this.pid = pid;
    }

    static tick() {
        this.state.render();
        return [null, null];
    }

    static receiveActions(actions, tickno) {
        console.log(actions, tickno);
    }

    static isDone() {
        return false;
    }
}

socket.on('startGame', (seed, usernames, pid) => {
    Game.start(seed, usernames, pid);
    const loop = setInterval(() => {
        if(Game.isDone()) {
            clearInterval(loop);
            socket.emit('endGame');
        } else {
            const [action, tickno] = Game.tick(pid);
            socket.emit('sendAction', action, tickno);
        }
    }, Game.TICK_INTERVAL);
    UI.showPage('game');
});

socket.on('broadcastActions', (actions, tickno) => {
    Game.receiveActions(actions, tickno);
})