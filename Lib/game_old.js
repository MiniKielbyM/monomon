import Client from './client.js';
import GUIHookUtils from './guiHookUtils.js';

// Client-side Game class - purely presentational, no game logic
class Game {
    constructor(client1, client2, guiHook) {
        if (!(client1 instanceof Client)) {
            throw new TypeError('client1 must be an instance of Client');
        }
        if (!(client2 instanceof Client)) {
            throw new TypeError('client2 must be an instance of Client or null');
        }
        if (!(guiHook instanceof GUIHookUtils)) {
            throw new TypeError('guiHook must be an instance of GUIHookUtils');
        }
        
        // Core game components
        this.guiHook = guiHook;
        this.client1 = client1;
        this.client2 = client2;
        
        // Set up client relationships
        this.client1.game = this;
        this.client1.guiHook = this.guiHook;
        this.client1.opponent = client2;
        this.client2.game = this;
        this.client2.guiHook = this.guiHook;
        this.client2.opponent = client1;
        
        // Game state (mirrors server state for display only)
        this.isRunning = false;
        this.serverGameState = null;
        
        // Client-side display state (read-only, updated from server)
        this.displayState = {
            yourState: {
                activePokemon: null,
                bench: Array(5).fill(null),
                hand: [],
                handCount: 0,
                deckCount: 0,
                discardPile: []
            },
            opponentState: {
                activePokemon: null,
                bench: Array(5).fill(null),
                hand: [],
                handCount: 0,
                deckCount: 0,
                discardPile: []
            },
            turn: 1,
            currentPlayer: 1,
            phase: 'setup',
            isYourTurn: false,
            gameLog: []
        };
        
        // DOM element references
        this.domElements = {
            playerActive: null,
            playerBench: [],
            playerHand: null,
            opponentActive: null,
            opponentBench: [],
            board: null
        };
        
        // Initialize DOM references
        this.initializeDOMReferences();
    }
    
    // Initialize DOM element references
    initializeDOMReferences() {
        this.domElements.board = document.getElementById('sixteenbynine');
        this.domElements.playerActive = document.getElementById('ActivePokemon');
        this.domElements.playerHand = document.getElementById('PlayerHand');
        this.domElements.playerBench = Array.from(document.querySelectorAll('.bench .card.player.benched'));
        this.domElements.opponentActive = document.querySelector('.card.active.opp');
        this.domElements.opponentBench = Array.from(document.querySelectorAll('.bench .card.opp'));
    }
    
    // Start the game and initialize GUI
    start() {
        this.isRunning = true;
        document.body.style.backgroundColor = '#4CAF50';
        
        // Initialize drag and drop through GUI hook with game reference
        if (this.domElements.board) {
            this.guiHook.initializeDragAndDrop(this.domElements.board, this.client1, this);
        }
        
        // Don't send initial state - server manages everything now
        console.log('Game started - waiting for server state');
    }
    
    // Update game state from server (purely display update)
    updateFromServerState(serverState) {
        console.log('updateFromServerState called with:', serverState);
        this.serverGameState = serverState;
        
        // Update local display state with server data
        this.displayState = {
            ...serverState,
            // Ensure opponent hand is hidden for security
            opponentState: {
                ...serverState.opponentState,
                hand: [] // Always hide opponent's hand
            }
        };
        
        // Update turn-based drag controls
        if (this.guiHook) {
            const isMyTurn = serverState.isYourTurn || false;
            const turnReason = isMyTurn ? 
                'Your turn - you can move cards' : 
                'Opponent\'s turn - wait for your turn';
            
            this.guiHook.setDragEnabled(isMyTurn, turnReason);
        }
        
        // Update GUI display
        this.updateGUIState();
    }
    
    // Update the entire GUI to match the current display state
    updateGUIState() {
        this.updatePlayerGUI();
        this.updateOpponentGUI();
    }
    
