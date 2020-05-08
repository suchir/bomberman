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

class Movable {
    move() {
        const [di, dj] = GameState.DELTA[this.d];
        this.fi += di;
        if(this.fi < -this.PACE) {
            this.fi = this.PACE - 1;
            this.i--;
        } else if(this.fi >= this.PACE) {
            this.fi = -this.PACE;
            this.i++;
        }
        this.fj += dj;
        if(this.fj < -this.PACE) {
            this.fj = this.PACE - 1;
            this.j--;
        } else if(this.fj >= this.PACE) {
            this.fj = -this.PACE;
            this.j++;
        }    
    }

    onGrid() {
        return this.fi === 0 && this.fj === 0;
    }
}

class Player extends Movable {
    PACE = 8;
    MOVE_TICKS = 16; // 4N
    DYING_TICKS = 28; // 7N
    MAX_BOMBS = 5;

    constructor(i, j, username, pid) {
        super();
        this.i = i;
        this.j = j;
        this.username = username;
        this.pid = pid;
        this.d = 0;
        this.fi = 0;
        this.fj = 0;
        this.numBombs = 5;
        this.fireRad = 6;
        this.hasKick = true;

        this.moveState = null;
        this.dyingState = null;
        this.deadState = null;
    }

    step() {
        if(this.moveState !== null) {
            this.moveState++;
            if(this.moveState === this.MOVE_TICKS) {
                this.moveState = 0;
            }
            this.move();
        }
        if(this.dyingState !== null) {
            this.dyingState++;
            if(this.dyingState == this.DYING_TICKS) {
                this.dyingState = null;
                this.deadState = 1;
            }
        }
    }

    kill() {
        this.moveState = null;
        this.dyingState = 0;
    }

    killed() {
        return this.dyingState !== null || this.deadState !== null;
    }

    render() {
        if(this.deadState !== null) {
            return;
        }
        const i = this.i + this.fi / (2 * this.PACE),
              j = this.j + this.fj / (2 * this.PACE);
        if(this.dyingState !== null) {
            const asset = `playerexpl${this.pid}`;
            const sj = Math.floor(7 * this.dyingState / this.DYING_TICKS);
            Renderer.render(asset, 1, 7, 0, sj, 1, 1, i-0.5, j, 1.5, 1);
        } else {
            const asset = `player${this.pid}`;
            let sj = this.d * 3;
            if(this.moveState !== null) {
                const state = Math.floor(4 * this.moveState / this.MOVE_TICKS);
                sj += state == 1? 1 : state == 3? 2 : 0;
            }
            Renderer.render(asset, 1, 12, 0, sj, 1, 1, i-0.5, j, 1.5, 1);    
        }
    }
}

class Bomb extends Movable {
    PACE = 4;
    BOMB_TICKS = 99; // 3N

    constructor(i, j, fireRad, pid) {
        super();
        this.i = i;
        this.j = j;
        this.fireRad = fireRad;
        this.pid = pid;
        this.d = null;
        this.fi = 0;
        this.fj = 0;

        this.bombState = 0;
    }

    step() {
        this.bombState++;
        if(this.bombState === this.BOMB_TICKS) {
            this.bombState = null;
        }
        if(this.d !== null) {
            this.move();
        }
    }

    render() {
        const sj = Math.floor(3 * this.bombState / this.BOMB_TICKS);
        const i = this.i + this.fi / (2 * this.PACE),
              j = this.j + this.fj / (2 * this.PACE);
        Renderer.render('bomb', 1, 3, 0, sj, 1, 1, i, j, 1, 1);
    }
}

class Fire {
    FIRE_TICKS = 14; // 7N

    constructor(i, j, d, tail) {
        this.i = i;
        this.j = j;
        this.d = d;
        this.tail = tail;

        this.fireState = 0;
    }

    step() {
        this.fireState++;
        if(this.fireState === this.FIRE_TICKS) {
            this.fireState = null;
        }
    }

    render() {
        const k = 3 - Math.abs(3 - Math.floor(7 * this.fireState / this.FIRE_TICKS));
        if(this.d === null) {
            Renderer.render('expl', 4, 7, 0, k, 1, 1, this.i, this.j, 1, 1);
        } else {
            const l = !this.tail? 0 : this.d === 0 || this.d === 2? 1 : -1;
            if(this.d === 0 || this.d === 3) {
                Renderer.render('expl', 4, 7, 2+l, k, 1, 1, this.i, this.j, 1, 1);
            } else {
                Renderer.render('expl', 4, 7, k, 5+l, 1, 1, this.i, this.j, 1, 1);
            }
        }
    }
}

class GameState {
    static HEIGHT = 13;
    static WIDTH = 15;
    static DELTA = [[1, 0], [0, -1], [0, 1], [-1, 0]];
    static DIRS = ['down', 'left', 'right', 'up'];

    constructor(seed, usernames) {
        const h = GameState.HEIGHT, w = GameState.WIDTH;
        this.blocks = new Array(h);
        this.bombs = new Array(h);
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
        const locs = [[1, 1], [h-2, w-2], [h-2, 1], [1, w-2]];
        this.players = usernames.map((username, i) => {
            return new Player(locs[i][0], locs[i][1], username, i);
        });
        this.bombset = new Set();
        this.fireset = new Set();
    }

    bombsAt(i, j) {
        return [...this.bombset].filter(bomb => bomb.i == i && bomb.j == j);
    }

