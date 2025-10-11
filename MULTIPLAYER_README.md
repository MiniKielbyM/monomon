# Pokemon TCG Multiplayer System

This is a real-time multiplayer Pokemon Trading Card Game system that allows two players to connect and move their cards around, with moves synchronized between both clients.

## System Architecture

### Server (`/Server/gameServer.js`)
- WebSocket-based server running on port 8080
- Handles player matchmaking (pairs players automatically)
- Synchronizes card movements between clients
- Manages game state and player connections
- Handles disconnections gracefully

### Client (`/Lib/GUI.Demo/multiplayerTest.html`)
- Web-based client with real-time card movement
- Drag and drop interface for card manipulation
- Visual feedback for opponent moves
- Connection status and game messages

### WebSocket Client (`/Lib/webSocketClient.js`)
- Handles all server communication
- Automatic reconnection on connection loss
- Event-based message handling

### GUI Hook Utils (`/Lib/guiHookUtils.js`)
- Enhanced with multiplayer support
- Synchronizes local moves with server
- Updates opponent visuals in real-time

## How to Run

### Option 1: Use the Launcher Script
```bash
./start-multiplayer.sh
```

### Option 2: Manual Setup
1. Start the server:
```bash
cd Server
npm start
```

2. Open the client:
   - Navigate to `Lib/GUI.Demo/multiplayerTest.html` in your browser
   - Or open it in VS Code and use "Open with Live Server"

## How to Test Multiplayer

1. **Start the server** using one of the methods above
2. **Open two browser windows/tabs** with the multiplayer client
3. **Enter different usernames** in each window
4. **Click "Join Game"** in both windows
5. **Players are automatically matched** - you'll see "Game found!" message
6. **Both players get ready** - the game starts automatically
7. **Move cards around** in one window and watch them appear in the other!

## Features

### Real-time Synchronization
- Card movements are instantly synchronized between players
- Drag and drop works exactly like single-player mode
- Opponent moves are visually represented on your board

### Connection Management
- Automatic player matchmaking
- Connection status indicators
- Graceful handling of disconnections
- Automatic reconnection attempts

### Game State Management
- Server maintains authoritative game state
- Moves are validated and confirmed
- Board state is kept synchronized

### Visual Feedback
- Connection status indicator (top-left)
- Game messages for important events
- Player info display (bottom-left)
- Real-time opponent move visualization

## Message Types

### Client → Server
- `join_game`: Request to join with username
- `player_ready`: Signal that player is ready to start
- `card_move`: Send a card movement to opponent
- `game_state_update`: Sync full game state

### Server → Client
- `waiting_for_opponent`: No opponent available yet
- `game_found`: Matched with another player
- `game_start`: Both players ready, game begins
- `opponent_card_move`: Opponent moved a card
- `move_confirmed`: Your move was processed
- `opponent_disconnected`: Opponent left the game

## Supported Card Movements

Currently supports moving cards between:
- Hand → Active Pokemon position
- Hand → Bench positions
- Bench → Active Pokemon position
- Bench → Bench positions
- Active → Bench positions

## Technical Details

### Server Technology
- Node.js with WebSocket (ws) library
- UUID for unique identifiers
- Event-driven architecture

### Client Technology
- Vanilla JavaScript with ES6 modules
- WebSocket API for real-time communication
- CSS animations and drag/drop

### Network Protocol
- JSON-based message format
- WebSocket for bidirectional real-time communication
- Automatic heartbeat and reconnection

## Troubleshooting

### "Connection failed" error
- Make sure the server is running on port 8080
- Check if the port is available (not blocked by firewall)
- Verify WebSocket support in your browser

### "Waiting for opponent" indefinitely
- Open a second browser window/tab with the same client
- Make sure both players use different usernames
- Check server console for error messages

### Cards not synchronizing
- Check browser console for WebSocket errors
- Verify both players are in the same game session
- Restart both server and clients if needed

## Development Notes

### Adding New Features
- Card movements: Update `handleCardMove` in `gameServer.js`
- New message types: Add to both client and server message handlers
- UI improvements: Modify `multiplayerTest.html` and CSS

### Testing
- Use browser developer tools to monitor WebSocket traffic
- Server logs show all connection and game events
- Multiple browser windows simulate different players

### Performance
- Server can handle multiple concurrent games
- Each game is isolated with its own state
- Efficient message passing with minimal data transfer