# Pokemon TCG Multiplayer System - Technical Documentation

## 🎮 System Overview

This is a complete server-authoritative multiplayer Pokemon Trading Card Game system built with Node.js, WebSocket, and vanilla JavaScript. The system implements real-time card movement synchronization between two players with a client-server architecture where the server maintains the authoritative game state.

### Key Features
- **Server-Authoritative Architecture**: All game state is managed server-side
- **Real-time Multiplayer**: WebSocket-based communication for instant updates
- **Drag-and-Drop Interface**: Intuitive card movement with collision detection
- **GitHub Codespaces Support**: Auto-detection of development environment
- **Move Validation**: Server validates all moves before execution
- **State Synchronization**: Both players see identical game state

### System Architecture
```
┌─────────────────┐    WebSocket     ┌─────────────────┐    WebSocket     ┌─────────────────┐
│   Player 1      │◄────────────────►│   Game Server   │◄────────────────►│   Player 2      │
│   (Client)      │                  │   (Port 8080)   │                  │   (Client)      │
└─────────────────┘                  └─────────────────┘                  └─────────────────┘
         ▲                                     ▲                                     ▲
         │ HTTP                                │                                     │ HTTP
         ▼                                     ▼                                     ▼
┌─────────────────┐                  ┌─────────────────┐                  ┌─────────────────┐
│   Client Server │                  │  Authoritative  │                  │   Client Server │
│   (Port 3000)   │                  │   Game State    │                  │   (Port 3000)   │
└─────────────────┘                  └─────────────────┘                  └─────────────────┘
```

---

## 📁 File Documentation

### `/Server/gameServer.js`

**Purpose**: WebSocket game server that manages all multiplayer game logic and maintains authoritative game state.

