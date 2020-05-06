const socket = io();

PAGES = ['menu', 'lobby']
function showPage(page) {
    PAGES.forEach(x => $(`#${x}`).hide());
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

function playerReady() {
    $("#ready").prop('disabled', true);
    socket.emit('playerReady');
}

socket.on('sendLobby', lobby => {
    $('#lobbyname').text(`lobby #${lobby.id}`);
    const playerlist = $('#playerlist');
    playerlist.empty();
    for(const player of lobby.players) {
        const text = `${player.username} (${player.ready? 'ready' : 'not ready'})`
        playerlist.append(`<li> ${text} </li>`)
    }
    showPage('lobby');
});

socket.on('joinFail', message => alert(message));