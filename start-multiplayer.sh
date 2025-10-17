#!/bin/bash

# Start the Pokemon TCG Multiplayer Server and Client
echo "compiling cards..."
node Server/buildCardData.js
sleep 3
echo "Starting Pokemon TCG Multiplayer System..."

# Start the game server in the background
cd /workspaces/monomon/Server
echo "Starting game server on port 8080..."
npm start &
GAME_SERVER_PID=$!

# Start the client server in the background
echo "Starting client server on port 3000..."
cd /workspaces/monomon/Server
node clientServer.js &
CLIENT_SERVER_PID=$!

echo "Game server started with PID: $GAME_SERVER_PID"
echo "Client server started with PID: $CLIENT_SERVER _PID"
echo "Waiting for servers to initialize..."
sleep 3

echo ""
echo "🎮 Pokemon TCG Multiplayer System Ready!"
echo ""
if [ -n "$CODESPACE_NAME" ]; then
    echo "🌐 Open in browser: https://$CODESPACE_NAME-3000.app.github.dev/Lib/GUI.Demo/multiplayerTest.html"
    echo "� Game server: wss://$CODESPACE_NAME-8080.app.github.dev"
else
    echo "�🌐 Open in browser: http://localhost:3000/Lib/GUI.Demo/multiplayerTest.html"
    echo "🎯 Game server: ws://localhost:8080"
fi
echo ""
echo "📋 To test multiplayer:"
if [ -n "$CODESPACE_NAME" ]; then
    echo "1. Open https://$CODESPACE_NAME-3000.app.github.dev/Lib/GUI.Demo/multiplayerTest.html in two different browser windows/tabs"
else
    echo "1. Open http://localhost:3000/Lib/GUI.Demo/multiplayerTest.html in two different browser windows/tabs"
fi
echo "2. Enter different usernames for each player"
echo "3. Both players will be matched automatically"
echo "4. Start moving cards and watch them sync between players!"
echo ""
sleep 5
if [ -n "$CODESPACE_NAME" ]; then
    echo "🔓 Making port 8080 public in Codespaces..."
    gh codespace ports visibility 8080:public -c "$CODESPACE_NAME"
fi

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down servers..."
    kill $GAME_SERVER_PID 2>/dev/null
    kill $CLIENT_SERVER_PID 2>/dev/null
    echo "Servers stopped."
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

echo "Press Ctrl+C to stop all servers"
echo ""

# Keep the script running
wait