**Port**: 8080  
**Protocol**: WebSocket (ws:// locally, wss:// in Codespaces)  
**Dependencies**: `ws`, `uuid`

#### Key Responsibilities
- **Player Matchmaking**: Automatically pairs two players into games
- **Game State Management**: Maintains complete game state for all active games
- **Move Validation**: Validates all card moves before execution
- **State Broadcasting**: Sends game state updates to all players
- **Connection Management**: Handles player connections and disconnections

#### Core Data Structures

```javascript
// Client tracking
clients = Map<WebSocket, ClientInfo>
ClientInfo = {
    id: string,
    username: string,
    gameId: string,
    playerNumber: number,
    ready: boolean,
    ws: WebSocket
}

// Game state
games = Map<gameId, GameInstance>
GameInstance = {
    id: string,
    player1: PlayerInfo,
    player2: PlayerInfo,
    state: 'waiting' | 'playing' | 'finished',
    gameState: {
        player1: PlayerState,
        player2: PlayerState,
        turn: number,
        currentPlayer: number,
        phase: string
    }
}

PlayerState = {
    hand: Card[],           // 7 cards initially
    deck: Card[],           // Remaining deck cards
    activePokemon: Card|null,
    bench: (Card|null)[5],  // 5 bench slots
    discardPile: Card[]
}
```

#### Message Protocol

**Incoming Messages**:
- `join_game`: Player wants to join matchmaking
- `player_ready`: Player is ready to start
- `card_move`: Player wants to move a card

**Outgoing Messages**:
- `waiting_for_opponent`: Waiting for second player
- `game_found`: Both players matched
- `game_start`: Game begins
- `game_state_update`: Complete game state
- `move_error`: Invalid move attempted

#### Key Methods

**`createGame(player1, player2)`**
```javascript
// Creates new game instance with initialized decks
// Deals 7 random cards to each player's hand
// Sets up empty board state (no active Pokemon or bench cards)
```

**`initializeGameDecks(game)`**
```javascript
// Creates card templates (Pikachu, Alakazam, Blastoise)
// Builds 12-card deck for each player (4 of each type)
// Shuffles decks and deals 7 cards to starting hands
```

**`handlePlayerReady(ws, data)`**
```javascript
// Marks player as ready
// When both players ready: starts game and sends initial state
// Triggers sendGameStateToPlayers()
```

**`sendGameStateToPlayers(game)`**
```javascript
// Sends complete game state to both players
// Player 1 gets: yourState=player1, opponentState=player2 (hands hidden)
// Player 2 gets: yourState=player2, opponentState=player1 (hands hidden)
```

**`handleCardMove(ws, data)`**
```javascript
// Validates move using executeMove()
// On success: updates server state, broadcasts to both players
// On failure: sends move_error back to requesting player
```

**`executeMove(playerState, sourceType, sourceIndex, targetType, targetIndex)`**
```javascript
// Server-side move validation and execution
// Source types: 'hand', 'bench', 'active'
// Target types: 'bench', 'active'
// Returns: { success: boolean, newState?: PlayerState, error?: string }
```

#### Error Handling
- Connection validation on all message handlers
- Move validation with descriptive error messages
- Graceful handling of player disconnections
- Game cleanup when players leave

---

### `/Server/clientServer.js`

**Purpose**: HTTP server that serves static client files with proper MIME types.

**Port**: 3000  
**Protocol**: HTTP  
**Dependencies**: `express`, `path`

#### Key Responsibilities
- **Static File Serving**: Serves all client-side files (HTML, JS, CSS, images)
- **MIME Type Configuration**: Ensures proper content types for ES6 modules
- **Route Management**: Provides access to multiplayer and single-player modes
- **Development Support**: Optimized for local development and Codespaces

#### Routes
```javascript
GET /                           → Redirects to multiplayer test
GET /Lib/GUI.Demo/multiplayerTest.html → Main multiplayer interface
GET /single                     → Single-player mode
GET /Lib/**                     → All library files (modules, assets, etc.)
GET /Cards/**                   → Pokemon card images
```

#### MIME Type Configuration
```javascript
'.js'   → 'application/javascript'    // ES6 modules
'.mjs'  → 'application/javascript'    // ES6 modules
'.json' → 'application/json'          // Configuration files
'.png'  → 'image/png'                 // Card images
'.css'  → 'text/css'                  // Stylesheets
```

#### Startup Information
- Displays server URLs for both local and Codespaces environments
- Provides quick access links for testing
- Handles static file caching for performance

---

### `/Lib/webSocketClient.js`

**Purpose**: Client-side WebSocket communication handler with environment auto-detection.

**Dependencies**: None (vanilla JavaScript)  
**Module Type**: ES6 Module

#### Key Responsibilities
- **Environment Detection**: Auto-detects local vs Codespaces URLs
- **Connection Management**: Handles WebSocket lifecycle
- **Message Routing**: Routes server messages to registered callbacks
- **Error Handling**: Manages connection failures and retries

#### Environment Detection Logic
```javascript
// Auto-detects GitHub Codespaces environment
if (window.location.hostname.includes('app.github.dev')) {
    const codespace = window.location.hostname.split('-')[0];
    wsUrl = `wss://${codespace}-8080.app.github.dev`;
} else {
    wsUrl = 'ws://localhost:8080';
}
```

#### Event System
```javascript
// Callback registration
const callbacks = new Map();
on(eventType, callback) // Register event handler
triggerCallback(type, data) // Execute registered callbacks
```

#### Message Protocol Implementation

**Outgoing Messages**:
```javascript
joinGame(username)          // Join matchmaking queue
sendPlayerReady()           // Signal ready to start
sendCardMove(sourceType, sourceIndex, targetType, targetIndex, cardData)
```

**Incoming Message Handlers**:
```javascript
waiting_for_opponent   → Triggers matchmaking UI
game_found            → Triggers game setup
game_start            → Triggers game initialization  
game_state_update     → Triggers state synchronization
move_error            → Triggers error display
opponent_disconnected → Triggers disconnection handling
```

#### Connection States
- **Connecting**: Attempting WebSocket connection
- **Connected**: Active connection established
- **Disconnected**: Connection lost or failed
- **Error**: Connection error occurred

#### Usage Example
```javascript
const wsClient = new WebSocketClient();
await wsClient.connect();

wsClient.on('game_found', (data) => {
    console.log(`Matched with ${data.opponent}`);
});

