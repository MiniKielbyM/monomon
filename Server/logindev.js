const express = require('express');
const session = require('express-session');
const { Issuer, generators } = require('openid-client');
const path = require('path');

const app = express();
let client;

// Initialize OpenID Client
async function initializeClient() {
  const issuer = await Issuer.discover('https://cognito-idp.us-east-1.amazonaws.com/us-east-1_PRW24Zcm7');
client = new issuer.Client({
  client_id: '8mj3v2cpik6pr90oe9i9tof31',
  client_secret: 'setmmlcs7f36qe4ig3gdus4ca0411nag6dq05t63vhlfea0c6lt',
  redirect_uris: ['https://literate-xylophone-947655jpj5q3946-3000.app.github.dev/callback'],
  response_types: ['code']
});

}
initializeClient().catch(console.error);

// Session middleware
app.use(session({
  secret: 'some-secret',
  resave: false,
  saveUninitialized: false
}));

// Middleware to set isAuthenticated
const checkAuth = (req, res, next) => {
  req.isAuthenticated = !!req.session.userInfo;
  next();
};

// Views setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.get('/', (req, res) => {
  res.redirect('/home');
});

app.get('/home', checkAuth, (req, res) => {
  res.render('home', {
    isAuthenticated: req.isAuthenticated,
    userInfo: req.session.userInfo
  });
});

app.get('/login', (req, res) => {
  const nonce = generators.nonce();
  const state = generators.state();

  req.session.nonce = nonce;
  req.session.state = state;

  const authUrl = client.authorizationUrl({
    scope: 'openid email phone',
    state: state,
    nonce: nonce,
  });

  res.redirect(authUrl);
});

// Callback route
app.get('/callback', async (req, res) => {
  try {
    const params = client.callbackParams(req);

    // Perform token exchange
    const tokenSet = await client.callback(
      'https://literate-xylophone-947655jpj5q3946-3000.app.github.dev/callback',
      params,
      {
        nonce: req.session.nonce,
        state: req.session.state
      }
    );

    // Fetch user info
    const userInfo = await client.userinfo(tokenSet.access_token);

    // Store user info AND id_token in session
    req.session.userInfo = userInfo;
    req.session.idToken = tokenSet.id_token;  // Important for logout

    res.redirect('/home');
  } catch (err) {
    console.error('Callback error:', err);
    res.redirect('/home');
  }
});

// Logout route
app.get('/logout', (req, res) => {
  const idToken = req.session?.idToken;
  const cognitoDomain = 'https://us-east-1prw24zcm7.auth.us-east-1.amazoncognito.com';
  const redirectUri = encodeURIComponent('https://literate-xylophone-947655jpj5q3946-3000.app.github.dev/home');

  const logoutUrl = `${cognitoDomain}/logout?client_id=8mj3v2cpik6pr90oe9i9tof31&logout_uri=${redirectUri}&id_token_hint=${idToken}`;

  req.session.destroy(() => {
    res.redirect(logoutUrl);
  });
});


// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