    // Update player's side of the board
    updatePlayerGUI() {
        const playerState = this.displayState.yourState;
        
        if (!playerState) return;
        
        // Update active Pokemon
        if (playerState.activePokemon) {
            this.setCardVisual(this.domElements.playerActive, playerState.activePokemon);
        } else {
            this.clearCardVisual(this.domElements.playerActive);
        }
        
        // Update bench
        if (playerState.bench) {
            playerState.bench.forEach((card, index) => {
                if (this.domElements.playerBench[index]) {
                    if (card) {
                        this.setCardVisual(this.domElements.playerBench[index], card);
                    } else {
                        this.clearCardVisual(this.domElements.playerBench[index]);
                    }
                }
            });
        }
        
        // Update hand
        this.updateHandGUI();
    }
    
    // Update opponent's side of the board
    updateOpponentGUI() {
        const opponentState = this.displayState.opponentState;
        
        if (!opponentState) return;
        
        // Update opponent active Pokemon
        if (opponentState.activePokemon) {
            this.setCardVisual(this.domElements.opponentActive, opponentState.activePokemon);
        } else {
            this.clearCardVisual(this.domElements.opponentActive);
        }
        
        // Update opponent bench
        if (opponentState.bench) {
            opponentState.bench.forEach((card, index) => {
                if (this.domElements.opponentBench[index]) {
                    if (card) {
                        this.setCardVisual(this.domElements.opponentBench[index], card);
                    } else {
                        this.clearCardVisual(this.domElements.opponentBench[index]);
                    }
                }
            });
        }
        
        // Note: Opponent's hand cards are not shown (they remain face-down)
        // Only the hand count might be displayed elsewhere if needed
    }
    
    // Update hand display
    updateHandGUI() {
        const handContainer = this.domElements.playerHand;
        if (!handContainer) return;
        
        // Clear existing hand
        handContainer.innerHTML = '';
        
        // Add each card in hand
        const hand = this.displayState.yourState?.hand;
        if (hand && hand.length > 0) {
            hand.forEach((card, index) => {
                const cardDiv = document.createElement('div');
                cardDiv.classList.add('card', 'player', 'in-hand');
                cardDiv.style.backgroundImage = `url(${card.imgUrl})`;
                handContainer.appendChild(cardDiv);
            });
        }
    }
    
    // Set a card's visual representation
    setCardVisual(element, card) {
        if (!element || !card) return;
        
        element.style.backgroundImage = `url(${card.imgUrl})`;
        element.classList.remove('empty');
        
        // Store both the server card data and the card class instance
        element.cardData = card; // Keep for compatibility
        
        // Convert server card data to actual card class instance and store as direct pointer
        if (this.guiHook && this.guiHook.createCardInstance) {
            const cardInstance = this.guiHook.createCardInstance(card);
            element.cardInstance = cardInstance; // Direct pointer to card class
        }
    }
    
    // Clear a card's visual representation
    clearCardVisual(element) {
        if (!element) return;
        
        element.style.backgroundImage = '';
        element.classList.add('empty');
        element.cardData = null;
        element.cardInstance = null; // Clear the card class pointer
    }
    
    // Set a card class instance directly on a DOM element
    setCardInstance(element, cardInstance) {
        if (!element || !cardInstance) return;
        
        element.style.backgroundImage = `url(${cardInstance.imgUrl})`;
        element.classList.remove('empty');
        
        // Set the direct card class instance pointer
        element.cardInstance = cardInstance;
        
        // Also set cardData for compatibility (server data format)
        element.cardData = {
            cardName: cardInstance.cardName,
            type: cardInstance.type,
            hp: cardInstance.hp,
            health: cardInstance.health,
            imgUrl: cardInstance.imgUrl,
            statusConditions: cardInstance.statusConditions || []
        };
    }

