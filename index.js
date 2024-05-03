
window.player_ready = false;


const clientId = '5ee837cf909a4d62a7ef202ee7b16201';
let redirectUrl = null;
if (window.location.hostname === 'localhost') {
    redirectUrl = 'http://localhost:8081';
} else {
    redirectUrl = 'https://soundboard.simeon.dev';
}

const authorizationEndpoint = "https://accounts.spotify.com/authorize";
const tokenEndpoint = "https://accounts.spotify.com/api/token";
const scope = 'user-read-private user-read-email streaming user-read-playback-state user-modify-playback-state user-read-currently-playing';

// Data structure that manages the current active token, caching it in localStorage
const currentToken = {
    get access_token() { return localStorage.getItem('access_token') || null; },
    get refresh_token() { return localStorage.getItem('refresh_token') || null; },
    get expires_in() { return localStorage.getItem('refresh_in') || null },
    get expires() { return localStorage.getItem('expires') || null },

    save: function (response) {
        const { access_token, refresh_token, expires_in } = response;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', refresh_token);
        localStorage.setItem('expires_in', expires_in);

        const now = new Date();
        const expiry = new Date(now.getTime() + (expires_in * 1000));
        localStorage.setItem('expires', expiry);
    }
};

async function onLoad() {
    // On page load, try to fetch auth code from current browser search URL
    const args = new URLSearchParams(window.location.search);
    const code = args.get('code');

    // If we find a code, we're in a callback, do a token exchange
    if (code) {
        const token = await getToken(code);
        currentToken.save(token);

        // Remove code from URL so we can refresh correctly.
        const url = new URL(window.location.href);
        url.searchParams.delete("code");

        const updatedUrl = url.search ? url.href : url.href.replace('?', '');
        window.history.replaceState({}, document.title, updatedUrl);
    }

    // check if the token is valid
    await refreshTokenClick();
    if (currentToken.access_token) {
        const response = await fetch("https://api.spotify.com/v1/me", {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + currentToken.access_token },
        });

        if (response.status === 401) {
            localStorage.clear();
            // force relogin
        }
    }

    // If we have a token, we're logged in, so fetch user data and render logged in template
    if (currentToken.access_token) {
        document.querySelectorAll('.logged-in').forEach(e => e.style.display = '');
        document.querySelectorAll('.logged-out').forEach(e => e.style.display = 'none');

        const userData = await getUserData();
        console.log('Logged in as: ', userData.display_name);

        setTimeout(() => {
            // check if the token will expire within the next 5 minutes
            const expires = new Date(currentToken.expires);
            const now = new Date();
            const diff = expires - now;

            if (diff < 300000) {
                refreshTokenClick();
            }
        }, 60000);

        initializeSpotifyPlayer();
    }

    // Otherwise we're not logged in, so render the login template
    if (!currentToken.access_token) {
        document.querySelectorAll('.logged-in').forEach(e => e.style.display = 'none');
        document.querySelectorAll('.logged-out').forEach(e => e.style.display = '');
    }
}


async function redirectToSpotifyAuthorize() {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const randomValues = crypto.getRandomValues(new Uint8Array(64));
    const randomString = randomValues.reduce((acc, x) => acc + possible[x % possible.length], "");

    const code_verifier = randomString;
    const data = new TextEncoder().encode(code_verifier);
    const hashed = await crypto.subtle.digest('SHA-256', data);

    const code_challenge_base64 = btoa(String.fromCharCode(...new Uint8Array(hashed)))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    window.localStorage.setItem('code_verifier', code_verifier);

    const authUrl = new URL(authorizationEndpoint)
    const params = {
        response_type: 'code',
        client_id: clientId,
        scope: scope,
        code_challenge_method: 'S256',
        code_challenge: code_challenge_base64,
        redirect_uri: redirectUrl,
    };

    authUrl.search = new URLSearchParams(params).toString();
    window.location.href = authUrl.toString(); // Redirect the user to the authorization server for login
}

// Soptify API Calls
async function getToken(code) {
    const code_verifier = localStorage.getItem('code_verifier');

    const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            client_id: clientId,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirectUrl,
            code_verifier: code_verifier,
        }),
    });

    return await response.json();
}

async function refreshToken() {
    const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            client_id: clientId,
            grant_type: 'refresh_token',
            refresh_token: currentToken.refresh_token
        }),
    });

    return await response.json();
}

async function getUserData() {
    const response = await fetch("https://api.spotify.com/v1/me", {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + currentToken.access_token },
    });

    return await response.json();
}

async function playSong(trackId, position) {
    console.log('Playing song', trackId, position);
    window.player.setVolume(1);
    clearTimeout(window.auto_pause_timer);

    const response = await fetch("https://api.spotify.com/v1/me/player/play?device_id=" + window.device_id, {
        method: 'PUT',
        headers: {
            'Authorization': 'Bearer ' + currentToken.access_token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            uris: [`spotify:track:${trackId}`],
            position_ms: position * 1000,
        }),
    });

    return response;
}

