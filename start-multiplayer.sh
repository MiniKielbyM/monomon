#!/bin/bash

# Start the Pokemon TCG Multiplayer Server and Client

echo "Starting Pokemon TCG Multiplayer System..."

# Start the game server in the background
cd /workspaces/monomon/Server
echo "Starting game server on port 8080..."
npm start &
GAME_SERVER_PID=$!

# Start the client server in the background
echo "Starting client server on port 3000..."
node clientServer.js &
CLIENT_SERVER_PID=$!

echo "Game server started with PID: $GAME_SERVER_PID"
echo "Client server started with PID: $CLIENT_SERVER_PID"
echo "Waiting for servers to initialize..."
sleep 3

echo ""
echo "🎮 Pokemon TCG Multiplayer System Ready!"
echo ""
echo "🌐 Open in browser: http://localhost:3000"
echo "🎯 Game server: ws://localhost:8080"
echo ""
echo "📋 To test multiplayer:"
echo "1. Open http://localhost:3000 in two different browser windows/tabs"
echo "2. Enter different usernames for each player"
echo "3. Both players will be matched automatically"
echo "4. Start moving cards and watch them sync between players!"
echo ""

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