wsClient.joinGame('PlayerName');
```

---

### `/Lib/game.js`

**Purpose**: Client-side game state management and GUI coordination. In server-authoritative mode, this acts as a mirror of server state rather than maintaining its own authority.

**Dependencies**: `Client`, `GUIHookUtils`  
**Module Type**: ES6 Module

#### Key Responsibilities
- **State Mirroring**: Reflects server-authoritative game state
- **GUI Management**: Updates visual interface based on game state
- **Move Coordination**: Sends moves to server and waits for validation
- **Board State Tracking**: Maintains local copy of game state for display

#### Architecture Shift
**Before**: Client maintained authoritative state  
**After**: Client mirrors server state and only updates on server confirmation

#### Core Data Structure
```javascript
boardState = {
    player1: {
        hand: Card[],              // Player's cards (visible)
        activePokemon: Card|null,  // Active Pokemon slot
        bench: (Card|null)[5],     // 5 bench slots
        deck: Card[],              // Remaining deck
        discardPile: Card[]        // Discarded cards
    },
    player2: {
        activePokemon: Card|null,  // Opponent's active (visible)
        bench: (Card|null)[5],     // Opponent's bench (visible)
        hand: [],                  // Hidden from opponent
        handCount: number,         // Number of cards in hand
        deck: Card[],              // Hidden deck count
        discardPile: Card[]        // Visible discard pile
    }
}
```

#### DOM Element Management
```javascript
domElements = {
    board: HTMLElement,              // Main game board
    playerActive: HTMLElement,       // Player's active Pokemon slot
    playerHand: HTMLElement,         // Player's hand container
    playerBench: HTMLElement[5],     // Player's bench slots
    opponentActive: HTMLElement,     // Opponent's active slot
    opponentBench: HTMLElement[5]    // Opponent's bench slots
}
```

#### Key Methods

**`updateFromServerState(serverState)`**
```javascript
// Called when server sends game_state_update
// Updates local boardState with server data
// Calls updateGUIState() to refresh display
// serverState format: { yourState: PlayerState, opponentState: PlayerState }
```

**`updateGUIState()`**
```javascript
// Master GUI update method
// Calls updatePlayerGUI() and updateOpponentGUI()
// Ensures visual state matches game state
```

**`updateHandGUI()`**
```javascript
// Rebuilds hand display from scratch
// Clears container and adds card elements
// Automatically removes empty slots
// Sets proper CSS classes and background images
```

**`moveCard(fromType, fromIndex, toType, toIndex)`**
```javascript
// In multiplayer: sends move to server for validation
// In single-player: executes move locally
// Move types: 'hand', 'bench', 'active'
```

**`setCardVisual(element, card)` / `clearCardVisual(element)`**
```javascript
// Utility methods for updating card visuals
// Sets background images and CSS classes
// Handles empty/occupied states
```

#### Multiplayer Flow
1. Player drags card → GUI detects move
2. `moveCard()` called → sends to server via WebSocket
3. Server validates → broadcasts updated state
4. `updateFromServerState()` called → GUI refreshes
5. Both players see synchronized state

#### Single Player Fallback
```javascript
// When not in multiplayer mode
executeMoveLocally(fromType, fromIndex, toType, toIndex)
// Directly updates local state and GUI
```

---

### `/Lib/guiHookUtils.js`

**Purpose**: Drag-and-drop system integration with multiplayer networking. Handles pointer events and collision detection for card movement.

**Dependencies**: None (vanilla JavaScript)  
**Module Type**: ES6 Module

#### Key Responsibilities
- **Drag Detection**: Captures pointer events on card elements
- **Collision Detection**: Determines valid drop targets
- **Visual Feedback**: Shows drag state and drop zones
- **Multiplayer Integration**: Coordinates with Game class for move execution
- **Cross-Platform Support**: Works with mouse, touch, and pen input

#### Drag System Architecture
```javascript
dragState = {
    isDragging: boolean,
    draggedElement: HTMLElement,
    startPosition: {x, y},
    offset: {x, y},
    sourceInfo: {type, index}
}
```

#### Initialization
```javascript
initializeDragAndDrop(board, client, game)
// board: Main game board element
// client: Client player object  
// game: Game instance for move coordination
// Sets up pointer event listeners on board
```

#### Event Flow
1. **`pointerdown`** → `startDrag()` - Begins drag operation
2. **`pointermove`** → `updateDrag()` - Updates drag position  
3. **`pointerup`** → `endDrag()` - Completes or cancels drag

#### Collision Detection System
```javascript
getDropTarget(x, y)
// Uses elementsFromPoint() to find valid drop zones
// Checks for specific CSS classes: .bench, .active, .hand
// Returns target info: {type, index, element}
```

#### Valid Drop Targets
- **`.bench .card`**: Bench slots (indices 0-4)
- **`.active`**: Active Pokemon slot
- **`.hand`**: Hand area (for returning cards)

#### Visual States
```javascript
// CSS classes applied during drag
'.dragging'        // Applied to dragged element
'.drag-over'       // Applied to valid drop targets
'.invalid-drop'    // Applied to invalid targets
```

#### Multiplayer Integration
```javascript
// When drag completes successfully
const moveResult = game.moveCard(sourceType, sourceIndex, targetType, targetIndex);
// Game class handles server communication
// Visual updates wait for server confirmation
```

#### Drag Constraints
- Only player's own cards are draggable
- Opponent cards are view-only
- Drag operations respect game rules (via server validation)
- Invalid drops are visually indicated and rejected

#### Touch/Mobile Support
- Uses Pointer Events API for universal input support
- Handles touch gestures, mouse clicks, and pen input
- Prevents default behaviors that interfere with dragging
- Maintains consistent behavior across device types

---

### `/Lib/GUI.Demo/multiplayerTest.html`

**Purpose**: Complete multiplayer game interface with connection management, player matching, and real-time gameplay.

**Dependencies**: All game modules, WebSocket client, card definitions  
**Type**: HTML5 Single Page Application

#### Key Responsibilities
- **User Interface**: Complete game board with player and opponent areas
- **Connection Management**: Username input, connection status, matchmaking
- **Event Coordination**: Bridges WebSocket events with game logic
- **Game Setup**: Initializes players, decks, and game instances
- **Error Handling**: Displays connection errors and move errors

#### HTML Structure
```html
<!-- Connection Interface -->
<div id="username-modal">          <!-- Username input dialog -->
<div id="connection-status">       <!-- Connection state indicator -->
<div id="game-messages">           <!-- Game status messages -->