    // Send card move request to server (no local game logic)
    requestCardMove(fromType, fromIndex, toType, toIndex) {
        if (!this.guiHook.isMultiplayer || !this.guiHook.webSocketClient) {
            console.warn('Cannot move cards: Not in multiplayer mode');
            return;
        }
        
        // Get card data for the move request
        const playerState = this.displayState.yourState;
        let cardData = null;
        
        if (fromType === 'hand' && playerState.hand[fromIndex]) {
            cardData = playerState.hand[fromIndex];
        } else if (fromType === 'bench' && playerState.bench[fromIndex]) {
            cardData = playerState.bench[fromIndex];
        } else if (fromType === 'active' && playerState.activePokemon) {
            cardData = playerState.activePokemon;
        }
        
        if (cardData) {
            // Send move request to server for validation and execution
            this.guiHook.webSocketClient.sendCardMove(
                fromType,
                fromIndex,
                toType,
                toIndex,
                cardData
            );
        }
    }

    // Handle server's response to opponent moves (display only)
    handleOpponentMove(sourceType, sourceIndex, targetType, targetIndex, cardData) {
        console.log('Opponent move received:', { sourceType, sourceIndex, targetType, targetIndex, cardData });
        // The server will send updated game state, so we just wait for that
        // No local state manipulation needed
    }
}
            playerState.bench[fromIndex] = null;
        } else if (fromType === 'active') {
            card = playerState.activePokemon;
            playerState.activePokemon = null;
        }
        
        if (!card) return false;
        
        // Add to target
        if (toType === 'active') {
            playerState.activePokemon = card;
        } else if (toType === 'bench') {
            playerState.bench[toIndex] = card;
        }
        
        // Update client state to match
        this.syncClientState();
        
        // Update GUI
        this.updateGUIState();
        
        return true;
    }
    
    // Handle opponent moves (from server)
    handleOpponentMove(sourceType, sourceIndex, targetType, targetIndex, cardData) {
        const opponentState = this.boardState.player2;
        
        // Remove from source
        if (sourceType === 'active') {
            opponentState.activePokemon = null;
        } else if (sourceType === 'bench') {
            opponentState.bench[sourceIndex] = null;
        }
        
        // Add to target
        if (targetType === 'active') {
            opponentState.activePokemon = cardData;
        } else if (targetType === 'bench') {
            opponentState.bench[targetIndex] = cardData;
        }
        
        // Update GUI
        this.updateOpponentGUI();
    }
    
    // Synchronize client objects with game state
    syncClientState() {
        const playerState = this.boardState.player1;
        
        this.client1.activePokemon = playerState.activePokemon;
        this.client1.bench = playerState.bench.filter(card => card !== null);
        this.client1.hand = [...playerState.hand];
    }
    
    // Set up initial game state
    setupInitialState(player1Cards, player2Cards = []) {
        // Set up player 1 hand
        if (player1Cards.length > 0) {
            this.boardState.player1.hand = [...player1Cards];
        }
        
        // Set up player 2 (opponent) - start with empty field
        if (player2Cards.length > 0) {
            this.boardState.player2.hand = [...player2Cards];
        }
        
        // Clear any existing field cards
        this.boardState.player1.activePokemon = null;
        this.boardState.player1.bench = Array(5).fill(null);
        this.boardState.player2.activePokemon = null;
        this.boardState.player2.bench = Array(5).fill(null);
        
        // Sync client state
        this.syncClientState();
        
        // Update GUI
        this.updateGUIState();
    }
    
    // Get current game state for serialization
    getGameState() {
        return {
            isRunning: this.isRunning,
            turn: this.turn,
            currentPlayer: this.currentPlayer === this.client1 ? 1 : 2,
            boardState: this.boardState
        };
    }
    
    // Load game state from serialized data
    loadGameState(state) {
        this.isRunning = state.isRunning;
        this.turn = state.turn;
        this.currentPlayer = state.currentPlayer === 1 ? this.client1 : this.client2;
        this.boardState = state.boardState;
        
        this.syncClientState();
        this.updateGUIState();
    }
}

export default Game;