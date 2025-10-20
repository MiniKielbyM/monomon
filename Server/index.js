const express = require('express');
const session = require('express-session');
const { Issuer, generators } = require('openid-client');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Import ServerGame using dynamic import since it's an ES6 module
let ServerGame;

const app = express();
const server = createServer(app);
const io = new Server(server);

let client;

// Game management
const activeGames = new Map();
const waitingPlayers = new Map();

// ==================== OIDC / Cognito Setup ====================
async function initializeClient() {
  const issuer = await Issuer.discover('https://cognito-idp.us-east-1.amazonaws.com/us-east-1_PRW24Zcm7');
  client = new issuer.Client({
    client_id: '8mj3v2cpik6pr90oe9i9tof31',
    client_secret: 'setmmlcs7f36qe4ig3gdus4ca0411nag6dq05t63vhlfea0c6lt',
    redirect_uris: [
      'https://literate-xylophone-947655jpj5q3946-3000.app.github.dev/callback'
    ],
    response_types: ['code']
  });
}
initializeClient().catch(console.error);

// ==================== Middleware ====================
const sessionMiddleware = session({
  secret: 'some-secret',
  resave: false,
  saveUninitialized: false
});

app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);


const checkAuth = (req, res, next) => {
  req.isAuthenticated = !!req.session.userInfo;
  next();
};

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ==================== Routes ====================
app.get('/', (req, res) => {
  res.redirect('/home');
});