<!-- Game Board -->
<div id="sixteenbynine">           <!-- Main 16:9 game board -->
  <div id="opponent-zone">         <!-- Opponent's play area -->
    <div class="card active opp">  <!-- Opponent active Pokemon -->
    <div class="bench">            <!-- Opponent bench (5 slots) -->
  </div>
  
  <div id="player-zone">           <!-- Player's play area -->
    <div id="ActivePokemon">       <!-- Player active Pokemon -->
    <div class="bench">            <!-- Player bench (5 slots) -->
    <div id="PlayerHand">          <!-- Player hand cards -->
  </div>
</div>
```

#### CSS Classes for Game Elements
```css
.card                 /* Base card styling */
.player, .opp         /* Player/opponent identification */
.active               /* Active Pokemon slot */
.benched              /* Bench slot */
.in-hand              /* Hand card */
.empty                /* Empty slot styling */
.dragging             /* Currently being dragged */
.drag-over            /* Valid drop target */
```

#### WebSocket Event Handlers

**Connection Events**:
```javascript
waiting_for_opponent  → Show "waiting" status, display message
game_found           → Display opponent info, setup game
game_start           → Enable gameplay, show start message
```

**Game Events**:
```javascript
game_state_update    → Update game display from server state
move_error           → Show error message to player
opponent_disconnected → Handle opponent leaving
connection_lost      → Show reconnection UI
```

#### Game Setup Flow
```javascript
// 1. User enters username and clicks join
joinButton.click() → wsClient.connect() → wsClient.joinGame(username)

// 2. Server matches players
'game_found' event → setupGame(playerNumber)

// 3. Game initialization
setupGame() → {
    create players with decks,
    create game instance,
    assign to window.currentGame,
    start game (waits for server state)
}

