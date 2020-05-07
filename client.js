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

const ctx = $('#canvas')[0].getContext('2d');

class Game {
    static TICK_INTERVAL = 250;

    static start(seed, usernames, pid) {

    }

    static tick() {
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
            console.log('end game');
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