app.get('/game-test', (req, res) => {
  if (req.session?.userInfo) {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Game Test</title>
        <script src="/socket.io/socket.io.js"></script>
      </head>
      <body>
        <h1>Game Test</h1>
        <button onclick="joinQueue()">Join Game Queue</button>
        <button onclick="useAbility()">Use Damage Swap</button>
        <div id="messages"></div>
        
        <script>
          const socket = io();
          
          socket.on('game_started', (data) => {
            document.getElementById('messages').innerHTML += '<p>Game started! Game ID: ' + data.gameId + ', Player: ' + data.playerNumber + '</p>';
          });
          
          socket.on('ability_result', (data) => {
            document.getElementById('messages').innerHTML += '<p>Ability result: ' + JSON.stringify(data) + '</p>';
          });
          
          socket.on('card_selection_request', (data) => {
            document.getElementById('messages').innerHTML += '<p>Card selection request: ' + JSON.stringify(data) + '</p>';
            // Auto-respond for testing
            setTimeout(() => {
              socket.emit('card_selection_response', {
                selectionId: data.selectionId,
                selectedCardId: data.cards[0]?.id || null,
                cancelled: false
              });
            }, 1000);
          });
          
          function joinQueue() {
            socket.emit('join_game_queue');
          }
          
          function useAbility() {
            socket.emit('use_ability', { abilityName: 'Damage Swap' });
          }
        </script>
      </body>
      </html>
    `);
  } else {
    res.redirect('/login');
  }
});

app.get('/home', checkAuth, (req, res) => {
  res.render('home', {
    isAuthenticated: req.isAuthenticated,
    userInfo: req.session.userInfo
  });
});

// Login
app.get('/login', (req, res) => {
  const nonce = generators.nonce();
  const state = generators.state();
  req.session.nonce = nonce;
  req.session.state = state;

  const authUrl = client.authorizationUrl({
    scope: 'openid email phone',
    state,
    nonce
  });

  res.redirect(authUrl);
});

// Callback
app.get('/callback', async (req, res) => {
  try {
    const params = client.callbackParams(req);
    const tokenSet = await client.callback(
      'https://literate-xylophone-947655jpj5q3946-3000.app.github.dev/callback',
      params,
      { nonce: req.session.nonce, state: req.session.state }
    );

    const userInfo = await client.userinfo(tokenSet.access_token);

    req.session.userInfo = userInfo;
    req.session.idToken = tokenSet.id_token;

    res.redirect('/home');
  } catch (err) {
    console.error('Callback error:', err);
    res.redirect('/home');
  }
});

// Logout
app.get('/logout', (req, res) => {
  const idToken = req.session?.idToken;
  const cognitoDomain = 'https://us-east-1prw24zcm7.auth.us-east-1.amazoncognito.com';
  const redirectUri = encodeURIComponent('https://literate-xylophone-947655jpj5q3946-3000.app.github.dev/home');

  const logoutUrl = `${cognitoDomain}/logout?client_id=8mj3v2cpik6pr90oe9i9tof31&logout_uri=${redirectUri}&id_token_hint=${idToken}`;

  req.session.destroy(() => {
    res.redirect(logoutUrl);
  });
});

// ==================== Socket.IO ====================
var connectedUsers = [];
// Require authentication for all sockets
io.use((socket, next) => {
  const session = socket.request.session;

  if (session && session.userInfo) {
    socket.user = session.userInfo; // attach user info to socket
    if (!connectedUsers.find(user => user.email === socket.user.email)) {
      connectedUsers.push({email: socket.user.email, name: socket.user.username || socket.user.email });
    }
    socket.broadcast.emit('userList', connectedUsers);
    return next();
  }

  // Reject connection
  return next(new Error("Unauthorized: Please log in first"));
});

io.on('connection', (socket) => {
  console.log('✅ Socket connected:', socket.user.email);

  socket.emit('message', `Hello ${socket.user.email}, socket connected!`);

  socket.on('message', (msg) => {
    console.log(`Received from ${socket.user.email}: ${msg}`);
    socket.emit('message', `Echo: ${msg}`);
  });

  socket.on('getUserInfo', () => {
    socket.emit('userList', connectedUsers);
  });

  socket.on('createRoom', (room) => {
    socket.join(room);
    socket.emit('message', `Room "${room}" created`);

    app.get(`/room/${room}`, (req, res) => {
      if (req.session?.userInfo) {
        res.sendFile(path.join(__dirname, 'room.html'));
      } else {
        res.redirect('/login');
      }
    });
  });
  // Game-related socket handlers
  socket.on('join_game_queue', () => {
    console.log(`${socket.user.email} joined game queue`);
    waitingPlayers.set(socket.id, {
      socket: socket,
      user: socket.user,
      joinTime: Date.now()
    });

    // Try to match players
    const waitingArray = Array.from(waitingPlayers.values());
    if (waitingArray.length >= 2) {
      const player1 = waitingArray[0];
      const player2 = waitingArray[1];
      
      // Remove from waiting queue
      waitingPlayers.delete(player1.socket.id);
      waitingPlayers.delete(player2.socket.id);
      
      // Create game
      if (!ServerGame) {
        console.error('ServerGame not loaded, cannot create game');
        player1.socket.emit('game_error', { error: 'Server not ready' });
        player2.socket.emit('game_error', { error: 'Server not ready' });
        return;
      }
      
      const game = new ServerGame(player1.user, player2.user, io);
      activeGames.set(game.id, game);
      
      // Join players to game room
      player1.socket.join(`game_${game.id}_player_1`);
      player2.socket.join(`game_${game.id}_player_2`);
      
      // Notify players
      player1.socket.emit('game_started', { gameId: game.id, playerNumber: 1 });
      player2.socket.emit('game_started', { gameId: game.id, playerNumber: 2 });
      
      console.log(`Game ${game.id} created between ${player1.user.email} and ${player2.user.email}`);
    }
  });

  socket.on('use_ability', async (data) => {
    console.log(`${socket.user.email} wants to use ability:`, data);
    
    // Find the game this player is in
    const playerGame = Array.from(activeGames.values()).find(game => 
      game.player1.email === socket.user.email || game.player2.email === socket.user.email
    );

    if (playerGame) {
      const playerNumber = playerGame.player1.email === socket.user.email ? 1 : 2;
      
      try {
        const result = await playerGame.useAbility(playerNumber, data.abilityName);
        socket.emit('ability_result', result);
      } catch (error) {
        console.error('Error executing ability:', error);
        socket.emit('ability_result', { success: false, error: error.message });
      }
    } else {
      socket.emit('ability_result', { success: false, error: 'No active game found' });
    }
  });

  socket.on('card_selection_response', (data) => {
    console.log(`${socket.user.email} responded to card selection:`, data);
    
    // Find the game and forward the response
    const playerGame = Array.from(activeGames.values()).find(game => 
      game.player1.email === socket.user.email || game.player2.email === socket.user.email
    );

    if (playerGame) {
      const playerNumber = playerGame.player1.email === socket.user.email ? 1 : 2;
      playerGame.handleCardSelectionResponse(playerNumber, data);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.user.email}`);
    
    // Remove from waiting queue
    waitingPlayers.delete(socket.id);
    
    // Handle game disconnection
    const playerGame = Array.from(activeGames.values()).find(game => 
      game.player1.email === socket.user.email || game.player2.email === socket.user.email
    );

    if (playerGame) {
      // Notify other player
      const otherPlayerNumber = playerGame.player1.email === socket.user.email ? 2 : 1;
      io.to(`game_${playerGame.id}_player_${otherPlayerNumber}`).emit('opponent_disconnected', {
        message: 'Your opponent has disconnected'
      });
      
      // Clean up game
      activeGames.delete(playerGame.id);
    }

    const stillConnected = Array.from(io.sockets.sockets.values()).some(s => s.user && s.user.email === socket.user.email && s.id !== socket.id);
    if (stillConnected) {
      console.log(`User ${socket.user.email} still has active connections.`);
    }
    else{
      connectedUsers = connectedUsers.filter(user => user.email !== socket.user.email);
    }
    socket.broadcast.emit('userList', connectedUsers);
  });
});


// ==================== Start ====================
const PORT = process.env.PORT || 3000;

// Load ServerGame dynamically
async function startServer() {
  try {
    const { default: ServerGameClass } = await import('./ServerGame.js');
    ServerGame = ServerGameClass;
    console.log('ServerGame loaded successfully');
  } catch (error) {
    console.error('Failed to load ServerGame:', error);
    ServerGame = null;
  }

  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();