// 4. Server sends initial state
'game_state_update' → game.updateFromServerState()
```

#### Player Setup
```javascript
// Creates 12-card deck per player (4 of each type)
const p1Cards = [
    new Pikachu(player1),    // Lightning type, 60 HP
    new Alakazam(player1),   // Psychic type, 80 HP  
    new Blastoise(player1),  // Water type, 100 HP
    // ... 4 of each type
];
```

#### Connection Status Management
```javascript
updateConnectionStatus(status, message)
// status: 'connecting', 'connected', 'waiting', 'disconnected'
// Updates UI color and text
// Shows appropriate user feedback
```

#### Error Display System
```javascript
showGameMessage(message, duration)
// Displays temporary messages to user
// Auto-hides after specified duration
// Used for game events and errors
```

#### Responsive Design
- 16:9 aspect ratio game board
- Scales to fit different screen sizes
- Touch-friendly interface elements
- Clear visual feedback for all interactions

---

### `/start-multiplayer.sh`

**Purpose**: Automated startup script for the complete multiplayer system with environment detection.

**Type**: Bash shell script  
**Permissions**: Executable (`chmod +x`)

#### Key Responsibilities
- **Process Management**: Starts both game server and client server
- **Environment Detection**: Provides correct URLs for local vs Codespaces
- **User Guidance**: Shows setup instructions and testing steps
- **Graceful Shutdown**: Handles Ctrl+C to stop all processes

#### Startup Sequence
```bash
1. Start game server (gameServer.js) on port 8080
2. Start client server (clientServer.js) on port 3000  
3. Wait for initialization (3 seconds)
4. Display environment-appropriate URLs
5. Show testing instructions
6. Wait for user interrupt (Ctrl+C)
```

#### Environment Detection
```bash
if [ -n "$CODESPACE_NAME" ]; then
    # GitHub Codespaces environment
    echo "🌐 Open: https://$CODESPACE_NAME-3000.app.github.dev/..."
    echo "🎯 Server: wss://$CODESPACE_NAME-8080.app.github.dev"
else
    # Local development environment  
    echo "🌐 Open: http://localhost:3000/..."
    echo "🎯 Server: ws://localhost:8080"
fi
```

#### Process Management
```bash
# Background process tracking
npm start &
GAME_SERVER_PID=$!
node clientServer.js &  
CLIENT_SERVER_PID=$!

# Cleanup function
cleanup() {
    kill $GAME_SERVER_PID 2>/dev/null
    kill $CLIENT_SERVER_PID 2>/dev/null
    exit 0
}

# Signal handlers
trap cleanup SIGINT SIGTERM
```

#### User Instructions
```
📋 To test multiplayer:
1. Open [URL] in two different browser windows/tabs
2. Enter different usernames for each player  
3. Both players will be matched automatically
4. Start moving cards and watch them sync between players!
```

#### Usage
```bash
# From project root
./start-multiplayer.sh

# Or with explicit path
/workspaces/monomon/start-multiplayer.sh
```

---

## 🔄 System Flow Diagrams

### Player Connection Flow
```
Player 1                    Server                     Player 2
   │                          │                          │
   ├─ connect() ─────────────►│                          │
   │                          ├─ store client            │
   ├─ joinGame("User1") ─────►│                          │
   │                          ├─ waiting_for_opponent ──►│
   │                          │                          ├─ connect()
   │                          │◄─────────────────────────┤
   │                          ├─ store client            │
   │                          │◄───── joinGame("User2") ─┤
   │◄─ game_found ────────────┤                          │
   │                          ├──────────── game_found ─►│
   ├─ setupGame() ────────────┤                          │
   │                          │                          ├─ setupGame()
   ├─ sendPlayerReady() ─────►│                          │
   │                          │◄───── sendPlayerReady() ─┤
   │                          ├─ createGame()            │
   │◄─ game_state_update ─────┤                          │
   │                          ├──── game_state_update ──►│
   │◄─ game_start ────────────┤                          │
   │                          ├────────── game_start ───►│
   └─ game active ────────────┤                          └─ game active