// Click handlers
async function loginWithSpotifyClick() {
    await redirectToSpotifyAuthorize();
}

async function logoutClick() {
    localStorage.clear();
    window.location.href = redirectUrl;
}

async function refreshTokenClick() {
    const token = await refreshToken();
    currentToken.save(token);
}

async function pauseTaper(fade_time = 5000) {
    const fade_step = 1 / fade_time * 50;
    // lower volume over fade_time, then pause
    window.current_volume = window.current_volume || 1;
    window.volume_timer = setInterval(() => {
        window.player.setVolume(window.current_volume);
        window.current_volume -= fade_step;
        if (window.current_volume <= 0) {
            clearInterval(window.volume_timer);
            window.current_volume = null;
            window.player.pause();
        }
    }, 50);
}

async function updatePlayPauseButton(to_state = null) {
    if (!to_state) {
        const state = await window.player.getCurrentState();
        if (!state) {
            return;
        }
        to_state = state.paused ? 'play' : 'pause';
    }

    const e = document.getElementById('btn_playpause');
    if (to_state == 'play') {
        e.innerHTML = '<i class="fas fa-play"></i>';
        e.dataset.action = 'play';
    } else if (to_state == 'pause') {
        e.innerHTML = '<i class="fas fa-pause"></i>';
        e.dataset.action = 'pause';
    }
}

async function updateSoundboardButtons() {
    const button_data_yml = await fetch('button_data.yml').then(response => response.text());
    window.button_data = jsyaml.load(button_data_yml);

    document.getElementById('soundboard_buttons').innerHTML = window.button_data.map((button, idx) => {
        return `<button class="player_btn btn btn-outline-dark" data-player="${idx}">${button.name}</button>`;
    }).join('');
}

async function queueAutoPause() {
    const state = await window.player.getCurrentState();
    if (!state) { return; }
    if (state.paused) { return; }
    if (!window.current_player_idx) { return; }

    const target = button_data[window.current_player_idx].end * 1000;
    const position = state.position;
    const remaining = target - position;

    console.log('Queueing auto-pause in', remaining - 4000, 'ms')

    if (window.auto_pause_timer) {
        clearTimeout(window.auto_pause_timer);
    }
    window.auto_pause_timer = setTimeout(() => {
        window.current_player_idx = null;
        pauseTaper(5000);
    }, remaining - 3000);
}

async function initializeSpotifyPlayer() {
    const token = currentToken.access_token;
    const player = new Spotify.Player({
        name: 'Soundboard Player',
        getOAuthToken: cb => { cb(token); }
    });

    player.addListener('player_state_changed', state => {
        Array.from(document.getElementsByClassName('player__info__title')).forEach(x => x.innerText = state.track_window.current_track.name);
        Array.from(document.getElementsByClassName('player__info__artist')).forEach(x => x.innerText = state.track_window.current_track.artists[0].name);
        Array.from(document.getElementsByClassName('player__album')).forEach(x => x.style.backgroundImage = `url('${state.track_window.current_track.album.images[0].url}')`);
        updatePlayPauseButton();
        queueAutoPause();
    });

    player.addListener('ready', ({ device_id }) => {
        console.log('Ready with Device ID', device_id);
        window.device_id = device_id;

        document.getElementById('main_player').style.display = '';

        // load player buttons
        updateSoundboardButtons();
    });

    player.addListener('not_ready', ({ device_id }) => {
        console.log('Device ID has gone offline', device_id);
    });

    player.connect();

    window.player = player;
}

window.onSpotifyWebPlaybackSDKReady = () => {
    window.player_ready = true;
};


document.getElementById('soundboard_buttons').addEventListener('click', (e) => {
    if (!window.player_ready) {
        return;
    }

    if (e.target.classList.contains('player_btn')) {
        window.current_player_idx = e.target.getAttribute('data-player');
        const player = window.button_data[window.current_player_idx];
        playSong(player.track, player.start);
        window.player.activateElement();
    }
});

document.getElementById('btn_playpause').addEventListener('click', () => {
    const e = document.getElementById('btn_playpause');
    // if window is currently playing
    if (e.dataset.action == 'play') {
        window.player.setVolume(1);
        window.player.resume();

        // set icon to pause
        updatePlayPauseButton('pause');
    } else {
        pauseTaper(1000);

        if (window.auto_pause_timer) {
            clearTimeout(window.auto_pause_timer);
        }

        // set icon to play
        updatePlayPauseButton('play');
    }
});


document.getElementById('btn_login').addEventListener('click', loginWithSpotifyClick);

onLoad();
