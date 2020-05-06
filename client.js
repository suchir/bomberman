const socket = io();

function showPage(page) {
    ['#menu', '#lobby', '#game'].forEach(x => $(x).hide());
    $(`#${page}`).show();
}

function getUsername() {
    const username = $('#username').val().substr(0, 10);
    if(username === '') {
        alert('username required');
        return null;
    }
    return username;
}

function createGame() {
    const username = getUsername();
    if(username !== null) {
        socket.emit('createGame', username);
    }
}

function joinGame() {
    const username = getUsername(), lobbyno = $('#lobbyno').val();
    if(lobbyno === '') {
        alert('lobby # required');
    } else if(username !== null) {
        socket.emit('joinGame', username, Number(lobbyno));
    }
}

function startGame() {
    socket.emit('startGame');
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
    showPage('lobby');
});

socket.on('joinFail', message => alert(message));

const ctx = $('#canvas')[0].getContext('2d');

socket.on('startGame', (seed, usernames, pid) => {
    // TODO: game logic

    ctx.beginPath();
    ctx.rect(20, 40, 50, 50);
    ctx.fillStyle = "#FF0000";
    ctx.fill();
    ctx.closePath();

    setTimeout(() => socket.emit('endGame'), 1000);

    showPage('game');
});