```

### Card Move Flow
```
Player 1                    Server                     Player 2
   │                          │                          │
   ├─ drag card ──────────────┤                          │
   ├─ sendCardMove() ────────►│                          │
   │                          ├─ validateMove()          │
   │                          ├─ executeMove()           │
   │                          ├─ updateGameState()       │
   │◄─ game_state_update ─────┤                          │
   │                          ├──── game_state_update ──►│
   ├─ updateGUI() ────────────┤                          ├─ updateGUI()
   └─ card moved ─────────────┤                          └─ sees move
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Node.js 14+ installed
- npm package manager
- Modern web browser with WebSocket support

### 2. Installation
```bash
cd /workspaces/monomon
npm install
```

### 3. Start the System
```bash
# Option 1: Use startup script (recommended)
./start-multiplayer.sh

# Option 2: Manual startup
cd Server && npm start &
cd Server && node clientServer.js &
```

### 4. Test Multiplayer
1. Open the provided URL in two browser windows
2. Enter different usernames for each player
3. Both players will be automatically matched
4. Start moving cards between hand, bench, and active slots
5. Watch real-time synchronization between players

### 5. Development
- **Game Server**: Modify `/Server/gameServer.js` for game logic
- **Client Logic**: Modify `/Lib/game.js` for client behavior  
- **UI/Styling**: Modify `/Lib/GUI.Demo/multiplayerTest.html`
- **Networking**: Modify `/Lib/webSocketClient.js` for communication

---

## 🛠️ Troubleshooting

### Common Issues

**"Address already in use" errors**
```bash
pkill -f "gameServer.js"
pkill -f "clientServer.js"
./start-multiplayer.sh
```

**WebSocket connection failures**
- Check console for correct WebSocket URL
- Verify ports 8080 and 3000 are accessible
- In Codespaces: ensure ports are forwarded correctly

**Cards not appearing in hands**
- Check browser console for WebSocket errors
- Verify both players have joined and are ready
- Check server logs for game state updates

**Moves not synchronizing**
- Verify `game_state_update` messages in browser console
- Check server logs for move validation errors
- Ensure both clients are receiving state updates

### Debug Mode
Add console logging to any component:
```javascript
// In game.js
console.log('Debug: Current game state:', this.boardState);

// In gameServer.js  
console.log('Debug: Processing move:', data);
```

---

## 📝 API Reference

### WebSocket Message Protocols

#### Client → Server Messages
```javascript
{type: 'join_game', username: string}
{type: 'player_ready'}
{type: 'card_move', sourceType: string, sourceIndex: number, 
 targetType: string, targetIndex: number, cardData: object}
```

#### Server → Client Messages
```javascript
{type: 'waiting_for_opponent'}
{type: 'game_found', gameId: string, playerNumber: number, opponent: string}
{type: 'game_start', message: string}
{type: 'game_state_update', gameState: {yourState: object, opponentState: object}}
{type: 'move_error', message: string}
{type: 'opponent_disconnected', message: string}
```

### Card Data Structure
```javascript
Card = {
    cardName: string,      // "Pikachu", "Alakazam", "Blastoise"
    type: string,          // "lightning", "psychic", "water"  
    hp: number,            // 60, 80, 100
    health: number,        // Current health (starts at hp)
    imgUrl: string         // Pokemon card image URL
}
```

### Move Types
- **Source Types**: `'hand'`, `'bench'`, `'active'`
- **Target Types**: `'bench'`, `'active'`
- **Indices**: Hand (0-6), Bench (0-4), Active (no index)

---

## 🎯 Future Enhancements

### Planned Features
- **Turn-based Gameplay**: Implement proper Pokemon TCG turn structure
- **Attack System**: Add Pokemon attacks and damage calculation
- **Energy Cards**: Implement energy attachment mechanics
- **Prize Cards**: Add prize card system for win conditions
- **Deck Building**: Allow custom deck construction
- **Spectator Mode**: Let users watch ongoing games
- **Reconnection**: Handle temporary disconnections gracefully

### Technical Improvements
- **Unit Tests**: Add comprehensive test coverage
- **Performance**: Optimize for larger player counts
- **Security**: Add input validation and rate limiting
- **Persistence**: Save game state to database
- **Scaling**: Support multiple concurrent games

This documentation provides a complete technical reference for the Pokemon TCG Multiplayer System. Each component is designed to work together in the server-authoritative architecture, ensuring consistent and synchronized gameplay between all players.