    // note: low player has priority. bombs behave as solids only at integer points.
    step(actions, predict, pid) {
        // handle disconnections
        this.players.forEach((player, i) => {
            if(!predict && !player.killed() && actions[i] === null) {
                player.kill();
            }
        })

        // player bomb placement
        this.players.forEach((player, i) => {
            if(player.killed() || (predict && i !== pid)) {
                return;
            }
            const space = actions[i].space;
            const pi = player.i, pj = player.j;
            if(space && player.numBombs && !this.bombsAt(pi, pj).length) {
                const bomb = new Bomb(pi, pj, player.fireRad, i);
                this.bombset.add(bomb);
                player.numBombs--;
            }
        });

        // player movement
        this.players.forEach((player, i) => {
            if(predict && i !== pid) {
                return;
            }
            if(player.killed()) {
                player.step();
                return;
            }

            const d = GameState.DIRS.indexOf(actions[i].dir);
            if(!player.onGrid()) {
                if(d !== -1 && d === 3-player.d) {
                    player.d = d;
                }
            } else {
                player.moveState = null;
                if(d !== -1) {
                    player.d = d;
                    const i = player.i, j = player.j;
                    const [di, dj] = GameState.DELTA[player.d];
                    if(this.blocks[i+di][j+dj].type === 'free') {
                        player.moveState = 0;
                        const adjBombs = this.bombsAt(i+di, j+dj);
                        if(adjBombs.length) {
                            if(player.hasKick && this.blocks[i+2*di][j+2*dj].type === 'free' &&
                               !this.bombsAt(i+2*di, j+2*dj).length) {
                                adjBombs.forEach(bomb => bomb.d = d);
                            }
                        }
                    }
                }
            }
            player.step();
        });

        // bomb aging / exploding
        this.bombset.forEach(bomb => {
            let i = bomb.i, j = bomb.j;
            
            if(bomb.onGrid()) {
                if(bomb.d !== null) {
                    const [di, dj] = GameState.DELTA[bomb.d];
                    if(this.blocks[i+di][j+dj].type !== 'free' || this.bombsAt(i+di, j+dj).length) {
                        bomb.d = null;
                    }    
                }
            }
            bomb.step();
            i = bomb.i, j = bomb.j;

            if(bomb.bombState == null) {
                this.bombset.delete(bomb);

                this.fireset.add(new Fire(i, j, null, false));
                for(let d = 0; d < 4; d++) {
                    const [di, dj] = GameState.DELTA[d];
                    let k, lastBlock;
                    for(k = 0; k <= bomb.fireRad; k++) {
                        const ii = i+k*di, jj = j+k*dj;
                        lastBlock = this.blocks[ii][jj]
                        if(lastBlock.type !== 'free' || this.bombsAt(ii, jj).length) {
                            break;
                        }
                    }
                    if(lastBlock.type === 'sand') {
                        lastBlock.type = 'free';
                        k++;
                    }
                    for(let l = 1; l < k; l++) {
                        this.fireset.add(new Fire(i+l*di, j+l*dj, d, l === k-1));
                    }
                }

                const p = this.players[bomb.pid];
                p.numBombs = Math.min(p.MAX_BOMBS, p.numBombs + 1);
            }
        });

        this.fireset.forEach(fire => {
            if(fire.fireState === 0) {
                this.players.forEach(player => {
                    if(fire.i === player.i && fire.j === player.j && !player.killed()
                        && !predict) {
                        player.kill();
                    }
                })
            }
            fire.step();
            if(fire.fireState == null) {
                this.fireset.delete(fire);
            }
        });
    }

    isDone() {
        const numAlive = this.players.map(x => x.deadState !== null? 0 : 1).reduce((x, y) => x + y);
        return this.players.length === 1? numAlive === 0 : numAlive <= 1;
    }

    render() {
        const h = GameState.HEIGHT, w = GameState.WIDTH;
        for(let i = 0; i < h; i++) {
            for(let j = 0; j < w; j++) {
                this.blocks[i][j].render();
            }
        }
        this.fireset.forEach(x => x.render());
        this.bombset.forEach(x => x.render());
        this.players.forEach(x => x.render());
    }
}

class Game {
    static TICK_INTERVAL = 15;
    static EMA_ALPHA = 15/1000;
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
    static DEFAULT_ACTION = {dir: null, space: false};

    static start(seed, usernames, pid) {
        this.state = new GameState(seed, usernames);
        this.tickno = 0;
        this.pid = pid;
        this.action = _.clone(Game.DEFAULT_ACTION);
        this.actionList = [];
        this.ping = 0;
    }

    static render() {
        const pred = _.cloneDeep(this.state);
        const actions = (new Array(this.state.players.length)).fill(Game.DEFAULT_ACTION);
        for(let [_, action] of this.actionList) {
            actions[this.pid] = action;
            pred.step(actions, true, this.pid);
        }
        pred.render();
        $('#ping').text(`ping: ${Math.floor(this.ping)}`)
    }

    static tick() {
        this.actionList.push([this.tickno, _.clone(this.action)])
        const lag = this.actionList.length*this.TICK_INTERVAL
        this.ping = this.EMA_ALPHA*lag + (1-this.EMA_ALPHA)*this.ping;
        this.render();
        this.tickno++;
        return [this.action, this.tickno - 1];
    }

    static receiveActions(actions, tickno) {
        this.state.step(actions, false, this.pid);
        let i = 0;
        for(; i < this.actionList.length; i++) {
            if(tickno === null || this.actionList[i][0] > tickno) {
                break;
            }
        }
        this.actionList = this.actionList.slice(i);
        this.render();
    }

    static isDone() {
        return this.state.isDone();
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
            const [action, tickno] = Game.tick();
            socket.emit('sendAction', action, tickno);
        }
    }, Game.TICK_INTERVAL);
    UI.showPage('game');
});

socket.on('broadcastActions', (actions, tickno) => {
    Game.receiveActions(actions, tickno);
})