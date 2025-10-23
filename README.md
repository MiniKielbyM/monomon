# Monomon — Multiplayer Pokémon TCG Engine

A server-authoritative, WebSocket-based multiplayer Pokémon Trading Card Game (TCG) implementation built with Node.js and vanilla JavaScript. This project demonstrates real-time game state synchronization, defensive server programming, and rich client-side interactions.

<img src="https://hackatime-badge.hackclub.com/U0925ST8U4B/monomon"/>

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Core Components](#core-components)
  - [Server Components](#server-components)
  - [Client Components](#client-components)
  - [Shared Components](#shared-components)
- [Game Flow](#game-flow)
- [WebSocket Protocol](#websocket-protocol)
- [Getting Started](#getting-started)
- [Development Guide](#development-guide)
- [Card System](#card-system)
- [Ability System](#ability-system)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

## Overview

Monomon is an experimental implementation of the Pokémon TCG with the following key features:

- **Server-Authoritative Architecture**: All game logic and state management happens on the server to prevent cheating
- **Real-Time Multiplayer**: WebSocket-based communication for instant game updates
- **Defensive Programming**: Extensive error handling, validation, and rollback mechanisms
- **Rich Client UI**: Drag-and-drop card placement, interactive modals, and visual feedback
- **Modular Card System**: Extensible card definitions with server-side ability callbacks

This project serves as both a playable game and a reference implementation for building multiplayer card games with complex rule enforcement.

---

## Architecture

### High-Level Design

```
┌─────────────┐                    ┌─────────────┐
│   Client 1  │◄───WebSocket──────►│             │
│  (Browser)  │                    │             │
└─────────────┘                    │   Game      │
                                   │   Server    │
┌─────────────┐                    │  (Node.js)  │
│   Client 2  │◄───WebSocket──────►│             │
│  (Browser)  │                    │             │
└─────────────┘                    └─────────────┘
```

### Key Principles

1. **Server Authority**: The server maintains the canonical game state; clients display it
2. **Optimistic Updates**: Clients can show immediate feedback but must rollback on server rejection
3. **Defensive Snapshots**: Server creates state snapshots before risky operations (evolution, trainer effects)
4. **Per-Player Sanitization**: Each client receives only information their player should know
5. **Graceful Degradation**: Server attempts to normalize various card data shapes for compatibility

---

## Project Structure

```
monomon/
├── Docs/                           # Documentation
│   ├── AbilitySystem.md           # Ability system design
│   ├── MULTIPLAYER_DOCUMENTATION.md
│   └── MULTIPLAYER_README.md
│
├── Lib/                           # Client-side and shared code
│   ├── card.js                    # Base Card and Energy classes
│   ├── client.js                  # Minimal client wrapper
│   ├── deck.js                    # Deck management utilities
│   ├── enums.js                   # Shared enumerations
│   ├── game.js                    # Client-side Game controller
│   ├── guiHookUtils.js           # UI interaction layer
│   ├── webSocketClient.js        # WebSocket client wrapper
│   ├── PokemonList.js            # Pokemon data
│   │
│   ├── Cards/                     # Card definitions
│   │   └── Base/
│   │       └── Base1/
│   │           └── Cards.js       # Card classes and AbilityRegistry
│   │
│   └── GUI.Demo/                  # Demo UI
│       ├── multiplayerTest.html  # Main game UI
│       ├── BoardLayout.css       # Game board styling
│       ├── BoardDynamicSizing.js # Responsive layout
│       └── [other demo files]
│
├── Server/                        # Server-side code
│   ├── index.js                  # Server entry point
│   ├── gameServer.js             # WebSocket server & lobby system
│   ├── ServerGame.js             # Per-game authoritative logic
│   ├── clientServer.js           # HTTP server for serving views
│   ├── cardData.js               # Generated card metadata
│   ├── buildCardData.js          # Card data builder
│   ├── generateCardData.js       # Card data generator
│   ├── package.json              # Server dependencies
│   └── views/
│       └── home.ejs              # Home page template
│
├── package.json                   # Root package manifest
├── start-multiplayer.sh          # Server launch script
└── README.md                     # This file
```

---

## Core Components

### Server Components

#### `Server/gameServer.js` — Game Server & Lobby Manager

**Purpose**: WebSocket server that manages connections, lobbies, and game lifecycle.

**Key Responsibilities**:
- Accept WebSocket connections and maintain client registry
- Assign players to lobbies (2 players per lobby)
- Manage deck submission flow
- Create and destroy `ServerGame` instances
- Route messages to appropriate game instances
- Broadcast game state updates to players

**Important Classes/Methods**:

```javascript
class GameServer {
  constructor(port)              // Initialize WebSocket server
  setupWebSocketHandlers()       // Set up message routing
  handleMessage(ws, message)     // Process client messages
  handleJoinGame(ws, data)       // Player joins lobby
  handleSubmitDeck(ws, data)     // Player submits deck
  createGame(p1, p2, deck1, deck2) // Create new game
  sendGameStateToPlayers(game)   // Broadcast sanitized state
  endGame(game, winner, reason)  // End game and cleanup
  broadcastToGame(gameId, msg)   // Send message to both players
}
```

**Message Handlers**:
- `join_game` → Assign to lobby
- `submit_deck` → Store deck and start game when both ready
- `player_ready` → Mark player ready
- `card_move` → Validate and execute card moves
- `evolve_pokemon` → Handle evolution requests
- `use_attack` / `attack_action` → Execute attacks
- `use_ability` → Execute abilities
- `play_card` → Play trainer cards
- `end_turn` → End turn and switch active player
- `retreat_action` → Execute retreat

**State Management**:
- `this.games` — Map of gameId → ServerGame instances
- `this.lobbies` — Map of lobbyId → lobby objects
- `this.clients` — Map of WebSocket → client info

---

#### `Server/ServerGame.js` — Authoritative Game Logic

**Purpose**: Implements all game rules, state management, and turn resolution for a single game.

**Key Responsibilities**:
- Maintain authoritative game state for both players
- Validate all player actions against TCG rules
- Execute attacks, abilities, and trainer effects
- Handle evolution, retreat, and knockout logic
- Manage turn phases and turn transitions
- Sanitize game state for per-player views

**Important Classes/Methods**:

```javascript
class ServerGame {
  constructor(p1, p2, gameServer, deck1, deck2)
  
  // Deck Management
  initializeDecks()                     // Create default decks
  initializeWithSubmittedDecks(d1, d2)  // Use player-submitted decks
  shuffleDeck(deck)                     // Fisher-Yates shuffle
  
  // Card Actions
  moveCard(playerNum, from, fromIdx, to, toIdx)
  executeMove(...)                      // Execute validated move
  evolveCard(playerNum, evolIdx, targetLoc, targetIdx)
  executeEvolution(...)                 // Perform evolution
  
  // Combat
  useAttack(playerNum, attackName)      // Execute attack
  useAbility(playerNum, abilityName)    // Execute ability
  checkEnergyRequirements(pokemon, cost)
  
  // Knockout & Prizes
  handleKnockout(player, cardType, idx)
  drawPrizeCards(player, numCards)
  collectDiscardEntries(pokemonCard)    // Decompose evolved Pokemon
  
  // State Management
  getGameStateForPlayer(playerNum)     // Sanitized per-player view
  startTurn()                           // Initialize new turn
  broadcastGameState()                  // Send state to all players
  broadcastKnockout(card, opponent, prizes)
  broadcastCoinFlip(result, player)
}
```

**Game State Structure**:

```javascript
gameState = {
  player1: {
    activePokemon: Card | null,
    bench: [Card | null] × 5,
    hand: [Card],
    deck: [Card],
    discardPile: [Card],
    prizeCards: [Card | null] × 6,
    energyAttachedThisTurn: boolean,
    supporterPlayedThisTurn: boolean,
    stadiumPlayedThisTurn: boolean,
    abilitiesUsedThisTurn: Set<string>
  },
  player2: { /* same structure */ },
  turn: number,
  currentPlayer: 1 | 2,
  phase: 'setup' | 'draw' | 'main' | 'attack' | 'end',
  drewCard: boolean,
  attackedThisTurn: boolean,
  winner: number | null,
  gameLog: [string]
}
```

**Defensive Programming Features**:

1. **Evolution Snapshots**: Before evolution, save player hand to rollback on failure
2. **Trainer Effect Snapshots**: Save full game state before risky trainer effects
3. **Attack Normalization**: Handle both array and object attack structures
4. **Energy Validation**: Strict colorless vs. typed energy checking
5. **Knockout Decomposition**: Properly discard evolution stacks and attached cards

---

### Client Components

#### `Lib/webSocketClient.js` — WebSocket Client

**Purpose**: Lightweight WebSocket wrapper with callback registry.

**Key Features**:
- Auto-detect Codespaces environment
- Automatic reconnection with exponential backoff
- Event-based message handling
- Type-safe message sending

**API**:

```javascript
class WebSocketClient {
  connect(serverUrl)                    // Connect to server
  send(type, data)                      // Send typed message
  on(eventType, callback)               // Register event handler
  off(eventType, callback)              // Unregister handler
  
  // Convenience methods
  joinGame(username)
  sendCardMove(from, fromIdx, to, toIdx, cardData)
  sendAttackAction(attackIdx)
  sendEndTurn()
}
```

---

#### `Lib/guiHookUtils.js` — UI Interaction Layer

**Purpose**: Rich DOM manipulation and drag-and-drop system for card game UI.

**Key Features** (5400+ lines):
- Full drag-and-drop for cards (mouse + touch support)
- Energy attachment validation and UI
- Evolution drag validation
- Card inspection modals
- Discard pile viewer
- Coin flip animations
- Optimistic updates with rollback
- Visual feedback for game state changes

**Important Methods**:

```javascript
class GUIHookUtils {
  // Initialization
  constructor(domElement, wsClient)
  initializeDragAndDrop(container, player, game)
  
  // Drag & Drop
  onMouseDown(e) / onTouchStart(e)
  onMouseMove(e) / onTouchMove(e)
  onMouseUp(e) / onTouchEnd(e)
  canStartDrag(element)
  canAttachEnergy(energyCard, targetCard, targetEl)
  canEvolve(evolutionCard, targetCard)
  
  // Card Actions
  handleLocalEnergyAttachment(energyEl, targetEl)
  handleEvolutionDrop(evolutionCard, targetEl)
  updateGameStateOnDrop(sourceEl, targetEl)
  rollbackLastMove()
  
  // UI Updates
  updateAttachedEnergyDisplay(pokemonEl, cardData)
  updateAttachedTrainersDisplay(pokemonEl, cardData)
  showCardInspectionModal(cardEl, cardData)
  viewDiscardPile(playerType)
  
  // Visual Feedback
  showEnergyAttachmentFeedback(targetEl)
  damageCardElement(cardEl, amount)
  coinFlip()
  showCoinFlip(result)
}
```

**Drag & Drop Rules**:
- Basic Pokémon from hand → empty active/bench slot
- Evolution cards from hand → matching Pokémon on field
- Energy cards from hand → any Pokémon (once per turn)
- Retreat requires manual button (not direct drag)
- Trainer cards → drop anywhere to activate

---

#### `Lib/game.js` — Client Game Controller

**Purpose**: Client-side game state wrapper and synchronization coordinator.

**Key Responsibilities**:
- Store display state received from server
- Coordinate between WebSocket and GUI
- Request card moves through proper channels
- Update UI when server broadcasts changes

**API**:

```javascript
class Game {
  constructor(player1, player2, guiHook)
  start()                                    // Initialize game
  updateFromServerState(serverState)        // Sync with server
  requestCardMove(from, fromIdx, to, toIdx) // Request validated move
}
```

---

### Shared Components

#### `Lib/card.js` — Card Base Classes

**Purpose**: Define card object structure used by both client and server.

**Classes**:

```javascript
class Card {
  constructor(owner) {
    this.id = uuidv4()
    this.cardName = ''
    this.type = ''
    this.hp = 0
    this.maxHp = 0
    this.attacks = {}              // Map: attackName → attack object
    this.abilities = {}            // Map: abilityName → ability object
    this.attachedEnergy = []
    this.attachedTrainers = []
    this.statusConditions = []
    this.evolutionStack = []       // Previous evolution forms
    this.owner = owner
  }
  
  addAttack(name, description, energyCost, callback)
  addAbility(name, description, callback, effectValidator)
  damage(amount, attackingType)
  heal(amount)
}

class Energy extends Card {
  constructor(owner, energyType) {
    super(owner)
    this.type = 'energy'
    this.energyType = energyType
  }
}
```

---

#### `Lib/Cards/Base/Base1/Cards.js` — Card Implementations

**Purpose**: Concrete card classes with attack/ability implementations.

**Structure**:

```javascript
// Card Classes
class Pikachu extends Card { ... }
class Blastoise extends Card { ... }
class Alakazam extends Card { ... }
// ... etc

// Ability Registry (server-side callbacks)
const AbilityRegistry = {
  register(name, serverCallback) { ... },
  getServerCallback(name) { ... }
}

// Server Ability Context
class ServerAbilityContext {
  constructor(gameState, playerNum, socketManager)
  
  // Helper methods for abilities
  drawCards(playerNum, count)
  shuffleDeck(playerNum)
  damageAllOpponentPokemon(damage)
  requestCardSelection(playerNum, cards, options)
}

export default {
  Pikachu, Blastoise, Alakazam, /* ... */
}
export { AbilityRegistry, ServerAbilityContext }
```

**Example Card**:

```javascript
class Pikachu extends Card {
  constructor(owner) {
    super(owner);
    this.cardName = 'Pikachu';
    this.type = 'lightning';
    this.hp = 60;
    this.maxHp = 60;
    
    this.addAttack(
      'Thunder Shock',
      'Flip a coin. If tails, this attack does nothing.',
      ['lightning'],
      async function() {
        const result = await this.owner.guiHook.coinFlip();
        if (result) {
          this.owner.opponent.activePokemon.damage(10, 'lightning');
        }
      }
    );
  }
}
```

---

## Game Flow

### 1. Connection & Lobby

```
Client                          Server
  |                               |
  |--- join_game {username} ----->|
  |                               | [Assign to lobby]
  |<---- joined_lobby ------------|
  |                               | [Wait for 2nd player]
  |<---- game_found ---------------|
  |                               |
```

### 2. Deck Submission

```
Client                          Server
  |                               |
  |<---- submit_deck -------------|  [Request deck]
  | [Show deck builder]           |
  |--- submit_deck {deck} ------->|
  |                               | [Wait for both decks]
  |<---- deck_received ------------|
  |                               |
  |--- player_ready ------------->|
  |                               | [Both ready?]
  |<---- game_start --------------|
  |                               |
```

### 3. Gameplay Loop

```
Client                          Server
  |                               |
  |<---- game_state_update -------|  [Initial state]
  |<---- turn_changed ------------|  [Your turn]
  |                               |
  | [Player drags energy card]    |
  |--- card_move ---------------->|
  |                               | [Validate energy rules]
  |<---- move_success ------------|
  |<---- game_state_update -------|
  |                               |
  | [Player clicks attack button] |
  |--- use_attack {name} -------->|
  |                               | [Execute attack logic]
  |                               | [Check for knockout]
  |<---- attack_used -------------|
  |<---- pokemon_knockout ---------|
  |<---- game_state_update -------|
  |                               |
  | [Player ends turn]            |
  |--- end_turn ----------------->|
  |                               | [Switch active player]
  |<---- turn_changed ------------|
  |                               |
```

### 4. Game End

```
Client                          Server
  |                               |
  |                               | [Last prize drawn]
  |                               | [Call endGame()]
  |<---- game_ended --------------|
  |<---- game_over ----------------|
  | [Show winner modal]           |
  | [Disable all actions]         | [Delete game from map]
  |                               | [Clear client associations]
  |                               |
```

---

## WebSocket Protocol

### Message Format

All messages are JSON with a `type` field:

```javascript
{
  type: 'message_type',
  // ... additional fields
}
```

### Client → Server Messages

| Type | Payload | Description |
|------|---------|-------------|
| `join_game` | `{ username }` | Join matchmaking |
| `submit_deck` | `{ deck: [...] }` | Submit 60-card deck |
| `player_ready` | `{}` | Mark ready to start |
| `card_move` | `{ sourceType, sourceIndex, targetType, targetIndex, cardData }` | Move card |
| `play_card` | `{ cardIndex, cardType, targetSlot, ...extras }` | Play trainer card |
| `evolve_pokemon` | `{ evolutionCardIndex, targetPokemonLocation, targetPokemonIndex }` | Evolve Pokémon |
| `use_attack` | `{ attackName }` | Use attack |
| `use_ability` | `{ abilityName }` | Use ability |
| `end_turn` | `{}` | End current turn |
| `retreat_action` | `{ benchIndex }` | Retreat active Pokémon |
| `card_selection_response` | `{ selectionId, selectedIds, cancelled }` | Response to selection request |

### Server → Client Messages

| Type | Payload | Description |
|------|---------|-------------|
| `joined_lobby` | `{ lobbyId, message }` | Lobby assignment confirmed |
| `game_found` | `{ gameId, playerNumber, opponent }` | Matched with opponent |
| `submit_deck` | `{ message }` | Deck submission request |
| `deck_received` | `{ message }` | Deck accepted |
| `game_start` | `{ message }` | Game starting |
| `game_state_update` | `{ gameState }` | Full sanitized game state |
| `turn_changed` | `{ currentPlayer, turn, message }` | Turn switched |
| `attack_used` | `{ attackName, result }` | Attack executed |
| `ability_used` | `{ abilityName, result }` | Ability executed |
| `evolution_success` | `{ message }` | Evolution succeeded |
| `evolution_error` | `{ message }` | Evolution failed |
| `move_success` | `{ message }` | Move accepted |
| `move_error` | `{ message }` | Move rejected |
| `action_error` | `{ message }` | Action rejected |
| `pokemon_knockout` | `{ knockedOutCard, winner, prizeCardsDrawn }` | Pokémon knocked out |
| `card_selection_request` | `{ selectionId, cards, options }` | Request card selection |
| `coin_flip_show` | `{ result, player }` | Show coin flip result |
| `opponent_disconnected` | `{ message }` | Opponent left |
| `game_ended` | `{ winner, reason }` | Game over (legacy) |
| `game_over` | `{ winner, winnerName, reason, message }` | Game over (full info) |

---

## Getting Started

### Prerequisites

- Node.js 18+ (LTS recommended)
- Modern web browser (Chrome, Firefox, Edge, Safari)
- npm or yarn

### Installation

1. **Clone the repository**:
```bash
git clone https://github.com/MiniKielbyM/monomon.git
cd monomon
```

2. **Install server dependencies**:
```bash
cd Server
npm install
```

3. **Start the server**:
```bash
# From repository root
./start-multiplayer.sh

# Or directly:
node Server/index.js
```

The server will start on port 8080 by default.

4. **Open the client**:

Navigate to `http://localhost:8080/` in your browser, or open `Lib/GUI.Demo/multiplayerTest.html` if using a static file server.

5. **Play the game**:
- Open two browser windows/tabs
- Enter different usernames in each
- Build and submit 60-card decks
- Play!

---

## Development Guide

### Running in Development

```bash
# Install dependencies
cd Server && npm install

# Start server with auto-reload (if nodemon installed)
npm run dev

# Or start normally
node Server/index.js
```

### Project Development Environment

This project is configured for development in **GitHub Codespaces** or **VS Code Dev Containers** running Ubuntu 24.04.2 LTS.

**Available CLI tools**:
- Node.js & npm
- git, gh (GitHub CLI)
- docker, kubectl
- Standard Unix tools (curl, wget, grep, etc.)

### Code Style

- Use ES6+ features (modules, async/await, classes)
- Prefer `const` over `let`, avoid `var`
- Use descriptive variable names
- Comment complex game logic
- Keep functions focused and testable

### Adding New Cards

1. **Define the card class** in `Lib/Cards/Base/Base1/Cards.js`:

```javascript
class Charizard extends Card {
  constructor(owner) {
    super(owner);
    this.cardName = 'Charizard';
    this.pokemon = 'Charizard';
    this.type = 'fire';
    this.hp = 120;
    this.maxHp = 120;
    this.evolvesFrom = 'Charmeleon';
    this.isEvolution = true;
    
    this.addAttack(
      'Fire Spin',
      'Discard 2 Energy cards attached to Charizard.',
      ['fire', 'fire', 'fire', 'fire'],
      async function() {
        this.owner.opponent.activePokemon.damage(100, 'fire');
        // Discard 2 energy logic...
      }
    );
  }
}
```

2. **Export the card**:

```javascript
export default {
  // ... existing cards
  Charizard,
}
```

3. **Add to card data** in `Server/cardData.js`:

```javascript
export const pokemonCards = [
  // ... existing cards
  {
    name: 'Charizard',
    type: 'fire',
    hp: 120,
    evolvesFrom: 'Charmeleon',
    attacks: [
      {
        name: 'Fire Spin',
        energyCost: ['fire', 'fire', 'fire', 'fire'],
        damage: 100,
        description: 'Discard 2 Energy cards attached to Charizard.'
      }
    ]
  }
];
```

### Adding Server-Side Abilities

For abilities that need server control (like Bill drawing cards):

```javascript
// In Cards.js
import { AbilityRegistry, ServerAbilityContext } from './Cards.js';

// Register server callback
AbilityRegistry.register('Bill', async (context) => {
  const player = context.gameState[`player${context.playerNumber}`];
  
  if (player.deck.length < 2) {
    return { success: false, error: 'Not enough cards in deck' };
  }
  
  // Draw 2 cards
  const drawn = player.deck.splice(-2, 2);
  player.hand.push(...drawn);
  
  context.logAction(`Player ${context.playerNumber} used Bill to draw 2 cards`);
  return { success: true, message: 'Drew 2 cards' };
});
```

### Testing

**Manual Testing**:
```bash
# Open two browser windows
# Join with different usernames
# Submit decks and play

# Debug helpers in console:
debugEnergy()      // Check energy attachment state
testKnockout()     // Simulate a knockout
```

**Automated Testing** (if implemented):
```bash
npm test
```

### Debugging Tips

1. **Server-side logging**: Check the server console for detailed logs of game state changes, attack execution, and rule validation.

2. **Client-side inspection**: Use browser DevTools to:
   - Inspect `window.currentGame` object
   - Monitor WebSocket messages in Network tab
   - Check console for UI interaction logs

3. **State validation**: The server logs detailed validation failures. Look for:
   - Energy requirement failures
   - Evolution validation errors
   - Turn/phase validation issues

4. **Rollback debugging**: If moves are being rejected unexpectedly, check:
   - `guiHookUtils.lastMove` for the last attempted move
   - Server console for the specific validation error
   - `move_error` messages in browser console

---

## Card System

### Card Types

1. **Pokémon Cards**
   - Basic Pokémon (can be played directly)
   - Evolution Pokémon (require specific base form)
   - Attacks with energy costs
   - Abilities (Pokémon Powers in Base Set)

2. **Energy Cards**
   - Basic energy types: Fire, Water, Grass, Lightning, Psychic, Fighting, Colorless
   - Can attach one energy per turn (per official rules)

3. **Trainer Cards**
   - Supporters (one per turn)
   - Items/Tools (attach to Pokémon until end of turn)
   - Stadiums (global field effects)

### Attack System

Attacks are defined with:
- **Name**: Display name
- **Energy Cost**: Array of energy types required
- **Callback**: Async function executed when attack is used
- **Description**: Text description for players

**Energy Matching Rules**:
1. Specific types must be matched exactly (e.g., `['fire', 'fire']`)
2. Colorless energy can be satisfied by any type
3. Energy is not consumed when attacking (stays attached)

**Example Attack Implementation**:

```javascript
this.addAttack(
  'Hydro Pump',
  'Does 40 damage plus 10 more damage for each Water Energy attached to Blastoise but not used to pay for this attack.',
  ['water', 'water', 'water'],
  async function() {
    const baseAttacker = this;
    const defender = this.owner.opponent.activePokemon;
    
    // Base damage
    let damage = 40;
    
    // Count extra water energy
    const waterEnergy = this.attachedEnergy.filter(
      e => e.energyType === 'water'
    );
    const extraWater = Math.max(0, waterEnergy.length - 3);
    damage += extraWater * 10;
    
    // Apply damage with weakness/resistance
    defender.damage(damage, 'water');
  }
);
```

### Evolution System

**Rules**:
- Can only evolve during your turn
- Cannot evolve a Pokémon on the same turn it was played
- Cannot evolve on first turn
- Evolution preserves:
  - HP (damage carries over proportionally)
  - Attached energy
  - Status conditions
  - Position (active or bench)
  - Evolution stack (for devolution or tracking)

**Evolution Process**:
1. Client drags evolution card onto target Pokémon
2. Server validates evolution requirements
3. Server creates snapshot of player hand (for rollback)
4. Server attempts evolution
5. On success: Replace Pokémon, preserve state
6. On failure: Restore hand, send error

---

## Ability System

See `Docs/AbilitySystem.md` for detailed documentation.

### Ability Types

1. **Client-Side Abilities**: Simple effects that can run locally (deprecated for security)
2. **Server-Side Abilities**: Complex effects registered in `AbilityRegistry`

### Server Ability Context

The `ServerAbilityContext` provides helpers for common ability operations:

```javascript
class ServerAbilityContext {
  // Game state access
  gameState: object
  playerNumber: number
  socketManager: SocketManager
  
  // Helper methods
  drawCards(playerNum, count)
  shuffleDeck(playerNum)
  damageAllOpponentPokemon(damage)
  healAllPlayerPokemon(amount)
  requestCardSelection(playerNum, cards, options)
  logAction(message)
}
```

### Example: Damage Swap (Alakazam)

```javascript
AbilityRegistry.register('Damage Swap', async (context) => {
  const player = context.gameState[`player${context.playerNumber}`];
  const allPokemon = [player.activePokemon, ...player.bench].filter(p => p);
  
  // Find damaged Pokémon
  const damagedPokemon = allPokemon.filter(p => p.hp < p.maxHp);
  if (damagedPokemon.length === 0) {
    return { success: false, error: 'No damaged Pokémon' };
  }
  
  // Request selection through socket
  const source = await context.requestCardSelection(
    context.playerNumber,
    damagedPokemon,
    { title: 'Select Pokémon to move damage FROM' }
  );
  
  // Move 10 damage...
  
  return { success: true, message: 'Moved damage counters' };
});
```

---

## Troubleshooting

### Connection Issues

**Problem**: "WebSocket connection failed"

**Solutions**:
- Ensure server is running (`node Server/index.js`)
- Check that port 8080 is not blocked by firewall
- For Codespaces: Set port 8080 visibility to "Public" in Ports panel
- Check browser console for specific error codes

---

### Energy Attachment Issues

**Problem**: "Can only attach one energy per turn" error when it should be allowed

**Solutions**:
- Check `player.energyAttachedThisTurn` flag on server
- Verify turn change resets the flag (in `executeEndTurn`)
- Clear the flag manually with `guiHook.resetEnergyAttachmentFlag()` (dev only)

---

### Evolution Problems

**Problem**: "Evolution card not found in hand" after evolution attempt

**Solutions**:
- Check server console for snapshot/rollback messages
- Verify evolution card has `evolvesFrom` field matching target Pokémon's `pokemon` field
- Ensure target Pokémon wasn't just played this turn

---

### Attacks Not Showing

**Problem**: Attack buttons show "0", "1", "2" instead of attack names

**Solutions**:
- Ensure server's `getGameStateForPlayer` normalizes attacks to array format
- Check that card instances have `attacks` as object map, not array
- Verify attack objects have `.name` property

---

### Game Not Ending

**Problem**: Game doesn't end when prize cards reach zero

**Solutions**:
- Verify `drawPrizeCards` calls `gameServer.endGame` when prizes depleted
- Check that `endGame` broadcasts `game_over` message
- Ensure client has `game_over` event listener registered
- Check browser console for modal creation errors

---

### State Desync

**Problem**: Client shows different state than server

**Solutions**:
- Check for `move_error` messages indicating rejected moves
- Verify `rollbackLastMove` is working correctly
- Clear browser cache and reload
- Check server `getGameStateForPlayer` for serialization errors

---

## Contributing

### Bug Reports

When reporting bugs, please include:
- Browser and version
- Server console logs
- Client console logs
- Steps to reproduce
- Expected vs actual behavior

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly (manual testing with 2 clients minimum)
5. Commit with descriptive messages
6. Push to your fork
7. Open a Pull Request

## License

This project is provided as a development example. See repository for specific licensing terms.

---

## Acknowledgements

- Pokémon TCG © Nintendo/Creatures Inc./GAME FREAK inc.
- This is a fan project for educational purposes
- Card images and data from Pokémon TCG API
- Built with Node.js, WebSocket (ws), and vanilla JavaScript

---

## Additional Resources

- [Pokémon TCG Official Rules](https://www.pokemon.com/us/pokemon-tcg/rules/)
- [WebSocket Protocol (RFC 6455)](https://tools.ietf.org/html/rfc6455)
- [ES6 Modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)

---