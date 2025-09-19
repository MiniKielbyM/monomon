const express = require('express');
const session = require('express-session');
const { Issuer, generators } = require('openid-client');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = createServer(app);
const io = new Server(server);

let client;

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

// VERY IMPORTANT: share with Socket.IO
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

// Require authentication for all sockets
io.use((socket, next) => {
  const session = socket.request.session;

  if (session && session.userInfo) {
    socket.user = session.userInfo; // attach user info to socket
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
});

// ==================== Start ====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});