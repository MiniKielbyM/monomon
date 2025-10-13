// Enhanced Card Inspection System v2.2 - Updated to use card extension classes
import { Card } from "./card.js";
import enums from "./enums.js";
import CardsBase1 from "./Cards/Base/Base1/Cards.js";
import Pikachu from "./cardTest.js";
import Client from "./client.js";
import Deck from "./deck.js";

const { PokemonType, CardModifiers, AbilityEventListeners } = enums;
const { Alakazam, Blastoise } = CardsBase1;

class GUIHookUtils {
    constructor(domElement, webSocketClient = null) {
        this.domElement = domElement;
        this.dragging = null;
        this.currentDropTarget = null;
        this.container = null;
        this.webSocketClient = webSocketClient;
        this.isMultiplayer = webSocketClient !== null;
        this.playerNumber = null;
        this.game = null; // Reference to the Game instance
        this.isMyTurn = true; // Track if it's this player's turn
        this.dragEnabled = true; // Can be disabled during opponent's turn
        
        // Store last move for potential rollback
        this.lastMove = null;
        
        // Card factory mapping
        this.cardClasses = {
            'Alakazam': Alakazam,
            'Blastoise': Blastoise,
            'Pikachu': Pikachu
        };
    }

    // Convert server card data to actual card class instance
    createCardInstance(serverCardData, owner = null) {
        if (!serverCardData || !serverCardData.cardName) {
            return null;
        }
        
        // Energy cards don't need card class instances - they're simple data objects
        if (serverCardData.type === 'energy') {
            return serverCardData; // Return the energy card data as-is
        }
        
        const CardClass = this.cardClasses[serverCardData.cardName];
        if (!CardClass) {
            console.warn(`No card class found for: ${serverCardData.cardName}`);
            return null;
        }
        
        // Get a proper owner (Client instance) for the card
        if (!owner) {
            // Try to get owner from the game instance
            if (this.game && this.game.client1) {
                owner = this.game.client1;
            } else {
                // Create a minimal inspection client
                try {
                    const inspectionDeck = new Deck('inspection');
                    owner = new Client('inspection', inspectionDeck);
                } catch (error) {
                    console.error('Could not create inspection client:', error);
                    return null;
                }
            }
        }
        
        try {
            const cardInstance = new CardClass(owner);
            
            // Update the card instance with server state data
            if (serverCardData.health !== undefined) {
                cardInstance.health = serverCardData.health;
            }
            if (serverCardData.statusConditions) {
                cardInstance.statusConditions = [...serverCardData.statusConditions];
            }
            
            return cardInstance;
        } catch (error) {
            console.error(`Error creating card instance for ${serverCardData.cardName}:`, error);
            return null;
        }
    }

    // Helper method to set a card class instance directly on a DOM element
    setCardInstance(element, cardInstance) {
        if (!element || !cardInstance) return;
        
        element.cardInstance = cardInstance;
        
        // Also set cardData for compatibility (using server-like data format)
        element.cardData = {
            cardName: cardInstance.cardName,
            type: cardInstance.type,
            hp: cardInstance.hp,
            health: cardInstance.health,
            imgUrl: cardInstance.imgUrl,
            statusConditions: cardInstance.statusConditions || []
        };
        
        console.log('Set card instance on element:', {
            cardName: cardInstance.cardName,
            attacks: Object.keys(cardInstance.attacks || {}),
            abilities: Object.keys(cardInstance.abilities || {})
        });
    }

