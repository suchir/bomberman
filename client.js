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
    }(['block', 'player0', 'player1', 'player2', 'player3', 'bomb', 'expl',
       'playerexpl0', 'playerexpl1', 'playerexpl2', 'playerexpl3', 'items']);

    static render(asset, sn, sm, si, sj, sh, sw, i, j, h, w) {
        const image = this.ASSETS.get(asset);
        sn = Math.round(image.height / sn);
        sm = Math.round(image.width / sm);
        const n = Math.round(this.CANVAS.height / GameState.HEIGHT);
        const m =  Math.round(this.CANVAS.width / GameState.WIDTH);
        this.CTX.drawImage(
            this.ASSETS.get(asset), 
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
        const sj = ['border', 'free', 'solid', 'sand'].indexOf(this.type);
        Renderer.render('block', 1, 4, 0, sj, 1, 1, this.i, this.j, 1, 1);
    }
}

class Player {
    PACE = 8;
    MOVE_ANIM = 16;
    DIE_ANIM = 7;
    MAX_BOMBS = 5;

    constructor(i, j, username, pid) {
        this.i = i;
        this.j = j;
        this.username = username;
        this.pid = pid;
        this.d = 0;
        this.fi = 0;
        this.fj = 0;
        this.numBombs = 1;
        this.fireRad = 1;

        this.moveState = null;
        this.dieState = null;
    }

    render() {
        const asset = `player${this.pid}`;
        let sj = this.d * 3;
        if(this.moveState !== null) {
            const state = Math.floor(4 * this.moveState / this.MOVE_ANIM);
            sj += state == 1? 1 : state == 3? 2 : 0;
        }
        const i = this.i + this.fi / (2 * this.PACE),
              j = this.j + this.fj / (2 * this.PACE);
        Renderer.render(asset, 1, 12, 0, sj, 1, 1, i-1, j, 2, 1);
    }
}

class Bomb {
    PACE = 8;
    BOMB_ANIM = 99;

    constructor(i, j, fireRad, pid) {
        this.i = i;
        this.j = j;
        this.fireRad = fireRad;
        this.pid = pid;
        this.d = null;
        this.fi = 0;
        this.fj = 0;

        this.bombState = 0;
    }

    render() {
        const sj = Math.floor(3 * this.bombState / this.BOMB_ANIM);
        const i = this.i + this.fi / (2 * this.PACE),
              j = this.j + this.fj / (2 * this.PACE);
        Renderer.render('bomb', 1, 3, 0, sj, 1, 1, i, j, 1, 1);
    }
}

class GameState {
    static HEIGHT = 13;
    static WIDTH = 15;
    DELTA = [[1, 0], [0, -1], [0, 1], [-1, 0]];
    DIRS = ['down', 'left', 'right', 'up'];

    constructor(seed, usernames) {
        const h = GameState.HEIGHT, w = GameState.WIDTH;
        this.blocks = new Array(h);
        this.bombs = new Array(h);
        for(let i = 0; i < h; i++) {
            this.blocks[i] = new Array(w);
            this.bombs[i] = new Array(w);
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
                this.bombs[i][j] = null;
            }
        }
        const locs = [[1, 1], [h-2, w-2], [h-2, 1], [1, w-2]];
        this.players = usernames.map((username, i) => {
            return new Player(locs[i][0], locs[i][1], username, i);
        });
        this.bombset = new Set();

    }

    /*
        note: low player has priority. bombs behave as solids only at integer points.
        if bombs are kicked to same integer point at exact same time, only one will be "solid".
    */
    step(actions) {
        // player bomb placement
        this.players.forEach((player, i) => {
            const space = actions[i].space;
            const pi = player.i, pj = player.j;
            if(space && player.numBombs && this.bombs[pi][pj] === null) {
                const bomb = new Bomb(pi, pj, player.fireRad, i);
                this.bombs[pi][pj] = bomb;
                this.bombset.add(bomb);
                player.numBombs--;
            }
        });

        // player movement
        this.players.forEach((player, i) => {
            const d = this.DIRS.indexOf(actions[i].dir);
            if(player.fi != 0 || player.fj != 0) {
                if(d !== -1 && d === 3-player.d) {
                    player.d = d;
                }
            } else {
                player.moveState = null;
                if(d !== -1) {
                    player.d = d;
                    const [di, dj] = this.DELTA[player.d];
                    if(this.blocks[player.i+di][player.j+dj].type == 'free') {
                        player.moveState = 0;
                    }
                }

            }
            if(player.moveState !== null) {
                const [di, dj] = this.DELTA[player.d];
                player.fi += di;
                if(player.fi < -player.PACE) {
                    player.fi = player.PACE - 1;
                    player.i--;
                } else if(player.fi >= player.PACE) {
                    player.fi = -player.PACE;
                    player.i++;
                }
                player.fj += dj;
                if(player.fj < -player.PACE) {
                    player.fj = player.PACE - 1;
                    player.j--;
                } else if(player.fj >= player.PACE) {
                    player.fj = -player.PACE;
                    player.j++;
                }
                player.moveState++;
                if(player.moveState === player.MOVE_ANIM) {
                    player.moveState = 0;
                }
            }
        });

        // bomb aging / exploding
        this.bombset.forEach(bomb => {
            bomb.bombState++;
            const i = bomb.i, j = bomb.j;
            if(bomb.bombState == bomb.BOMB_ANIM) {
                if(this.bombs[i][j] == bomb) {
                    this.bombs[i][j] = null;
                }
                this.bombset.delete(bomb);
                for(let d = 0; d < 4; d++) {
                    const [di, dj] = this.DELTA[d];
                    let k, lastBlock;
                    for(k = 0; k <= bomb.fireRad; k++) {
                        lastBlock = this.blocks[i+k*di][j+k*dj]
                        if(lastBlock.type !== 'free') {
                            break;
                        }
                    }
                    if(lastBlock.type === 'sand') {
                        lastBlock.type = 'free';
                    }
                }
                const p = this.players[bomb.pid];
                p.numBombs = Math.min(p.MAX_BOMBS, p.numBombs + 1);
            }
        })
    }

    render() {
        const h = GameState.HEIGHT, w = GameState.WIDTH;
        for(let i = 0; i < h; i++) {
            for(let j = 0; j < w; j++) {
                this.blocks[i][j].render();
            }
        }
        this.bombset.forEach(x => x.render());
        this.players.forEach(x => x.render());
    }
}

class Game {
    static TICK_INTERVAL = 15;
    static KEY_TABLE = new Map([
        [40, 'down'],
        [83, 'down'],
        [37, 'left'],
        [65, 'left'],
        [39, 'right'],
        [68, 'right'],
        [38, 'up'],
        [87, 'up'],
        [32, 'space']
    ])

    static start(seed, usernames, pid) {
        this.state = new GameState(seed, usernames);
        this.tickno = 0;
        this.pid = pid;
        this.action = {dir: null, space: false};
    }

    static tick() {
        this.state.render();
        return [this.action, null];
    }

    static receiveActions(actions, tickno) {
        this.state.step(actions);
    }

    static isDone() {
        return false;
    }

    static keyListener(event, down) {
        if(this.KEY_TABLE.has(event.keyCode)) {
            const key = this.KEY_TABLE.get(event.keyCode);
            if(key === 'space') {
                this.action.space = down;
            } else {
                if(down) {
                    this.action.dir = key;
                } else if(this.action.dir === key) {
                    this.action.dir = null;
                }
            }
        }
    }
}
document.addEventListener('keydown', x => Game.keyListener(x, true), false);
document.addEventListener('keyup', x => Game.keyListener(x, false), false);

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