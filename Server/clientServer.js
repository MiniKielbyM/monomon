import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 39931;

// Set proper MIME types
express.static.mime.define({
    'application/javascript': ['js'],
    'text/css': ['css'],
    'text/html': ['html']
});

// Serve static files from the entire monomon directory with proper MIME types
app.use(express.static(path.join(__dirname, '..'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
            // Add cache-busting headers for JavaScript files
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        } else if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (path.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html');
            // Add cache-busting headers for HTML files too
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// Serve the multiplayer test page at root
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, '../Lib/GUI.Demo/multiplayerTest.html'));
});

// Serve the single-player test page
app.get('/single', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, '../Lib/GUI.Demo/cardTest.html'));
});

// Serve the diagnostic page
app.get('/test', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, '../Lib/GUI.Demo/diagnostic.html'));
});

// Serve the WebSocket test page
app.get('/wstest', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, '../Lib/GUI.Demo/wsTest.html'));
});

// Serve the URL info page
app.get('/urls', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, '../Lib/GUI.Demo/urls.html'));
});

// Serve the URL info page
app.get('/info', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, '../Lib/GUI.Demo/urlInfo.html'));
});

app.listen(PORT, () => {
    console.log(`Client server started on http://localhost:${PORT}`);
    console.log(`Multiplayer test: http://localhost:${PORT}`);
    console.log(`Single-player test: http://localhost:${PORT}/single`);
});

export default app;