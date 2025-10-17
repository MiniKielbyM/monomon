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
            playerDiscard: null,
            opponentActive: null,
            opponentBench: [],
            opponentDiscard: null,
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
        this.domElements.playerDiscard = document.querySelector('.card.discard.player');
        this.domElements.opponentActive = document.querySelector('.card.active.opp');
        this.domElements.opponentBench = Array.from(document.querySelectorAll('.bench .card.opp'));
        this.domElements.opponentDiscard = document.querySelector('.card.discard.opp');
    }
    
    // Start the game and initialize GUI
    start() {
        this.isRunning = true;
        document.body.style.backgroundColor = '#4CAF50';
        
        // Initialize drag and drop through GUI hook with game reference
        if (this.domElements.board) {
            this.guiHook.initializeDragAndDrop(this.domElements.board, this.client1, this);
        }
        
        console.log('Client-side game started - waiting for server state');
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
        
        // Update turn-based drag controls (this will reset energy flag when turn starts)
        if (this.guiHook) {
            const isMyTurn = serverState.isYourTurn || false;
            const turnReason = isMyTurn ? 
                'Your turn - you can move cards' : 
                'Opponent\'s turn - wait for your turn';
            
            this.guiHook.setDragEnabled(isMyTurn, turnReason);
        }
        
        // Sync client flags with server state
        if (this.client1 && serverState.yourState) {
            console.log('DEBUG: Syncing client state with server state:', {
                serverEnergyFlag: serverState.yourState.energyAttachedThisTurn,
                clientEnergyFlag: this.client1.attachedEnergyThisTurn,
                turn: serverState.turn,
                isYourTurn: serverState.isYourTurn
            });
            this.client1.attachedEnergyThisTurn = serverState.yourState.energyAttachedThisTurn || false;
            this.client1.hasPlayedSupporterThisTurn = serverState.yourState.supporterPlayedThisTurn || false;
            this.client1.hasPlayedStadiumThisTurn = serverState.yourState.stadiumPlayedThisTurn || false;
            
            // Additional safety check: if it's my turn and server says no energy attached, force reset
            if (serverState.isYourTurn && !serverState.yourState.energyAttachedThisTurn) {
                console.log('DEBUG: My turn + server says no energy attached - forcing client flag to false');
                this.client1.attachedEnergyThisTurn = false;
            }
        }
        
        // Update GUI display
        this.updateGUIState();
    }
    
    // Update the entire GUI to match the current display state
    updateGUIState() {
        // Clean up any orphaned energy displays before updating
        if (this.guiHook && this.guiHook.cleanupOrphanedEnergyDisplays) {
            this.guiHook.cleanupOrphanedEnergyDisplays();
        }
        
        this.updatePlayerGUI();
        this.updateOpponentGUI();
        this.updateHandGUI();
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

        // Update discard pile (show stacked cards effect)
        if (this.domElements.playerDiscard) {
            this.updateDiscardPileVisual(this.domElements.playerDiscard, playerState.discardPile);
        }
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

        // Update opponent discard pile (show stacked cards effect)
        if (this.domElements.opponentDiscard) {
            this.updateDiscardPileVisual(this.domElements.opponentDiscard, opponentState.discardPile);
        }
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
                cardDiv.dataset.handIndex = index;
                
                // Set card data for inspection
                this.setCardVisual(cardDiv, card);
                
                handContainer.appendChild(cardDiv);
            });
        }
    }
    
        // Set a card's visual representation
    setCardVisual(element, card) {
        if (!element || !card) return;
        
        element.style.backgroundImage = `url(${card.imgUrl})`;
        element.classList.remove('empty');
        
        // Store card data directly on the element for inspection
        element._cardData = card;
        element.cardData = card; // Also store without underscore for drag system
        
        // Set card instance if provided
        if (card.cardInstance) {
            this.setCardInstance(element, card.cardInstance);
        }
        
        // Update energy display if the card has attached energy
        if (this.guiHook && this.guiHook.updatePokemonEnergyDisplay) {
            this.guiHook.updatePokemonEnergyDisplay(element);
        }
    }
    
    // Clear a card's visual representation
    clearCardVisual(element) {
        if (!element) return;
        
        // Remove any energy displays from this element
        const energyDisplays = element.querySelectorAll('.attached-energy-display, .energy-display');
        energyDisplays.forEach(display => {
            console.log('🧹 Removing energy display from cleared card slot:', display);
            display.remove();
        });
        
        element.style.backgroundImage = '';
        element.classList.add('empty');
        element.cardData = null;
        element.cardInstance = null; // Clear the card class pointer
    }

    // Update discard pile visual to show stacked cards effect
    updateDiscardPileVisual(element, discardPile) {
        if (!element) return;
        
        if (!discardPile || discardPile.length === 0) {
            // Empty discard pile
            this.clearCardVisual(element);
            element.style.boxShadow = '';
            element.style.border = '';
            return;
        }

        // Show the top card
        const topCard = discardPile[discardPile.length - 1];
        this.setCardVisual(element, topCard);
        
        // Add visual indication of stack depth
        const stackDepth = Math.min(discardPile.length, 5); // Max 5 layers visual
        const shadowLayers = [];
        
        for (let i = 1; i <= stackDepth; i++) {
            const offset = i * 1;
            const blur = i * 0.5;
            shadowLayers.push(`${offset}px ${offset}px ${blur}px rgba(0,0,0,0.3)`);
        }
        
        element.style.boxShadow = shadowLayers.join(', ');
        element.style.border = '2px solid #666';
        
        // Store the full discard pile data for modal viewing
        element.discardPileData = discardPile;
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
        // No local state manipulation needed - everything comes from server
    }
}

export default Game;