    // Initialize drag and drop system
    initializeDragAndDrop(container, player1, game = null) {
        this.container = container;
        this.player1 = player1;
        this.game = game; // Store game reference
        
        // Set player number from WebSocket client if available
        if (this.webSocketClient) {
            this.playerNumber = this.webSocketClient.playerNumber;
        }
        
        // Ensure container is positioned
        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        // Set up event listeners (mouse and touch for mobile support)
        document.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));
        document.addEventListener('mouseleave', (e) => this.onMouseLeave(e));
        
        // Touch events for mobile support
        document.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        document.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        document.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
        
        // Set up discard pile viewing functionality
        this.setupDiscardPileViewing();
        
        // Set up WebSocket event listeners if multiplayer
        if (this.isMultiplayer) {
            this.setupMultiplayerEventListeners();
        }
    }

    // Enable or disable drag functionality
    setDragEnabled(enabled, reason = '') {
        this.dragEnabled = enabled;
        this.isMyTurn = enabled;
        
        // Update cursor and tooltip, but don't dim cards
        const playerCards = document.querySelectorAll('.card.player:not(.empty)');
        playerCards.forEach(card => {
            if (enabled) {
                card.style.cursor = 'grab';
                card.title = 'Click and drag to move, or click to inspect';
            } else {
                card.style.cursor = 'pointer';
                card.title = 'Click to inspect card (Cannot move during opponent\'s turn)';
            }
        });
        
        console.log(`Drag ${enabled ? 'enabled' : 'disabled'}: ${reason}`);
    }

    // Set up discard pile viewing functionality
    setupDiscardPileViewing() {
        // Player's discard pile
        const playerDiscardPile = document.querySelector('.card.discard.player');
        if (playerDiscardPile) {
            playerDiscardPile.style.cursor = 'pointer';
            playerDiscardPile.title = 'Click to view discard pile';
            playerDiscardPile.addEventListener('click', (e) => {
                e.stopPropagation();
                this.viewDiscardPile('player');
            });
        }

        // Opponent's discard pile  
        const opponentDiscardPile = document.querySelector('.card.discard.opp');
        if (opponentDiscardPile) {
            opponentDiscardPile.style.cursor = 'pointer';
            opponentDiscardPile.title = 'Click to view opponent\'s discard pile';
            opponentDiscardPile.addEventListener('click', (e) => {
                e.stopPropagation();
                this.viewDiscardPile('opponent');
            });
        }
    }

    // Check if dragging should be allowed
    canStartDrag(element) {
        // Check if drag is globally enabled
        if (!this.dragEnabled) {
            console.log('Drag disabled - not your turn');
            return false;
        }
        
        // Check if it's a player's card (not opponent's)
        if (!element.classList.contains('player')) {
            console.log('Cannot drag opponent cards');
            return false;
        }
        
        // Check if the card slot is not empty
        if (element.classList.contains('empty')) {
            console.log('Cannot drag empty slots');
            return false;
        }

        // Prevent dragging from discard pile
        if (element.classList.contains('discard')) {
            console.log('Cannot drag cards from discard pile');
            return false;
        }
        
        return true;
    }

    // Show visual feedback when drag is not allowed
    showTurnErrorFeedback(cardEl) {
        // Get the card data and show the inspection modal
        const cardData = this.getCardDataFromElement(cardEl);
        if (cardData) {
            this.showCardInspectionModal(cardEl, cardData);
        }
        
        // Show message if it's not their turn
        if (!this.dragEnabled && window.showGameMessage) {
            window.showGameMessage('Not your turn to move cards, but you can inspect them!', 2000);
        }
    }

    // Create drag element with proper scaling
    makeDragEl(cardEl, cardRect, containerRect) {
        // Detect scale from transform matrix (if any)
        const style = window.getComputedStyle(cardEl);
        const transform = style.transform;
        let scale = 1;
        if (transform && transform !== 'none') {
            const match = transform.match(/matrix\(([^,]+)/); // first number in matrix() is scaleX
            if (match) scale = parseFloat(match[1]) || 1;
        }

        // Create the drag element at *normal* size
        const drag = document.createElement('div');
        drag.id = 'dragCard';
        Object.assign(drag.style, {
            position: 'absolute',
            width: `${cardRect.width / scale}px`,
            height: `${cardRect.height / scale}px`,
            left: `${cardRect.left - containerRect.left}px`,
            top: `${cardRect.top - containerRect.top}px`,
            backgroundImage: style.backgroundImage || 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            pointerEvents: 'none',
            zIndex: '9999',
            borderRadius: '6px',
            transform: 'none' // ensure no scale carries over
        });
        return drag;
    }

    // Handle mouse down events for drag start
    onMouseDown(e) {
        console.log('onMouseDown triggered', e.target);
        
        // Look for any card (player or opponent) for inspection
        const cardEl = e.target.closest('.card');
        if (!cardEl || cardEl.classList.contains('empty')) {
            console.log('No valid card element found');
            return;
        }

        // Exclude discard pile from normal card inspection (it has its own click handler)
        if (cardEl.classList.contains('discard')) {
            console.log('Discard pile clicked - using dedicated discard pile handler');
            return;
        }
        
        e.preventDefault();
        console.log('Mouse down on card:', cardEl);
        
        // Check if this is a player's own card (only these can be dragged)
        const isPlayerCard = cardEl.classList.contains('player');
        const isOpponentCard = cardEl.classList.contains('opp');
        
        console.log('Card type:', isPlayerCard ? 'player' : isOpponentCard ? 'opponent' : 'unknown');
        
        // Store initial mouse position and time for click vs drag detection
        this.mouseDownInfo = {
            startX: e.clientX,
            startY: e.clientY,
            startTime: Date.now(),
            cardEl: cardEl,
            isPlayerCard: isPlayerCard
        };
        
        // Get card data for inspection
        const cardData = this.getCardDataFromElement(cardEl);
        
        // Only prepare drag for player's own cards
        if (isPlayerCard) {
            // Start drag preparation but don't create drag element yet
            const containerRect = this.container.getBoundingClientRect();
            const cardRect = cardEl.getBoundingClientRect();
            const offsetX = e.clientX - cardRect.left;
            const offsetY = e.clientY - cardRect.top;

            this.dragPrepared = { 
                cardEl, 
                containerRect, 
                cardRect, 
                offsetX, 
                offsetY,
                cardData,
                mouseDownInfo: this.mouseDownInfo
            };
            
            console.log('Drag prepared for player card:', cardData?.name || 'Unknown');
        } else {
            // For opponent cards, only store for inspection (no drag preparation)
            this.inspectionPrepared = {
                cardEl,
                cardData,
                mouseDownInfo: this.mouseDownInfo
            };
            
            console.log('Inspection prepared for opponent card:', cardData?.name || 'Unknown');
        }
    }

    // Handle mouse move events for drag movement
    onMouseMove(e) {
        // Only process drag movement for player cards
        if (this.dragPrepared && !this.dragging) {
            const { mouseDownInfo } = this.dragPrepared;
            const moveDistance = Math.sqrt(
                Math.pow(e.clientX - mouseDownInfo.startX, 2) + 
                Math.pow(e.clientY - mouseDownInfo.startY, 2)
            );
            
            console.log('Mouse move distance:', moveDistance);
            
            // Start drag if moved more than 5 pixels and it's a player card
            if (moveDistance > 5 && mouseDownInfo.isPlayerCard) {
                console.log('Starting drag due to movement threshold');
                // Check turn validation before starting actual drag
                if (!this.canStartDrag(this.dragPrepared.cardEl)) {
                    this.showTurnErrorFeedback(this.dragPrepared.cardEl);
                    this.dragPrepared = null;
                    this.inspectionPrepared = null;
                    return;
                }
                
                // Start the actual drag
                const { cardEl, containerRect, cardRect, offsetX, offsetY } = this.dragPrepared;
                const dragEl = this.makeDragEl(cardEl, cardRect, containerRect);
                this.container.appendChild(dragEl);
                this.dragging = { cardEl, dragEl, offsetX, offsetY };
                this.dragging.cardEl.style.backgroundImage = '';
                this.dragging.cardEl.classList.add('empty');
                this.dragPrepared = null;
                this.inspectionPrepared = null;
            }
        }
        
        if (!this.dragging) return;
        
        const { dragEl, offsetX, offsetY } = this.dragging;
        const containerRect = this.container.getBoundingClientRect();
        dragEl.style.left = `${e.clientX - containerRect.left - offsetX}px`;
        dragEl.style.top = `${e.clientY - containerRect.top - offsetY}px`;

        // Collision detection and highlighting
        const dragRect = dragEl.getBoundingClientRect();
        this.currentDropTarget = null;
        
        // Get the card data to determine if it's an energy card
        const draggedCardData = this.getCardDataFromElement(this.dragging.cardEl);
        const isEnergyCard = draggedCardData && draggedCardData.type === 'energy';
        
        if (isEnergyCard) {
            // For energy cards, check collision with Pokemon (both empty and occupied slots)
            document.querySelectorAll('.card.player:not(.discard):not(.hand .card)').forEach(slot => {
                const s = slot.getBoundingClientRect();
                const colliding = !(
                    dragRect.right < s.left ||
                    dragRect.left > s.right ||
                    dragRect.bottom < s.top ||
                    dragRect.top > s.bottom
                );
                
                // Only highlight Pokemon slots (active/bench) that have Pokemon in them - not empty slots
                const isPokemonSlot = (slot.classList.contains('active') || slot.classList.contains('benched')) && 
                                     !slot.classList.contains('empty');
                
                if (isPokemonSlot) {
                    if (colliding) {
                        this.currentDropTarget = slot;
                        this.currentDropTarget.dropType = 'attach'; // Mark as energy attachment
                    }
                }
            });
        } else {
            // For non-energy cards, check regular empty slots
            document.querySelectorAll('.card.player.empty').forEach(slot => {
                const s = slot.getBoundingClientRect();
                const colliding = !(
                    dragRect.right < s.left ||
                    dragRect.left > s.right ||
                    dragRect.bottom < s.top ||
                    dragRect.top > s.bottom
                );
                if (colliding) this.currentDropTarget = slot;
            });
        }

        // Special handling for discard pile - always accepts cards
        const discardPile = document.querySelector('.card.discard.player');
        if (discardPile) {
            const s = discardPile.getBoundingClientRect();
            const colliding = !(
                dragRect.right < s.left ||
                dragRect.left > s.right ||
                dragRect.bottom < s.top ||
                dragRect.top > s.bottom
            );
            if (colliding) {
                this.currentDropTarget = discardPile;
                this.currentDropTarget.dropType = 'discard'; // Mark as discard
            }
        }
    }

    // Handle mouse up events for drag end or click detection
    onMouseUp(e) {
        console.log('onMouseUp triggered', this.dragPrepared, this.inspectionPrepared, this.dragging);
        
        // Handle click detection for player cards (if drag was prepared but never started)
        if (this.dragPrepared && !this.dragging) {
            console.log('Detected click on player card:', this.dragPrepared.cardData?.name);
            this.showCardInspectionModal(this.dragPrepared.cardEl, this.dragPrepared.cardData);
            this.dragPrepared = null;
            this.inspectionPrepared = null;
            return;
        }

        // Handle click detection for opponent cards (inspection only)
        if (this.inspectionPrepared && !this.dragging) {
            console.log('Detected click on opponent card:', this.inspectionPrepared.cardData?.name);
            this.showCardInspectionModal(this.inspectionPrepared.cardEl, this.inspectionPrepared.cardData);
            this.dragPrepared = null;
            this.inspectionPrepared = null;
            return;
        }

        // If no preparation states but no dragging, just clean up
        if (!this.dragging) {
            this.dragPrepared = null;
            this.inspectionPrepared = null;
            return;
        }

        console.log('Completing drag operation');

        // Handle completed drag operation
        if (this.currentDropTarget) {
            // Store move information for potential rollback BEFORE making any changes
            this.lastMove = {
                sourceEl: this.dragging.cardEl,
                targetEl: this.currentDropTarget,
                sourceBackground: window.getComputedStyle(this.dragging.dragEl).backgroundImage,
                sourceWasEmpty: this.dragging.cardEl.classList.contains('empty'),
                targetWasEmpty: this.currentDropTarget.classList.contains('empty'),
                moveType: this.currentDropTarget.dropType || 'normal',
                cardData: this.dragging.cardEl.cardData
            };
            
            console.log('Storing move for rollback BEFORE changes:', {
                sourceWasEmpty: this.lastMove.sourceWasEmpty,
                sourceHasEmpty: this.dragging.cardEl.classList.contains('empty'),
                sourceClasses: Array.from(this.dragging.cardEl.classList),
                hasCardData: !!this.lastMove.cardData
            });
            
            // Check if this is energy attachment
            if (this.currentDropTarget.dropType === 'attach') {
                // Energy attachment - don't change the visual of the target Pokemon
                // The energy will be shown as attached energy icons/counters
                this.updateGameStateOnDrop(this.dragging.cardEl, this.currentDropTarget);
                
                // Visual feedback for energy attachment
                this.showEnergyAttachmentFeedback(this.currentDropTarget);
            } else {
                // Regular card placement
                this.currentDropTarget.style.backgroundImage = window.getComputedStyle(this.dragging.dragEl).backgroundImage;
                this.currentDropTarget.classList.remove('empty');
                
                // Update game state
                this.updateGameStateOnDrop(this.dragging.cardEl, this.currentDropTarget);
            }
        } else {
            // Return to origin - no rollback needed since move wasn't attempted
            this.dragging.cardEl.style.backgroundImage = window.getComputedStyle(this.dragging.dragEl).backgroundImage;
            this.dragging.cardEl.classList.remove('empty');
            this.lastMove = null; // Clear any stored move
        }

        // Cleanup
        if (this.dragging.dragEl) this.dragging.dragEl.remove();
        this.dragging = null;
        this.dragPrepared = null;
        this.inspectionPrepared = null;
        this.currentDropTarget = null;
    }

    // Handle mouse leave events to prevent stuck cards
    onMouseLeave(e) {
        // If mouse leaves the document and we have a prepared drag or inspection, clean up
        if (this.dragPrepared || this.inspectionPrepared) {
            console.log('Mouse left document, cleaning up prepared states');
            this.dragPrepared = null;
            this.inspectionPrepared = null;
        }
        
        // If dragging when mouse leaves, treat it as a drop failure
        if (this.dragging) {
            console.log('Mouse left document during drag, returning card to origin');
            // Return to origin
            this.dragging.cardEl.style.backgroundImage = window.getComputedStyle(this.dragging.dragEl).backgroundImage;
            this.dragging.cardEl.classList.remove('empty');
            
            // Cleanup
            if (this.dragging.dragEl) this.dragging.dragEl.remove();
            this.dragging = null;
            this.currentDropTarget = null;
        }
    }

    // Touch event handlers for mobile support
    onTouchStart(e) {
        e.preventDefault(); // Prevent scrolling/zooming on touch
        if (e.touches.length === 1) { // Only handle single finger touches
            const touch = e.touches[0];
            
            // Find the actual target element under the touch point
            const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
            
            // Create a synthetic mouse event
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY,
                bubbles: true,
                cancelable: true
            });
            
            // Set the target manually for better compatibility
            Object.defineProperty(mouseEvent, 'target', {
                value: targetElement || e.target,
                enumerable: true
            });
            
            console.log('Touch start on:', targetElement || e.target);
            this.onMouseDown(mouseEvent);
        }
    }

    onTouchMove(e) {
        e.preventDefault(); // Prevent scrolling during drag
        if (e.touches.length === 1 && this.dragging) {
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.onMouseMove(mouseEvent);
        }
    }

    onTouchEnd(e) {
        e.preventDefault();
        if (this.dragging) {
            // Use the last known touch position from changedTouches
            const touch = e.changedTouches[0];
            let mouseEvent;
            
            if (touch) {
                // Find the element under the touch end point for proper drop detection
                const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
                
                mouseEvent = new MouseEvent('mouseup', {
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                    bubbles: true,
                    cancelable: true
                });
                
                // Set target for drop detection
                Object.defineProperty(mouseEvent, 'target', {
                    value: targetElement,
                    enumerable: true
                });
                
                console.log('Touch end on:', targetElement);
            } else {
                // Fallback for when touch info is not available
                mouseEvent = new MouseEvent('mouseup', {
                    clientX: 0,
                    clientY: 0
                });
            }
            
            this.onMouseUp(mouseEvent);
        }
    }

    // Update game state when card is successfully dropped
    updateGameStateOnDrop(sourceEl, targetEl) {
        // If we have a game instance, use its centralized move system
        if (this.game) {
            const moveData = this.determineMoveData(sourceEl, targetEl);
            if (moveData) {
                this.game.requestCardMove(moveData.fromType, moveData.fromIndex, moveData.toType, moveData.toIndex);
            }
            return;
        }
        
        // Fallback to old system if no game reference
        this.legacyUpdateGameState(sourceEl, targetEl);
    }
    
    // Determine move data from DOM elements
    determineMoveData(sourceEl, targetEl) {
        let fromType = '';
        let fromIndex = -1;
        let toType = '';
        let toIndex = -1;
        
        // Determine source
        const handCards = Array.from(document.querySelectorAll('#PlayerHand .card'));
        const benchCards = Array.from(document.querySelectorAll('.bench .card.player.benched'));
        
        const handIndex = handCards.indexOf(sourceEl);
        if (handIndex !== -1) {
            fromType = 'hand';
            fromIndex = handIndex;
        }
        
        const benchIndex = benchCards.indexOf(sourceEl);
        if (benchIndex !== -1) {
            fromType = 'bench';
            fromIndex = benchIndex;
        }
        
        if (sourceEl.id === 'ActivePokemon') {
            fromType = 'active';
            fromIndex = 0;
        }
        
        // Determine target
        if (targetEl.dropType === 'attach') {
            // Energy attachment to Pokemon
            toType = 'attach';
            if (targetEl.id === 'ActivePokemon') {
                toIndex = 'active';
            } else {
                const targetBenchIndex = benchCards.indexOf(targetEl);
                if (targetBenchIndex !== -1) {
                    toIndex = targetBenchIndex;
                }
            }
        } else if (targetEl.id === 'ActivePokemon') {
            toType = 'active';
            toIndex = 0;
        } else if (targetEl.classList.contains('discard') && targetEl.classList.contains('player')) {
            toType = 'discard';
            toIndex = 0; // Discard pile only has one slot
        } else {
            const targetBenchIndex = benchCards.indexOf(targetEl);
            if (targetBenchIndex !== -1) {
                toType = 'bench';
                toIndex = targetBenchIndex;
            }
        }
        
        if (fromType && toType) {
            return { fromType, fromIndex, toType, toIndex };
        }
        
        return null;
    }
    
    // Legacy update system (kept for backward compatibility)
    legacyUpdateGameState(sourceEl, targetEl) {
        // Find source card data
        let sourceCard = null;
        let sourceType = '';
        let sourceIndex = -1;

        // Check if source is from hand
        const handCards = Array.from(document.querySelectorAll('#PlayerHand .card'));
        const handIndex = handCards.indexOf(sourceEl);
        if (handIndex !== -1) {
            sourceCard = this.player1.hand[handIndex];
            sourceType = 'hand';
            sourceIndex = handIndex;
        }

        // Check if source is from bench
        const benchCards = Array.from(document.querySelectorAll('.bench .card.player.benched'));
        const benchIndex = benchCards.indexOf(sourceEl);
        if (benchIndex !== -1) {
            sourceCard = this.player1.bench[benchIndex];
            sourceType = 'bench';
            sourceIndex = benchIndex;
        }

        // Check if source is active Pokemon
        if (sourceEl.id === 'ActivePokemon') {
            sourceCard = this.player1.activePokemon;
            sourceType = 'active';
            sourceIndex = 0;
        }

        if (!sourceCard) return;

        // Determine target and update game state
        let targetType = '';
        let targetIndex = -1;
        
        if (targetEl.id === 'ActivePokemon') {
            // Moving to active position
            this.player1.activePokemon = sourceCard;
            targetType = 'active';
            targetIndex = 0;
            this.removeCardFromSource(sourceType, sourceIndex);
        } else {
            // Moving to bench position
            const targetBenchIndex = benchCards.indexOf(targetEl);
            if (targetBenchIndex !== -1) {
                this.player1.bench[targetBenchIndex] = sourceCard;
                targetType = 'bench';
                targetIndex = targetBenchIndex;
                this.removeCardFromSource(sourceType, sourceIndex);
            }
        }

        // Send move to server if multiplayer
        if (this.isMultiplayer && this.webSocketClient && sourceCard) {
            const cardData = {
                cardName: sourceCard.cardName,
                imgUrl: sourceCard.imgUrl,
                type: sourceCard.type,
                hp: sourceCard.hp,
                health: sourceCard.health
            };
            
            this.webSocketClient.sendCardMove(sourceType, sourceIndex, targetType, targetIndex, cardData);
        }

        console.log(`Moved ${sourceCard.cardName} from ${sourceType} to new position`);
    }

    // Remove card from its source location
    removeCardFromSource(sourceType, sourceIndex) {
        switch (sourceType) {
            case 'hand':
                this.player1.hand.splice(sourceIndex, 1);
                // Also remove the DOM element from the hand
                const handCards = Array.from(document.querySelectorAll('#PlayerHand .card'));
                if (handCards[sourceIndex]) {
                    handCards[sourceIndex].remove();
                }
                break;
            case 'bench':
                this.player1.bench[sourceIndex] = null;
                break;
            case 'active':
                this.player1.activePokemon = null;
                break;
        }
    }

    damageCardElement(cardElement, amount) {
        cardElement.classList.add('shake');
        setTimeout(() => {
            cardElement.classList.remove('shake');
        }, 500);
    }
    healCardElement(cardElement, amount) {
        // animate heal
    }
    evolveCardElement(cardElement, newCard) {
        // animate evolve
    }
    attachCardElement(cardElement, toolCard) {
        // animate attach tool
    }
    detachCardElement(cardElement, toolCard) {
        // animate detach tool
    }
    showMessage(message) {
        // show message to user
    }
    promptUser(prompt, options) {
        // prompt user for input
    }
    coinFlip() {
        // animate coin flip
    }
    playCard(cardElement, location) {
        // animate play card
    }
    discardCard(cardElement) {
        // animate discard card
    }
    shuffleDeck(deckElement) {
        // animate shuffle deck
    }
    drawCard(deckElement, handElement) {
        // animate draw card
    }
    revealCard(cardElement) {
        // animate reveal card
    }
    hideCard(cardElement) {
        // animate hide card
    }
    moveCard(cardElement, toLocation) {
        // animate move card
    }
    swapCardLocations(cardElement1, cardElement2) {
        // animate swap card locations
    }

    // View discard pile contents
    viewDiscardPile(playerType) {
        let discardPile = [];
        let title = '';
        
        if (this.game && this.game.displayState) {
            // Get discard pile from current game display state
            if (playerType === 'player') {
                discardPile = this.game.displayState.yourState?.discardPile || [];
                title = 'Your Discard Pile';
            } else {
                discardPile = this.game.displayState.opponentState?.discardPile || [];
                title = 'Opponent\'s Discard Pile';
            }
        }

        this.showDiscardPileModal(discardPile, title);
    }

    // Show discard pile in a modal
    showDiscardPileModal(cards, title) {
        // Store data for potential back navigation
        this.lastDiscardPileData = { cards: [...cards], title };
        
        // Remove any existing modal
        const existingModal = document.getElementById('discard-pile-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // Create modal
        const modal = document.createElement('div');
        modal.id = 'discard-pile-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 3000;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white;
            border-radius: 10px;
            padding: 20px;
            max-width: 95vw;
            max-height: 95vh;
            overflow-y: auto;
            position: relative;
        `;

        const modalTitle = document.createElement('h2');
        modalTitle.textContent = `${title} (${cards.length} cards)`;
        modalTitle.style.cssText = `
            margin: 0 0 20px 0;
            text-align: center;
            color: #333;
        `;

        const cardGrid = document.createElement('div');
        cardGrid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
            gap: 15px;
            max-height: 60vh;
            overflow-y: auto;
            padding: 10px;
        `;

        // Add cards to grid (in reverse order so newest is first)
        if (cards.length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.textContent = 'No cards in discard pile';
            emptyMessage.style.cssText = `
                text-align: center;
                color: #666;
                font-size: 16px;
                padding: 40px;
            `;
            modalContent.appendChild(emptyMessage);
        } else {
            const reversedCards = [...cards].reverse(); // Show newest first
            reversedCards.forEach((card, index) => {
                const cardElement = this.createDiscardCardElement(card, cards.length - index);
                cardGrid.appendChild(cardElement);
            });
        }

        // Close button
        const closeButton = document.createElement('button');
        closeButton.textContent = 'Close';
        closeButton.style.cssText = `
            margin: 20px auto 0;
            display: block;
            padding: 10px 20px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
        `;
        closeButton.onclick = () => modal.remove();

        modalContent.appendChild(modalTitle);
        if (cards.length > 0) {
            modalContent.appendChild(cardGrid);
        }
        modalContent.appendChild(closeButton);
        modal.appendChild(modalContent);

        // Close modal when clicking outside
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        };

        document.body.appendChild(modal);
    }

    // Create a card element for discard pile viewing (non-draggable)
    createDiscardCardElement(card, cardNumber) {
        const cardContainer = document.createElement('div');
        cardContainer.style.cssText = `
            position: relative;
            cursor: pointer;
        `;

        const cardElement = document.createElement('div');
        cardElement.style.cssText = `
            width: 120px;
            height: 168px;
            background-size: cover;
            background-position: center;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
            border: 2px solid #ddd;
        `;

        // Set background image based on card
        if (card.cardImageUrl) {
            cardElement.style.backgroundImage = `url(${card.cardImageUrl})`;
        } else if (card.imgUrl) {
            cardElement.style.backgroundImage = `url(${card.imgUrl})`;
        } else if (card.cardName) {
            // Fallback to name-based image lookup
            const imagePath = `/Cards/Base/Base Set/${card.cardName.replace(/\s+/g, '_')}.png`;
            cardElement.style.backgroundImage = `url(${imagePath})`;
        }

        // Add card number indicator if provided
        if (cardNumber) {
            const numberBadge = document.createElement('div');
            numberBadge.textContent = `#${cardNumber}`;
            numberBadge.style.cssText = `
                position: absolute;
                top: -8px;
                right: -8px;
                background: #007bff;
                color: white;
                border-radius: 50%;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 10px;
                font-weight: bold;
                z-index: 1;
            `;
            cardContainer.appendChild(numberBadge);
        }

        // Add card name overlay
        const nameOverlay = document.createElement('div');
        nameOverlay.textContent = card.cardName || 'Unknown Card';
        nameOverlay.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            background: linear-gradient(transparent, rgba(0,0,0,0.8));
            color: white;
            padding: 8px 4px 4px;
            font-size: 10px;
            font-weight: bold;
            text-align: center;
            border-radius: 0 0 6px 6px;
            opacity: 0;
            transition: opacity 0.2s;
        `;

        // Add hover effects
        cardContainer.onmouseenter = () => {
            cardElement.style.transform = 'scale(1.05) translateY(-2px)';
            cardElement.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4)';
            nameOverlay.style.opacity = '1';
        };
        cardContainer.onmouseleave = () => {
            cardElement.style.transform = 'scale(1)';
            cardElement.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
            nameOverlay.style.opacity = '0';
        };

        // Remove click handler - cards in discard are view-only
        cardContainer.style.cursor = 'default';
        cardContainer.title = card.cardName || 'Unknown Card';

        cardContainer.appendChild(cardElement);
        cardContainer.appendChild(nameOverlay);
        cardContainer.title = `${card.cardName || 'Unknown Card'} - Click to view details`;

        return cardContainer;
    }

    // Enhanced card modal methods removed - now using normal showCardInspectionModal

    // Note: reopenDiscardPileModal removed since we now use normal card modals

    selectFromCards(cardElements) {
        if (cardElements.length === 0) {
            return null;
        }
        const overlay = document.createElement('div');
        overlay.classList.add('Overlay', 'SelectOverlay');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '1000';
        this.domElement.appendChild(overlay);
        return new Promise((resolve) => {
            for (const cardElement of cardElements) {
                const cardClone = document.createElement('div');
                cardClone.className = 'Card';
                cardClone.style.backgroundImage = `url(${cardElement.imgUrl})`;
                cardClone.addEventListener('click', () => {
                    this.domElement.removeChild(overlay);
                    resolve(cardElement);
                });
                overlay.appendChild(cardClone);
            }
        });
    }
    takePrizeCard(prizeElement, handElement) {
        // animate take prize card
    }
    returnPrizeCard(handElement, prizeElement) {
        // animate return prize card
    }
    endTurn() {
        // animate end turn
    }
    startTurn() {
        // animate start turn
    }
    endGame(winner) {
        // animate end game
    }
    drawGame() {
        // animate draw game
    }
    KOCard(cardElement) {
        // animate KO card
    }
    resetGame() {
        // animate reset game
    }
    showAllActions(cardElement, disabledActions) {
        // show all possible actions for a card
    }

    // Set up WebSocket event listeners for multiplayer
    setupMultiplayerEventListeners() {
        if (!this.webSocketClient) return;
        
        this.webSocketClient.on('opponent_card_move', (data) => {
            this.handleOpponentCardMove(data);
        });
        
        this.webSocketClient.on('opponent_state_update', (data) => {
            this.handleOpponentStateUpdate(data);
        });
        
        this.webSocketClient.on('move_confirmed', (data) => {
            console.log('Move confirmed by server');
        });
        
        this.webSocketClient.on('opponent_disconnected', (data) => {
            this.showMessage(data.message || 'Your opponent has disconnected');
        });
        
        this.webSocketClient.on('initial_opponent_state', (data) => {
            if (this.game) {
                this.game.handleInitialOpponentState(data.opponentState);
            }
        });
    }

    // Handle opponent's card moves
    handleOpponentCardMove(data) {
        const { playerNumber, sourceType, sourceIndex, targetType, targetIndex, cardData } = data;
        
        // Determine if this is from the opponent (opposite player number)
        const isOpponentMove = playerNumber !== this.playerNumber;
        if (!isOpponentMove) return;
        
        // Use game's centralized system if available
        if (this.game) {
            this.game.handleOpponentMove(sourceType, sourceIndex, targetType, targetIndex, cardData);
        } else {
            // Fallback to direct visual update
            this.updateOpponentVisuals(sourceType, sourceIndex, targetType, targetIndex, cardData);
        }
        
        console.log(`Opponent moved ${cardData.cardName} from ${sourceType} to ${targetType}`);
    }

    // Update visual representation of opponent's moves
    updateOpponentVisuals(sourceType, sourceIndex, targetType, targetIndex, cardData) {
        // Remove from source position (opponent side)
        if (sourceType === 'active') {
            const oppActiveSlot = document.querySelector('.card.active.opp');
            if (oppActiveSlot) {
                oppActiveSlot.style.backgroundImage = '';
                oppActiveSlot.classList.add('empty');
            }
        } else if (sourceType === 'bench') {
            const oppBenchSlots = document.querySelectorAll('.bench .card.opp');
            if (oppBenchSlots[sourceIndex]) {
                oppBenchSlots[sourceIndex].style.backgroundImage = '';
                oppBenchSlots[sourceIndex].classList.add('empty');
            }
        }
        
        // Add to target position (opponent side)
        if (targetType === 'active') {
            const oppActiveSlot = document.querySelector('.card.active.opp');
            if (oppActiveSlot) {
                oppActiveSlot.style.backgroundImage = `url(${cardData.imgUrl})`;
                oppActiveSlot.classList.remove('empty');
            }
        } else if (targetType === 'bench') {
            const oppBenchSlots = document.querySelectorAll('.bench .card.opp');
            if (oppBenchSlots[targetIndex]) {
                oppBenchSlots[targetIndex].style.backgroundImage = `url(${cardData.imgUrl})`;
                oppBenchSlots[targetIndex].classList.remove('empty');
            }
        }
    }

    // Extract card data from a DOM element
    getCardDataFromElement(cardEl) {
        if (!cardEl) return null;
        
        // First priority: Check for direct card class instance pointer
        if (cardEl.cardInstance) {
            console.log('DEBUG: Found direct card class instance:', cardEl.cardInstance);
            return this.extractDataFromCardInstance(cardEl.cardInstance);
        }
        
        // Second priority: Try to get card data from the cardData property and convert it
        if (cardEl.cardData || cardEl._cardData) {
            const card = cardEl.cardData || cardEl._cardData;
            console.log('DEBUG: Found card data, attempting conversion:', card);
            
            // Check if it's already a card class instance
            if (card.constructor.name !== 'Object' && card.attacks && card.abilities) {
                // It's already a card class instance, extract data directly
                return this.extractDataFromCardInstance(card);
            } else {
                // It's server card data, convert to card instance first
                const cardInstance = this.createCardInstance(card);
                if (cardInstance) {
                    return this.extractDataFromCardInstance(cardInstance);
                }
            }
        }
        
        // Third priority: Try to get card data from background image URL (for opponent cards)
        const bgImage = window.getComputedStyle(cardEl).backgroundImage;
        const urlMatch = bgImage.match(/url\("?([^"]*)"?\)/);
        
        if (urlMatch && urlMatch[1]) {
            const imgUrl = urlMatch[1];
            console.log('DEBUG: Fallback to URL lookup for:', imgUrl);
            
            // Try to determine card name from URL and create instance
            const cardName = this.getCardNameFromUrl(imgUrl);
            if (cardName && this.cardClasses[cardName]) {
                const cardInstance = this.createCardInstance({ cardName, imgUrl });
                if (cardInstance) {
                    return this.extractDataFromCardInstance(cardInstance);
                }
            }
            
            // Ultimate fallback to hardcoded data
            const enhancedData = this.getEnhancedCardDataByUrl(imgUrl);
            return {
                name: enhancedData.name || 'Unknown Card',
                imgUrl: imgUrl,
                type: enhancedData.type || 'pokemon',
                ...enhancedData
            };
        }
        
        // Final fallback to placeholder data
        return {
            name: 'Unknown Card',
            imgUrl: '/Lib/blank_card.png',
            type: 'pokemon',
            hp: null,
            pokemonType: null,
            attacks: [],
            abilities: [],
            weakness: null,
            resistance: null,
            retreatCost: 0
        };
    }

    // Extract display data from a card class instance
    extractDataFromCardInstance(card) {
        // Handle energy cards (simple data objects)
        if (card.type === 'energy') {
            return {
                name: card.cardName || card.name || 'Unknown Energy',
                imgUrl: card.imgUrl,
                type: 'energy',
                energyType: card.energyType,
                hp: null,
                health: null,
                pokemonType: null,
                attacks: [],
                abilities: [],
                weakness: null,
                resistance: null,
                retreatCost: 0,
                statusConditions: []
            };
        }
        
        // Handle Pokemon cards (card class instances)
        const attacks = [];
        if (card.attacks && typeof card.attacks === 'object') {
            // Convert attacks object to array format
            for (const [attackName, attackData] of Object.entries(card.attacks)) {
                attacks.push({
                    name: attackName,
                    description: attackData.description,
                    cost: attackData.cost || [],
                    damage: this.extractDamageFromDescription(attackData.description)
                });
            }
        }
        
        const abilities = [];
        if (card.abilities && typeof card.abilities === 'object') {
            // Convert abilities object to array format
            for (const [abilityName, abilityData] of Object.entries(card.abilities)) {
                abilities.push({
                    name: abilityName,
                    description: abilityData.description,
                    type: abilityData.event || 'passive'
                });
            }
        }
        
        return {
            name: card.cardName || card.pokemon || 'Unknown Card',
            imgUrl: card.imgUrl,
            type: 'pokemon',
            hp: card.hp,
            health: card.health,
            pokemonType: card.type,
            attacks: attacks,
            abilities: abilities,
            weakness: card.weakness,
            resistance: card.resistance,
            retreatCost: card.retreatCost,
            evolvesFrom: card.evolvesFrom,
            canEvolve: card.canEvolve,
            statusConditions: card.statusConditions || []
        };
    }

    // Extract card name from URL pattern
    getCardNameFromUrl(imgUrl) {
        const urlMappings = {
            'base1/1_hires.png': 'Alakazam',
            'base1/2_hires.png': 'Blastoise',
            'base4/87_hires.png': 'Pikachu',
            'base1/58_hires.png': 'Pikachu'  // Alternative Pikachu URL
        };
        
        for (const [urlPattern, cardName] of Object.entries(urlMappings)) {
            if (imgUrl.includes(urlPattern)) {
                return cardName;
            }
        }
        
        return null;
    }

    // Helper function to extract damage from attack descriptions
    extractDamageFromDescription(description) {
        if (!description) return null;
        
        // Look for damage patterns like "30 damage", "does 40 damage", "40 plus", etc.
        const damagePatterns = [
            /does (\d+) damage/i,
            /(\d+) damage/i,
            /(\d+) plus/i,
            /(\d+)\s*$/i  // number at end of description
        ];
        
        for (const pattern of damagePatterns) {
            const match = description.match(pattern);
            if (match && match[1]) {
                return parseInt(match[1]);
            }
        }
        
        return null;
    }

    // Get enhanced card data based on image URL mapping
    getEnhancedCardDataByUrl(imgUrl) {
        // Map Pokemon TCG image URLs to card data
        const urlToCardData = {
            // Base Set 1 cards
            'https://images.pokemontcg.io/base1/1_hires.png': {
                name: 'Alakazam',
                type: 'pokemon',
                hp: 80,
                pokemonType: 'psychic',
                attacks: [
                    {
                        name: 'Confuse Ray',
                        cost: ['psychic', 'psychic', 'psychic'],
                        damage: '30',
                        description: 'Flip a coin. If heads, the Defending Pokémon is now Confused.'
                    }
                ],
                abilities: [
                    {
                        name: 'Damage Swap',
                        description: 'As often as you like during your turn (before your attack), you may move 1 damage counter from 1 of your Pokémon to another as long as you don\'t Knock Out that Pokémon. This power can\'t be used if Alakazam is Asleep, Confused, or Paralyzed.'
                    }
                ],
                weakness: 'psychic',
                resistance: null,
                retreatCost: 3
            },
            'https://images.pokemontcg.io/base1/2_hires.png': {
                name: 'Blastoise',
                type: 'pokemon',
                hp: 100,
                pokemonType: 'water',
                attacks: [
                    {
                        name: 'Hydro Pump',
                        cost: ['water', 'water', 'water'],
                        damage: '40+',
                        description: 'Does 40 damage plus 10 more damage for each Water Energy attached to Blastoise but not used to pay for this attack\'s Energy cost.'
                    }
                ],
                abilities: [
                    {
                        name: 'Rain Dance',
                        description: 'As often as you like during your turn (before your attack), you may attach 1 Water Energy card from your hand to 1 of your Water Pokémon. This power can\'t be used if Blastoise is Asleep, Confused, or Paralyzed.'
                    }
                ],
                weakness: 'lightning',
                resistance: null,
                retreatCost: 3
            },
            'https://images.pokemontcg.io/base1/4_hires.png': {
                name: 'Charizard',
                type: 'pokemon',
                hp: 120,
                pokemonType: 'fire',
                attacks: [
                    {
                        name: 'Fire Spin',
                        cost: ['fire', 'fire', 'fire', 'fire'],
                        damage: '100',
                        description: 'Discard 2 Energy cards attached to Charizard in order to use this attack.'
                    }
                ],
                abilities: [],
                weakness: 'water',
                resistance: 'fighting',
                retreatCost: 3
            },
            'https://images.pokemontcg.io/base1/58_hires.png': {
                name: 'Pikachu',
                type: 'pokemon',
                hp: 60,
                pokemonType: 'lightning',
                attacks: [
                    {
                        name: 'Gnaw',
                        cost: ['colorless'],
                        damage: '10',
                        description: ''
                    },
                    {
                        name: 'Thunder Jolt',
                        cost: ['lightning', 'colorless'],
                        damage: '30',
                        description: 'Flip a coin. If tails, Pikachu does 10 damage to itself.'
                    }
                ],
                abilities: [],
                weakness: 'fighting',
                resistance: null,
                retreatCost: 1
            },
            // Trainer cards
            'https://images.pokemontcg.io/base1/78_hires.png': {
                name: 'Bill',
                type: 'trainer',
                hp: null,
                pokemonType: null,
                attacks: [],
                abilities: [],
                weakness: null,
                resistance: null,
                retreatCost: 0,
                trainerEffect: 'Draw 2 cards.'
            },
            'https://images.pokemontcg.io/base1/88_hires.png': {
                name: 'Professor Oak',
                type: 'trainer',
                hp: null,
                pokemonType: null,
                attacks: [],
                abilities: [],
                weakness: null,
                resistance: null,
                retreatCost: 0,
                trainerEffect: 'Discard your hand, then draw 7 cards.'
            },
            // Energy cards
            'https://images.pokemontcg.io/base1/98_hires.png': {
                name: 'Fire Energy',
                type: 'energy',
                hp: null,
                pokemonType: 'fire',
                attacks: [],
                abilities: [],
                weakness: null,
                resistance: null,
                retreatCost: 0,
                energyType: 'fire'
            },
            'https://images.pokemontcg.io/base1/102_hires.png': {
                name: 'Water Energy',
                type: 'energy',
                hp: null,
                pokemonType: 'water',
                attacks: [],
                abilities: [],
                weakness: null,
                resistance: null,
                retreatCost: 0,
                energyType: 'water'
            },
            'https://images.pokemontcg.io/base1/100_hires.png': {
                name: 'Lightning Energy',
                type: 'energy',
                hp: null,
                pokemonType: 'lightning',
                attacks: [],
                abilities: [],
                weakness: null,
                resistance: null,
                retreatCost: 0,
                energyType: 'lightning'
            }
        };

        // Check for exact URL match first
        if (urlToCardData[imgUrl]) {
            console.log('DEBUG: Found exact URL match for:', imgUrl);
            return urlToCardData[imgUrl];
        }

        // If no exact match, try to extract card ID from URL pattern
        const urlPattern = /images\.pokemontcg\.io\/([^\/]+)\/(\d+)_hires\.png/;
        const match = imgUrl.match(urlPattern);
        
        if (match) {
            const set = match[1];
            const cardNumber = match[2];
            console.log('DEBUG: Extracted set:', set, 'card number:', cardNumber);
            
            // Try to find by pattern
            const patternUrl = `https://images.pokemontcg.io/${set}/${cardNumber}_hires.png`;
            if (urlToCardData[patternUrl]) {
                return urlToCardData[patternUrl];
            }
        }

        // Fallback for unknown cards
        console.log('DEBUG: No card data found for URL:', imgUrl);
        return {
            name: 'Unknown Card',
            type: 'pokemon',
            hp: null,
            pokemonType: null,
            attacks: [],
            abilities: [],
            weakness: null,
            resistance: null,
            retreatCost: 0
        };
    }

    // Determine card type from name or URL
    determineCardType(cardName, imgUrl) {
        const name = cardName.toLowerCase();
        const url = imgUrl.toLowerCase();
        
        // Energy cards
        if (name.includes('energy') || url.includes('energy')) {
            return 'energy';
        }
        
        // Trainer cards (common trainer card names)
        const trainerKeywords = ['professor', 'bill', 'computer_search', 'defender', 'energy_removal', 
                                'energy_retrieval', 'full_heal', 'gust_of_wind', 'item_finder', 
                                'maintenance', 'pluspower', 'pokedex', 'pokemon_breeder', 'pokemon_center',
                                'pokemon_flute', 'pokemon_trader', 'potion', 'super_potion', 'lass'];
        
        if (trainerKeywords.some(keyword => name.includes(keyword) || url.includes(keyword))) {
            return 'trainer';
        }
        
        // Default to pokemon
        return 'pokemon';
    }

    // Show card inspection modal with detailed information
    showCardInspectionModal(cardEl, cardData) {
        // Safety check - if no card data provided, try to get it from the element
        if (!cardData) {
            cardData = this.getCardDataFromElement(cardEl);
        }
        
        // If still no card data, show a simple message and return
        if (!cardData) {
            console.warn('No card data available for inspection modal');
            if (window.showGameMessage) {
                window.showGameMessage('Card information not available', 2000);
            }
            return;
        }
        
        console.log('NEW ENHANCED MODAL - Card data:', cardData);
        
        // Create modal overlay
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'card-inspection-modal-overlay';
        modalOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            backdrop-filter: blur(5px);
        `;

        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.className = 'card-inspection-modal-content';
        modalContent.style.cssText = `
            background: white;
            border-radius: 15px;
            padding: 20px;
            max-width: 90vw;
            max-height: 90vh;
            display: flex;
            gap: 20px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            position: relative;
            overflow-y: auto;
        `;

        // Card image section
        const cardImageSection = document.createElement('div');
        cardImageSection.style.cssText = `
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const cardImage = document.createElement('img');
        cardImage.src = cardData.imgUrl;
        cardImage.style.cssText = `
            width: 300px;
            height: auto;
            border-radius: 10px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
        `;
        cardImageSection.appendChild(cardImage);

        // Information section
        const infoSection = document.createElement('div');
        infoSection.style.cssText = `
            flex: 1;
            min-width: 300px;
        `;

        // Card name and basic info
        const cardHeader = document.createElement('div');
        cardHeader.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #ddd;
        `;

        const cardName = document.createElement('h2');
        cardName.textContent = cardData.name || cardData.cardName || 'Unknown Card';
        cardName.style.cssText = `
            margin: 0;
            color: #333;
            font-size: 24px;
        `;

        // HP and type info
        const cardInfo = document.createElement('div');
        cardInfo.style.cssText = `
            display: flex;
            align-items: center;
            gap: 10px;
        `;

        if (cardData.hp) {
            const hpDisplay = document.createElement('span');
            hpDisplay.textContent = `HP ${cardData.hp}`;
            hpDisplay.style.cssText = `
                background: #ff4444;
                color: white;
                padding: 4px 8px;
                border-radius: 12px;
                font-weight: bold;
                font-size: 14px;
            `;
            cardInfo.appendChild(hpDisplay);
        }

        if (cardData.pokemonType) {
            const typeIcon = this.createEnergyIcon(cardData.pokemonType);
            cardInfo.appendChild(typeIcon);
        }

        cardHeader.appendChild(cardName);
        cardHeader.appendChild(cardInfo);
        infoSection.appendChild(cardHeader);

        // Attacks section (for Pokémon cards)
        if (cardData.attacks && cardData.attacks.length > 0) {
            const attacksSection = document.createElement('div');
            attacksSection.innerHTML = '<h3 style="color: #555; margin: 15px 0 10px 0;">Attacks:</h3>';
            
            cardData.attacks.forEach(attack => {
                const attackDiv = document.createElement('div');
                attackDiv.style.cssText = `
                    padding: 12px;
                    margin: 8px 0;
                    background: #f8f9fa;
                    border: 1px solid #dee2e6;
                    border-radius: 8px;
                `;

                // Attack header with name, cost, and damage
                const attackHeader = document.createElement('div');
                attackHeader.style.cssText = `
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                `;

                const attackNameCost = document.createElement('div');
                attackNameCost.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 8px;
                `;

                const attackNameEl = document.createElement('strong');
                attackNameEl.textContent = attack.name;
                attackNameEl.style.cssText = 'color: #333; font-size: 16px;';
                attackNameCost.appendChild(attackNameEl);

                // Energy cost icons
                if (attack.cost && attack.cost.length > 0) {
                    const costContainer = document.createElement('div');
                    costContainer.style.cssText = `
                        display: flex;
                        gap: 2px;
                        margin-left: 8px;
                    `;
                    
                    attack.cost.forEach(energyType => {
                        const energyIcon = this.createEnergyIcon(energyType, 20);
                        costContainer.appendChild(energyIcon);
                    });
                    
                    attackNameCost.appendChild(costContainer);
                }

                // Damage
                if (attack.damage) {
                    const damageEl = document.createElement('span');
                    damageEl.textContent = attack.damage;
                    damageEl.style.cssText = `
                        background: #dc3545;
                        color: white;
                        padding: 2px 8px;
                        border-radius: 12px;
                        font-weight: bold;
                        font-size: 14px;
                    `;
                    attackHeader.appendChild(damageEl);
                }

                attackHeader.appendChild(attackNameCost);
                attackDiv.appendChild(attackHeader);

                // Attack description
                if (attack.description) {
                    const descEl = document.createElement('div');
                    descEl.textContent = attack.description;
                    descEl.style.cssText = `
                        color: #666;
                        font-size: 14px;
                        line-height: 1.4;
                        font-style: italic;
                    `;
                    attackDiv.appendChild(descEl);
                }

                attacksSection.appendChild(attackDiv);
            });
            
            infoSection.appendChild(attacksSection);
        }

        // Abilities section
        if (cardData.abilities && cardData.abilities.length > 0) {
            const abilitiesSection = document.createElement('div');
            abilitiesSection.innerHTML = '<h3 style="color: #555; margin: 15px 0 10px 0;">Abilities:</h3>';
            
            cardData.abilities.forEach(ability => {
                const abilityDiv = document.createElement('div');
                abilityDiv.style.cssText = `
                    padding: 12px;
                    margin: 8px 0;
                    background: #e8f4fd;
                    border: 1px solid #b3d4fc;
                    border-radius: 8px;
                `;

                const abilityName = document.createElement('strong');
                abilityName.textContent = ability.name;
                abilityName.style.cssText = `
                    color: #0066cc;
                    font-size: 16px;
                    display: block;
                    margin-bottom: 6px;
                `;
                abilityDiv.appendChild(abilityName);

                const abilityDesc = document.createElement('div');
                abilityDesc.textContent = ability.description;
                abilityDesc.style.cssText = `
                    color: #333;
                    font-size: 14px;
                    line-height: 1.4;
                `;
                abilityDiv.appendChild(abilityDesc);

                abilitiesSection.appendChild(abilityDiv);
            });
            
            infoSection.appendChild(abilitiesSection);
        }

        // Trainer card effect
        if (cardData.trainerEffect) {
            const trainerSection = document.createElement('div');
            trainerSection.innerHTML = '<h3 style="color: #555; margin: 15px 0 10px 0;">Trainer Effect:</h3>';
            
            const effectDiv = document.createElement('div');
            effectDiv.style.cssText = `
                padding: 12px;
                margin: 8px 0;
                background: #fff3cd;
                border: 1px solid #ffeaa7;
                border-radius: 8px;
                color: #333;
                font-size: 14px;
                line-height: 1.4;
            `;
            effectDiv.textContent = cardData.trainerEffect;
            
            trainerSection.appendChild(effectDiv);
            infoSection.appendChild(trainerSection);
        }

        // Weakness, Resistance, Retreat Cost section
        if (cardData.hp) { // Only for Pokémon cards
            const statsSection = document.createElement('div');
            statsSection.innerHTML = '<h3 style="color: #555; margin: 15px 0 10px 0;">Card Stats:</h3>';
            
            const statsContainer = document.createElement('div');
            statsContainer.style.cssText = `
                display: flex;
                gap: 15px;
                flex-wrap: wrap;
                padding: 12px;
                background: #f8f9fa;
                border-radius: 8px;
                border: 1px solid #dee2e6;
            `;

            // Weakness
            const weaknessDiv = document.createElement('div');
            weaknessDiv.style.cssText = `
                display: flex;
                align-items: center;
                gap: 5px;
            `;
            const weaknessLabel = document.createElement('span');
            weaknessLabel.textContent = 'Weakness:';
            weaknessLabel.style.cssText = 'font-weight: bold; color: #dc3545;';
            weaknessDiv.appendChild(weaknessLabel);
            
            if (cardData.weakness) {
                const weaknessIcon = this.createEnergyIcon(cardData.weakness, 20);
                weaknessIcon.style.filter = 'drop-shadow(0 0 3px rgba(220, 53, 69, 0.5))';
                weaknessDiv.appendChild(weaknessIcon);
                const multiplier = document.createElement('span');
                multiplier.textContent = '×2';
                multiplier.style.cssText = 'color: #dc3545; font-weight: bold; margin-left: 2px;';
                weaknessDiv.appendChild(multiplier);
            } else {
                const noneText = document.createElement('span');
                noneText.textContent = 'None';
                noneText.style.cssText = 'color: #666; font-style: italic;';
                weaknessDiv.appendChild(noneText);
            }
            statsContainer.appendChild(weaknessDiv);

            // Resistance
            const resistanceDiv = document.createElement('div');
            resistanceDiv.style.cssText = `
                display: flex;
                align-items: center;
                gap: 5px;
            `;
            const resistanceLabel = document.createElement('span');
            resistanceLabel.textContent = 'Resistance:';
            resistanceLabel.style.cssText = 'font-weight: bold; color: #28a745;';
            resistanceDiv.appendChild(resistanceLabel);
            
            if (cardData.resistance) {
                const resistanceIcon = this.createEnergyIcon(cardData.resistance, 20);
                resistanceIcon.style.filter = 'drop-shadow(0 0 3px rgba(40, 167, 69, 0.5))';
                resistanceDiv.appendChild(resistanceIcon);
                const reduction = document.createElement('span');
                reduction.textContent = '-30';
                reduction.style.cssText = 'color: #28a745; font-weight: bold; margin-left: 2px;';
                resistanceDiv.appendChild(reduction);
            } else {
                const noneText = document.createElement('span');
                noneText.textContent = 'None';
                noneText.style.cssText = 'color: #666; font-style: italic;';
                resistanceDiv.appendChild(noneText);
            }
            statsContainer.appendChild(resistanceDiv);

            // Retreat Cost
            const retreatDiv = document.createElement('div');
            retreatDiv.style.cssText = `
                display: flex;
                align-items: center;
                gap: 5px;
            `;
            const retreatLabel = document.createElement('span');
            retreatLabel.textContent = 'Retreat Cost:';
            retreatLabel.style.cssText = 'font-weight: bold; color: #6c757d;';
            retreatDiv.appendChild(retreatLabel);
            
            if (cardData.retreatCost > 0) {
                for (let i = 0; i < cardData.retreatCost; i++) {
                    const retreatIcon = this.createEnergyIcon('colorless', 20);
                    retreatIcon.style.cssText += 'margin-left: 2px;';
                    retreatDiv.appendChild(retreatIcon);
                }
            } else {
                const freeText = document.createElement('span');
                freeText.textContent = 'Free';
                freeText.style.cssText = 'color: #28a745; font-weight: bold;';
                retreatDiv.appendChild(freeText);
            }
            statsContainer.appendChild(retreatDiv);

            statsSection.appendChild(statsContainer);
            infoSection.appendChild(statsSection);
        }

        // Status Conditions section (for active card objects)
        if (cardData.statusConditions && cardData.statusConditions.length > 0) {
            const statusSection = document.createElement('div');
            statusSection.innerHTML = '<h3 style="color: #555; margin: 15px 0 10px 0;">Status Conditions:</h3>';
            
            const statusContainer = document.createElement('div');
            statusContainer.style.cssText = `
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
                padding: 12px;
                background: #fff3cd;
                border-radius: 8px;
                border: 1px solid #ffeaa7;
            `;
            
            cardData.statusConditions.forEach(status => {
                const statusBadge = document.createElement('span');
                statusBadge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
                statusBadge.style.cssText = `
                    background: #dc3545;
                    color: white;
                    padding: 4px 8px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: bold;
                `;
                statusContainer.appendChild(statusBadge);
            });
            
            statusSection.appendChild(statusContainer);
            infoSection.appendChild(statusSection);
        }

        // Evolution section
        if (cardData.evolvesFrom || cardData.canEvolve !== undefined) {
            const evolutionSection = document.createElement('div');
            evolutionSection.innerHTML = '<h3 style="color: #555; margin: 15px 0 10px 0;">Evolution:</h3>';
            
            const evolutionContainer = document.createElement('div');
            evolutionContainer.style.cssText = `
                padding: 12px;
                background: #e8f5e8;
                border-radius: 8px;
                border: 1px solid #c3e6c3;
            `;
            
            if (cardData.evolvesFrom) {
                const evolvesFromEl = document.createElement('div');
                evolvesFromEl.innerHTML = `<strong>Evolves from:</strong> ${cardData.evolvesFrom}`;
                evolvesFromEl.style.cssText = 'color: #333; margin-bottom: 5px;';
                evolutionContainer.appendChild(evolvesFromEl);
            }
            
            if (cardData.canEvolve !== undefined) {
                const canEvolveEl = document.createElement('div');
                canEvolveEl.innerHTML = `<strong>Can evolve:</strong> ${cardData.canEvolve ? 'Yes' : 'No'}`;
                canEvolveEl.style.cssText = 'color: #333;';
                evolutionContainer.appendChild(canEvolveEl);
            }
            
            evolutionSection.appendChild(evolutionContainer);
            infoSection.appendChild(evolutionSection);
        }

        // Current Health section (if different from max HP)
        if (cardData.health !== undefined && cardData.hp && cardData.health !== cardData.hp) {
            const healthSection = document.createElement('div');
            healthSection.innerHTML = '<h3 style="color: #555; margin: 15px 0 10px 0;">Current Status:</h3>';
            
            const healthContainer = document.createElement('div');
            healthContainer.style.cssText = `
                padding: 12px;
                background: #f8d7da;
                border-radius: 8px;
                border: 1px solid #f5c6cb;
            `;
            
            const healthEl = document.createElement('div');
            const damageAmount = cardData.hp - cardData.health;
            healthEl.innerHTML = `<strong>Damage:</strong> ${damageAmount} damage (${cardData.health}/${cardData.hp} HP remaining)`;
            healthEl.style.cssText = 'color: #721c24; font-size: 14px;';
            healthContainer.appendChild(healthEl);
            
            healthSection.appendChild(healthContainer);
            infoSection.appendChild(healthSection);
        }

        // Removed complex actions section for discard pile cards

        // Close button
        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.style.cssText = `
            position: absolute;
            top: 15px;
            right: 20px;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            border: none;
            border-radius: 50%;
            font-size: 24px;
            cursor: pointer;
            line-height: 1;
            padding: 8px;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10;
            transition: background-color 0.2s;
        `;
        
        // Add hover effect
        closeButton.onmouseover = () => {
            closeButton.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
        };
        closeButton.onmouseout = () => {
            closeButton.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        };
        
        closeButton.onclick = () => this.closeInspectionModal();

        // Assemble modal
        modalContent.appendChild(cardImageSection);
        modalContent.appendChild(infoSection);
        modalContent.appendChild(closeButton);
        modalOverlay.appendChild(modalContent);

        // Add to page
        document.body.appendChild(modalOverlay);
        this.currentInspectionModal = modalOverlay;

        // Click outside to close
        modalOverlay.onclick = (e) => {
            if (e.target === modalOverlay) {
                this.closeInspectionModal();
            }
        };

        // Escape key to close
        document.addEventListener('keydown', this.inspectionModalKeyHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeInspectionModal();
            }
        });
    }

    // Close the inspection modal
    closeInspectionModal() {
        if (this.currentInspectionModal) {
            this.currentInspectionModal.remove();
            this.currentInspectionModal = null;
        }
        if (this.inspectionModalKeyHandler) {
            document.removeEventListener('keydown', this.inspectionModalKeyHandler);
            this.inspectionModalKeyHandler = null;
        }
    }

    // Get available actions for a card based on its position and game state
    getAvailableActionsForCard(cardEl, cardData) {
        const actions = [];
        
        // Determine card position
        const isInHand = cardEl.closest('.hand');
        const isInActive = cardEl.closest('.active');
        const isInBench = cardEl.closest('.bench');
        
        // Check if it's player's turn (with proper null checking)
        let isPlayerTurn = false;
        if (this.game && this.game.serverGameState && this.game.serverGameState.gameInfo) {
            isPlayerTurn = this.game.serverGameState.gameInfo.isYourTurn;
        }
        
        // For opponent cards, show inspection only
        const isOpponentCard = cardEl.classList.contains('opp');
        if (isOpponentCard) {
            actions.push({
                description: "Opponent's card - inspection only",
                enabled: false
            });
            return actions;
        }
        
        if (!isPlayerTurn) {
            actions.push({
                description: "Wait for your turn",
                enabled: false
            });
            return actions;
        }

        if (isInHand) {
            // Cards in hand can be played
            if (cardData.type === 'pokemon') {
                actions.push({
                    description: "Play Pokémon to bench",
                    enabled: true,
                    callback: () => this.suggestPlayToBench(cardEl)
                });
            } else if (cardData.type === 'trainer') {
                actions.push({
                    description: "Play Trainer card",
                    enabled: true,
                    callback: () => this.suggestPlayTrainer(cardEl)
                });
            } else if (cardData.type === 'energy') {
                actions.push({
                    description: "Attach Energy to Pokémon",
                    enabled: true,
                    callback: () => this.suggestAttachEnergy(cardEl)
                });
            }
        }

        if (isInActive) {
            // Active Pokémon can attack or retreat
            actions.push({
                description: "Attack opponent",
                enabled: true,
                callback: () => this.suggestAttack(cardEl)
            });
            
            actions.push({
                description: "Retreat to bench",
                enabled: true,
                callback: () => this.suggestRetreat(cardEl)
            });
        }

        if (isInBench) {
            // Bench Pokémon can become active
            actions.push({
                description: "Move to active position",
                enabled: true,
                callback: () => this.suggestMoveToActive(cardEl)
            });
        }

        // Don't add general game actions to card-specific actions
        // End turn should be handled separately, not as a card action
        
        return actions;
    }

    // Create energy type icon
    createEnergyIcon(energyType, size = 24) {
        const icon = document.createElement('div');
        icon.style.cssText = `
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: ${Math.max(8, size * 0.4)}px;
            color: white;
            text-shadow: 0 1px 2px rgba(0,0,0,0.5);
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            flex-shrink: 0;
        `;

        // Energy type colors and symbols
        const energyConfig = {
            fire: { color: '#FF4444', symbol: '🔥', alt: 'R' },
            water: { color: '#4488FF', symbol: '💧', alt: 'W' },
            grass: { color: '#44AA44', symbol: '🌱', alt: 'G' },
            lightning: { color: '#FFDD00', symbol: '⚡', alt: 'L' },
            psychic: { color: '#AA44AA', symbol: '👁️', alt: 'P' },
            fighting: { color: '#CC6600', symbol: '👊', alt: 'F' },
            dark: { color: '#333333', symbol: '🌙', alt: 'D' },
            steel: { color: '#888888', symbol: '⚙️', alt: 'S' },
            fairy: { color: '#FF99CC', symbol: '🧚', alt: 'Y' },
            dragon: { color: '#7744FF', symbol: '🐉', alt: 'N' },
            colorless: { color: '#CCCCCC', symbol: '⭐', alt: 'C' }
        };

        const config = energyConfig[energyType] || energyConfig.colorless;
        icon.style.backgroundColor = config.color;
        
        // Try to use emoji first, fallback to letter
        icon.textContent = config.symbol;
        
        // If emoji doesn't render well, use letter fallback
        icon.setAttribute('title', `${energyType.charAt(0).toUpperCase() + energyType.slice(1)} Energy`);
        
        return icon;
    }

    // Helper methods for action suggestions
    suggestPlayToBench(cardEl) {
        // Highlight empty bench slots
        document.querySelectorAll('.bench .card.player.empty').forEach(slot => {
            slot.style.border = '3px solid #4caf50';
            slot.style.boxShadow = '0 0 10px rgba(76, 175, 80, 0.5)';
        });
        
        setTimeout(() => {
            document.querySelectorAll('.bench .card.player').forEach(slot => {
                slot.style.border = '';
                slot.style.boxShadow = '';
            });
        }, 3000);
    }

    suggestAttachEnergy(cardEl) {
        // Highlight player's Pokémon
        document.querySelectorAll('.card.player:not(.empty)').forEach(slot => {
            slot.style.border = '3px solid #2196f3';
            slot.style.boxShadow = '0 0 10px rgba(33, 150, 243, 0.5)';
        });
        
        setTimeout(() => {
            document.querySelectorAll('.card.player').forEach(slot => {
                slot.style.border = '';
                slot.style.boxShadow = '';
            });
        }, 3000);
    }

    // Show visual feedback when energy is attached
    showEnergyAttachmentFeedback(pokemonEl) {
        // Brief flash animation to show successful attachment
        pokemonEl.style.transition = 'box-shadow 0.3s ease';
        pokemonEl.style.boxShadow = '0 0 20px #2196f3';
        
        setTimeout(() => {
            pokemonEl.style.boxShadow = '';
            pokemonEl.style.transition = '';
        }, 600);
        
        // Update the energy display for this Pokemon
        this.updatePokemonEnergyDisplay(pokemonEl);
    }

    // Update the visual display of attached energy for a Pokemon
    updatePokemonEnergyDisplay(pokemonEl) {
        // Get the Pokemon's card data to check attached energy
        const cardData = this.getCardDataFromElement(pokemonEl);
        
        // Remove existing energy display
        const existingEnergyDisplay = pokemonEl.querySelector('.energy-display');
        if (existingEnergyDisplay) {
            existingEnergyDisplay.remove();
        }
        
        // Create new energy display if there's attached energy
        if (cardData && cardData.attachedEnergy && cardData.attachedEnergy.length > 0) {
            const energyDisplay = document.createElement('div');
            energyDisplay.className = 'energy-display';
            energyDisplay.style.cssText = `
                position: absolute;
                bottom: 4px;
                right: 4px;
                display: flex;
                gap: 2px;
                pointer-events: none;
                z-index: 5;
            `;
            
            // Add energy icons
            cardData.attachedEnergy.forEach(energy => {
                const energyIcon = this.createEnergyIcon(energy.energyType, 16);
                energyDisplay.appendChild(energyIcon);
            });
            
            pokemonEl.appendChild(energyDisplay);
        }
    }

    suggestAttack(cardEl) {
        // Highlight opponent's active Pokémon
        const oppActive = document.querySelector('.active .card.opp:not(.empty)');
        if (oppActive) {
            oppActive.style.border = '3px solid #f44336';
            oppActive.style.boxShadow = '0 0 10px rgba(244, 67, 54, 0.5)';
            
            setTimeout(() => {
                oppActive.style.border = '';
                oppActive.style.boxShadow = '';
            }, 3000);
        }
    }

    suggestRetreat(cardEl) {
        // Highlight empty bench slots or existing bench Pokémon to swap
        document.querySelectorAll('.bench .card.player').forEach(slot => {
            slot.style.border = '3px solid #ff9800';
            slot.style.boxShadow = '0 0 10px rgba(255, 152, 0, 0.5)';
        });
        
        setTimeout(() => {
            document.querySelectorAll('.bench .card.player').forEach(slot => {
                slot.style.border = '';
                slot.style.boxShadow = '';
            });
        }, 3000);
    }

    suggestMoveToActive(cardEl) {
        // Highlight active slot
        const activeSlot = document.querySelector('.active .card.player');
        if (activeSlot) {
            activeSlot.style.border = '3px solid #9c27b0';
            activeSlot.style.boxShadow = '0 0 10px rgba(156, 39, 176, 0.5)';
            
            setTimeout(() => {
                activeSlot.style.border = '';
                activeSlot.style.boxShadow = '';
            }, 3000);
        }
    }

    suggestPlayTrainer(cardEl) {
        // Show message about trainer card effects
        const message = document.createElement('div');
        message.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #333;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            z-index: 1001;
            font-size: 16px;
        `;
        message.textContent = 'Trainer card effects will be implemented based on card type';
        document.body.appendChild(message);
        
        setTimeout(() => {
            message.remove();
        }, 3000);
    }

    endTurn() {
        // Try to send end turn through WebSocket client
        if (this.webSocketClient) {
            this.webSocketClient.send(JSON.stringify({
                type: 'game_action',
                action: 'end_turn'
            }));
        } else if (this.game && this.game.wsClient) {
            // Fallback if wsClient is stored in game
            this.game.wsClient.send(JSON.stringify({
                type: 'game_action',
                gameId: this.game.gameId,
                action: 'end_turn'
            }));
        } else {
            console.warn('No WebSocket client available to send end turn');
        }
    }

    // Handle opponent state updates
    handleOpponentStateUpdate(data) {
        // Update opponent's board state if needed
        console.log('Opponent state updated:', data);
    }

    // Rollback the last move when server rejects it
    rollbackLastMove() {
        if (!this.lastMove) {
            console.log('No move to rollback');
            return;
        }

        console.log('Rolling back failed move...');
        const { sourceEl, targetEl, sourceBackground, sourceWasEmpty, targetWasEmpty, moveType } = this.lastMove;

        // Restore source element
        if (sourceEl) {
            console.log('Rollback: Forcing card restoration');
            
            // Force remove empty class and restore the card regardless of original state
            sourceEl.classList.remove('empty');
            sourceEl.style.backgroundImage = sourceBackground;
            
            // Always restore card data and visual if we have it
            if (this.lastMove.cardData) {
                sourceEl.cardData = this.lastMove.cardData;
                if (window.setCardVisual) {
                    window.setCardVisual(sourceEl, this.lastMove.cardData);
                }
            }
            
            console.log('Rollback: Card forcibly restored', {
                hasEmptyClass: sourceEl.classList.contains('empty'),
                hasCardData: !!sourceEl.cardData,
                backgroundImage: sourceEl.style.backgroundImage
            });
        }

        // Restore target element 
        if (targetEl) {
            if (moveType === 'attach') {
                // For energy attachment, no special target restoration needed
                // Note: We don't need to remove energy icons since they're added by server state updates
                // If the server rejects the move, it won't update the pokemon's energy, so icons won't appear
            } else {
                // For regular moves, restore the target slot state
                if (targetWasEmpty) {
                    targetEl.classList.add('empty');
                    targetEl.style.backgroundImage = '';
                }
            }
        }

        // Clear the stored move
        this.lastMove = null;
        
        console.log('Move rollback completed');
    }
}
export default GUIHookUtils;