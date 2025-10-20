// Enhanced Card Inspection System v2.2 - Server-data driven (no client-side card instances)
import enums from "./enums.js";

const { PokemonType, CardModifiers, AbilityEventListeners } = enums;

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
        this.myTurnFlag = true; // Track if it's this player's turn (renamed to avoid conflict with method)
        this.dragEnabled = true; // Can be disabled during opponent's turn
        
        // Store last move for potential rollback
        this.lastMove = null;
        
        // Initialize ability handler registry
        this.clientSideAbilityHandlers = new Map();
        this.abilityComponents = new Map();
        
        // Load default ability handlers
        this.loadDefaultAbilityHandlers();
        
        console.log('GUIHookUtils initialized with server-data driven architecture');
    }

    // Convert server card data to client-side card data (no class instantiation)
    createCardInstance(serverCardData, owner = null) {
        if (!serverCardData || !serverCardData.cardName) {
            return null;
        }
        
        // Return server data directly - no need to create class instances on client side
        // The server manages all card state, we just need the data for UI display
        return serverCardData;
    }

    // Helper method to set card data directly on a DOM element
    setCardInstance(element, cardData) {
        if (!element || !cardData) return;
        
        // Store the card data directly (server data is already in the right format)
        element.cardData = cardData;
        
        // For backwards compatibility, also set as cardInstance
        element.cardInstance = cardData;
        
        console.log('Set card data on element:', {
            cardName: cardData.cardName,
            attacks: cardData.attacks ? cardData.attacks.map(a => a.name) : [],
            abilities: cardData.abilities ? cardData.abilities.map(a => a.name) : [],
            totalAbilities: cardData.abilities ? cardData.abilities.length : 0,
            totalAttacks: cardData.attacks ? cardData.attacks.length : 0
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
        
        // Inject CSS to ensure touch gestures don't interfere with dragging on touch devices
        // This sets touch-action to none for card elements so browser panning/zooming won't block
        // pointer/touch event handling.
        try {
            if (!document.getElementById('guihook-touch-style')) {
                const s = document.createElement('style');
                s.id = 'guihook-touch-style';
                s.textContent = `
                    .card { touch-action: none; -ms-touch-action: none; }
                    #PlayerHand .card { touch-action: none; }
                `;
                document.head.appendChild(s);
            }
        } catch (err) {
            console.warn('Could not inject touch-action CSS', err);
        }

        // Use Pointer Events if available (preferred: unified API for mouse/touch/stylus)
        if (window.PointerEvent) {
            document.addEventListener('pointerdown', (e) => this.onMouseDown(e));
            document.addEventListener('pointermove', (e) => this.onMouseMove(e));
            document.addEventListener('pointerup', (e) => this.onMouseUp(e));
        } else {
            // Prefer Pointer Events (unified for mouse/touch/stylus) when available.
            if (window.PointerEvent) {
                document.addEventListener('pointerdown', (e) => {
                    try { console.log('pointerdown', e.pointerType, e.clientX, e.clientY); } catch (err) {}
                    this.onMouseDown(e);
                });
                document.addEventListener('pointermove', (e) => {
                    try { /* reduce noise in console */ } catch (err) {}
                    this.onMouseMove(e);
                });
                document.addEventListener('pointerup', (e) => {
                    try { console.log('pointerup', e.pointerType); } catch (err) {}
                    this.onMouseUp(e);
                });
            } else {
                // Touch events for mobile support (non-passive so we can call preventDefault())
                document.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
                document.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
                document.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
            }
        }
        
        // Set up discard pile viewing functionality
        this.setupDiscardPileViewing();
        
        // Set up WebSocket event listeners if multiplayer
        if (this.isMultiplayer) {
            this.setupMultiplayerEventListeners();
        }
    }

    // Enable or disable drag functionality
    setDragEnabled(enabled, reason = '') {
        const wasMyTurn = this.myTurnFlag;
        this.dragEnabled = enabled;
        this.myTurnFlag = enabled;
        
        // Force reset energy flag when turn starts
        if (enabled && !wasMyTurn) {
            console.log('DEBUG: Turn change detected - calling onTurnStart');
            this.onTurnStart();
        }
        
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
        
        // Check if this is the active Pokemon - prioritize inspection over dragging
        const isActivePokemon = cardEl.id === 'ActivePokemon';
        
        // Only prepare drag for player's own cards (but not the active Pokemon unless explicitly dragging)
        if (isPlayerCard) {
            if (isActivePokemon) {
                // For active Pokemon, prefer inspection over dragging
                // Only prepare drag if this is clearly intended to be a drag operation
                this.inspectionPrepared = {
                    cardEl,
                    cardData,
                    mouseDownInfo: this.mouseDownInfo,
                    preferInspection: true // Flag to indicate this should prefer inspection
                };
                
                console.log('Inspection preferred for active Pokemon:', cardData?.name || 'Unknown');
            } else {
                // For other player cards, normal drag preparation
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
            }
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
        // Handle inspection-preferred cards (like active Pokemon)
        if (this.inspectionPrepared && this.inspectionPrepared.preferInspection && !this.dragging) {
            const { mouseDownInfo } = this.inspectionPrepared;
            const moveDistance = Math.sqrt(
                Math.pow(e.clientX - mouseDownInfo.startX, 2) + 
                Math.pow(e.clientY - mouseDownInfo.startY, 2)
            );
            
            // For active Pokemon, require much more movement (15 pixels) to start drag
            // This prioritizes the inspection modal over accidental dragging
            if (moveDistance > 15 && mouseDownInfo.isPlayerCard) {
                console.log('Converting active Pokemon inspection to drag due to significant movement');
                
                // Convert inspection preparation to drag preparation
                const cardEl = this.inspectionPrepared.cardEl;
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
                    cardData: this.inspectionPrepared.cardData,
                    mouseDownInfo: this.inspectionPrepared.mouseDownInfo
                };
                
                this.inspectionPrepared = null;
                
                // Check if drag is allowed
                if (!this.canStartDrag(cardEl)) {
                    this.showTurnErrorFeedback(cardEl);
                    this.dragPrepared = null;
                    return;
                }
                
                // Start the actual drag
                const dragEl = this.makeDragEl(cardEl, cardRect, containerRect);
                this.container.appendChild(dragEl);
                this.dragging = { cardEl, dragEl, offsetX, offsetY };
                this.dragging.cardEl.style.backgroundImage = '';
                this.dragging.cardEl.classList.add('empty');
                this.dragPrepared = null;
            }
            return;
        }
        
        // Only process drag movement for player cards (normal threshold)
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
        
        // Clean up all previous dropType properties from DOM elements
        document.querySelectorAll('.card-slot, .card, [data-type]').forEach(el => {
            if (el.dropType !== undefined) {
                el.dropType = undefined;
            }
        });
        
        // Get the card data to determine card type
        const draggedCardData = this.getCardDataFromElement(this.dragging.cardEl);
        const isEnergyCard = draggedCardData && draggedCardData.type === 'energy';
        
        // Use server-provided isEvolution field, or fallback to known evolution Pokemon
        let isEvolutionCard = draggedCardData?.isEvolution;
        if (isEvolutionCard === undefined) {
            // Fallback: check if it's a known evolution Pokemon by name
            const knownEvolutionPokemon = ['Alakazam', 'Blastoise', 'Arcanine', 'Charizard', 'Venusaur', 'Wartortle', 'Ivysaur', 'Charmeleon', 'Kadabra'];
            isEvolutionCard = knownEvolutionPokemon.includes(draggedCardData?.cardName);
        }
        isEvolutionCard = draggedCardData && isEvolutionCard;
        
        console.log(`🔍 Collision detection for drag:`, {
            cardData: draggedCardData,
            cardType: draggedCardData?.type,
            pokemon: draggedCardData?.pokemon,
            evolvesFrom: draggedCardData?.evolvesFrom,
            isEvolution: isEvolutionCard,
            isEnergyCard: isEnergyCard,
            isEvolutionCard: isEvolutionCard,
            cardName: draggedCardData?.cardName
        });
        
        // New approach: Check all potential drop targets and validate based on what we're dropping onto
        console.log(`🎯 Checking all potential drop targets with target-based validation`);
        
        // Check all active/bench slots (both empty and occupied)
        document.querySelectorAll('.card.player:not(.discard):not(.hand .card)').forEach(slot => {
            const s = slot.getBoundingClientRect();
            const colliding = !(
                dragRect.right < s.left ||
                dragRect.left > s.right ||
                dragRect.bottom < s.top ||
                dragRect.top > s.bottom
            );
            
            if (!colliding) return; // Skip non-colliding slots
            
            const isActiveOrBench = slot.classList.contains('active') || slot.classList.contains('benched');
            const isEmpty = slot.classList.contains('empty');
            
            if (!isActiveOrBench) return; // Skip non-playable slots
            
            console.log(`🎯 Evaluating drop target:`, {
                element: slot,
                id: slot.id,
                classes: slot.className,
                isEmpty: isEmpty,
                draggedCard: draggedCardData?.cardName,
                draggedType: draggedCardData?.type
            });
            
            if (isEmpty) {
                // RULE: Empty slot - only allow basic Pokemon (not evolution Pokemon)
                const cardType = draggedCardData?.type;
                const isPokemonType = cardType === 'pokemon' || cardType === 'fire' || cardType === 'water' || 
                                    cardType === 'grass' || cardType === 'lightning' || cardType === 'psychic' || 
                                    cardType === 'fighting' || cardType === 'colorless';
                
                // Use server-provided isEvolution field, or fallback to known evolution Pokemon
                let isEvolution = draggedCardData?.isEvolution;
                if (isEvolution === undefined) {
                    // Fallback: check if it's a known evolution Pokemon by name
                    const knownEvolutionPokemon = ['Alakazam', 'Blastoise', 'Arcanine', 'Charizard', 'Venusaur', 'Wartortle', 'Ivysaur', 'Charmeleon', 'Kadabra'];
                    isEvolution = knownEvolutionPokemon.includes(draggedCardData?.cardName);
                }
                const isBasicPokemon = draggedCardData && isPokemonType && !isEvolution;
                
                console.log(`🎯 Empty slot check:`, {
                    cardName: draggedCardData?.cardName,
                    type: cardType,
                    isPokemonType: isPokemonType,
                    isEvolution: isEvolution,
                    evolvesFrom: draggedCardData?.evolvesFrom,
                    isBasicPokemon: isBasicPokemon,
                    draggedCardData: draggedCardData
                });
                
                if (!isEvolution && isPokemonType) {
                    console.log(`✅ Basic Pokemon can be played on empty slot`);
                    this.currentDropTarget = slot;
                    this.currentDropTarget.dropType = 'normal';
                } else {
                    console.log(`🚫 Evolution Pokemon cannot be played on empty slot`);
                }
            } else {
                // RULE: Occupied slot - check if it's energy attachment or evolution
                const slotCardData = this.getCardDataFromElement(slot);
                const isEnergyCard = draggedCardData && draggedCardData.type === 'energy';
                
                // Use same fallback logic for evolution detection
                let isEvolutionCard = draggedCardData?.isEvolution;
                if (isEvolutionCard === undefined) {
                    // Fallback: check if it's a known evolution Pokemon by name
                    const knownEvolutionPokemon = ['Alakazam', 'Blastoise', 'Arcanine', 'Charizard', 'Venusaur', 'Wartortle', 'Ivysaur', 'Charmeleon', 'Kadabra'];
                    isEvolutionCard = knownEvolutionPokemon.includes(draggedCardData?.cardName);
                }
                isEvolutionCard = draggedCardData && isEvolutionCard;
                
                console.log(`🎯 Occupied slot check:`, {
                    slotPokemon: slotCardData?.pokemon,
                    draggedCard: draggedCardData?.cardName,
                    isEnergyCard: isEnergyCard,
                    isEvolutionCard: isEvolutionCard,
                    draggedIsEvolution: isEvolutionCard,
                    evolvesFrom: draggedCardData?.evolvesFrom
                });
                
                if (isEnergyCard) {
                    // RULE: Energy attachment to Pokemon
                    console.log(`⚡ Energy attachment check`);
                    this.currentDropTarget = slot;
                    this.currentDropTarget.dropType = 'attach';
                } else if (isEvolutionCard && slotCardData) {
                    // RULE: Evolution check - use server-provided evolvesFrom field or fallback mapping
                    let evolvesFrom = draggedCardData.evolvesFrom;
                    if (!evolvesFrom) {
                        // Fallback: hardcoded evolution mapping
                        const evolutionMap = {
                            'Alakazam': 'Kadabra',
                            'Blastoise': 'Wartortle', 
                            'Arcanine': 'Growlithe',
                            'Charizard': 'Charmeleon',
                            'Venusaur': 'Ivysaur'
                        };
                        evolvesFrom = evolutionMap[draggedCardData.cardName];
                    }
                    // Get the Pokemon species from slot - try multiple properties
                    const slotSpecies = slotCardData.pokemon || slotCardData.cardName || slotCardData.name;
                    const canEvolve = slotSpecies === evolvesFrom;
                    
                    console.log(`� Evolution check:`, {
                        canEvolve: canEvolve,
                        slotSpecies: slotSpecies,
                        requiredSpecies: evolvesFrom,
                        draggedCard: draggedCardData.cardName,
                        slotCardData: slotCardData
                    });
                    
                    if (canEvolve) {
                        console.log(`✅ Evolution is valid`);
                        this.currentDropTarget = slot;
                        this.currentDropTarget.dropType = 'evolve';
                    } else {
                        console.log(`🚫 Evolution is not valid`);
                    }
                } else {
                    console.log(`🚫 Cannot drop this card type on occupied slot`);
                }
            }
        });

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
            } else {
                // Clear dropType when not colliding with discard pile
                discardPile.dropType = undefined;
            }
        }
    }

    // Handle mouse up events for drag end or click detection
    onMouseUp(e) {
        console.log('onMouseUp triggered', this.dragPrepared, this.inspectionPrepared, this.dragging);
        
        // Handle click detection for player cards (if drag was prepared but never started)
        if (this.dragPrepared && !this.dragging) {
            // Only allow inspection modal for player's own cards
            if (this.dragPrepared.cardEl.classList.contains('player')) {
                console.log('Detected click on player card:', this.dragPrepared.cardData?.name);
                this.showCardInspectionModal(this.dragPrepared.cardEl, this.dragPrepared.cardData);
            }
            this.dragPrepared = null;
            this.inspectionPrepared = null;
            return;
        }

        // Handle click detection for inspection-preferred cards (active Pokemon) or opponent cards
        if (this.inspectionPrepared && !this.dragging) {
            console.log('Detected click for inspection:', this.inspectionPrepared.cardData?.name);
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
            console.log('🎯 Found drop target:', {
                element: this.currentDropTarget,
                id: this.currentDropTarget.id,
                classes: this.currentDropTarget.className,
                dropType: this.currentDropTarget.dropType,
                isEmpty: this.currentDropTarget.classList.contains('empty')
            });
            
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
                try {
                    // Energy attachment - validate first before making any changes
                    const energyCardData = this.getCardDataFromElement(this.dragging.cardEl);
                    const targetCardData = this.getCardDataFromElement(this.currentDropTarget);

                    if (this.canAttachEnergy(energyCardData, targetCardData, this.currentDropTarget)) {
                        // Valid energy attachment - proceed with local update
                        console.log('DEBUG: Energy attachment validation passed, proceeding with attachment');
                        this.handleLocalEnergyAttachment(this.dragging.cardEl, this.currentDropTarget);

                        // Then update game state
                        this.updateGameStateOnDrop(this.dragging.cardEl, this.currentDropTarget);

                        // Visual feedback for energy attachment
                        this.showEnergyAttachmentFeedback(this.currentDropTarget);
                    } else {
                        // Invalid energy attachment - rollback
                        console.log('Energy attachment not allowed - rolling back');
                        this.dragging.cardEl.style.backgroundImage = window.getComputedStyle(this.dragging.dragEl).backgroundImage;
                        this.dragging.cardEl.classList.remove('empty');

                        // Show error message
                        if (window.showGameMessage) {
                            window.showGameMessage('Cannot attach energy: Already attached energy this turn or invalid target', 3000);
                        }
                    }
                } catch (err) {
                    console.error('Error during energy attachment handling:', err, {
                        dragging: this.dragging,
                        currentDropTarget: this.currentDropTarget
                    });
                    // Attempt to rollback visual state
                    try {
                        this.dragging.cardEl.style.backgroundImage = window.getComputedStyle(this.dragging.dragEl).backgroundImage;
                        this.dragging.cardEl.classList.remove('empty');
                    } catch (e2) {
                        console.warn('Rollback failed after energy attach error', e2);
                    }
                }
            } else if (this.currentDropTarget.dropType === 'evolve') {
                // Evolution - handle the evolution drop
                console.log('Evolution drop detected');
                
                const evolutionCardData = this.getCardDataFromElement(this.dragging.cardEl);
                const targetPokemonData = this.getCardDataFromElement(this.currentDropTarget);
                
                if (this.canEvolve(evolutionCardData, targetPokemonData)) {
                    console.log('Evolution validation passed, triggering evolution');
                    console.log('Target Pokemon before evolution:', targetPokemonData);
                    
                    // Clear the source card since it's being used for evolution
                    this.dragging.cardEl.style.backgroundImage = '';
                    this.dragging.cardEl.classList.add('empty');
                    this.dragging.cardEl.removeAttribute('data-card-name');
                    
                    // Trigger evolution through the game system
                    this.handleEvolutionDrop(evolutionCardData, this.currentDropTarget);
                } else {
                    // Invalid evolution - rollback
                    console.log('Evolution not allowed - rolling back');
                    this.dragging.cardEl.style.backgroundImage = window.getComputedStyle(this.dragging.dragEl).backgroundImage;
                    this.dragging.cardEl.classList.remove('empty');
                    
                    // Show error message
                    if (window.showGameMessage) {
                        window.showGameMessage('Cannot evolve: Invalid evolution target', 3000);
                    }
                }
            } else if (this.currentDropTarget.dropType === 'discard') {
                // Discard pile drop - do not modify client state locally. Send request to server and wait for authoritative update.
                console.log('Dropping card to discard pile (requesting server to discard)');

                // Show a temporary pending state on the source card to indicate the request is in-flight
                this.dragging.cardEl.classList.add('pending-discard');

                // Send move request to server; server will return updated game state which will update the UI
                this.updateGameStateOnDrop(this.dragging.cardEl, this.currentDropTarget);
            } else {
                // Regular card placement
                // Check if dropping on the same slot
                if (this.currentDropTarget === this.dragging.cardEl) {
                    console.log('Dropping card on same slot - restoring original state');
                    // Just restore the original state without updating game state
                    this.dragging.cardEl.style.backgroundImage = window.getComputedStyle(this.dragging.dragEl).backgroundImage;
                    this.dragging.cardEl.classList.remove('empty');
                } else {
                    // Different slot - proceed with normal placement
                    this.currentDropTarget.style.backgroundImage = window.getComputedStyle(this.dragging.dragEl).backgroundImage;
                    this.currentDropTarget.classList.remove('empty');
                    
                    // Update game state
                    this.updateGameStateOnDrop(this.dragging.cardEl, this.currentDropTarget);
                }
            }
        } else {
            console.log('❌ No drop target found - returning card to origin');
            console.log('Available empty slots at drop time:', {
                emptySlots: document.querySelectorAll('.card.player.empty').length,
                allPlayerSlots: document.querySelectorAll('.card.player').length
            });
            
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
        // Prevent scrolling/zooming on touch when possible. Listeners are non-passive so this works.
        console.log('onTouchStart invoked', { touches: e.touches && e.touches.length });
        if (e.cancelable) e.preventDefault();

        if (e.touches && e.touches.length === 1) { // Only handle single finger touches
            const touch = e.touches[0];

            // Find the actual target element under the touch point
            const targetElement = document.elementFromPoint(touch.clientX, touch.clientY) || e.target;

            // Create a minimal synthetic event object compatible with onMouseDown
            const synthetic = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                target: targetElement
            };

            console.log('Touch start on:', targetElement);
            this.onMouseDown(synthetic);
        }
    }

    onTouchMove(e) {
        console.log('onTouchMove invoked', { touches: e.touches && e.touches.length, dragging: !!this.dragging });
        // Prevent scrolling during drag when possible
        if (e.cancelable) e.preventDefault();
        if (e.touches && e.touches.length === 1 && this.dragging) {
            const touch = e.touches[0];
            const synthetic = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                target: document.elementFromPoint(touch.clientX, touch.clientY)
            };
            this.onMouseMove(synthetic);
        }
    }

    onTouchEnd(e) {
        console.log('onTouchEnd invoked', { changedTouches: e.changedTouches && e.changedTouches.length });
        if (e.cancelable) e.preventDefault();
        // Use the last known touch position from changedTouches
        const touch = (e.changedTouches && e.changedTouches[0]) || null;
        const synthetic = touch ? {
            clientX: touch.clientX,
            clientY: touch.clientY,
            target: document.elementFromPoint(touch.clientX, touch.clientY)
        } : {
            clientX: 0,
            clientY: 0,
            target: document.elementFromPoint(0, 0)
        };

        // Forward to mouseup logic for drop handling
        this.onMouseUp(synthetic);
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
                maxHp: sourceCard.maxHp
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

    // Handle local energy attachment (client-side card data update)
    handleLocalEnergyAttachment(energyCardEl, targetPokemonEl) {
        // Get the energy card data
        const energyCardData = this.getCardDataFromElement(energyCardEl);
        if (!energyCardData) {
            console.warn('No energy card data found for attachment');
            return;
        }

        // Get the target Pokemon's card data
        let targetCardData = this.getCardDataFromElement(targetPokemonEl);
        if (!targetCardData) {
            console.warn('No target Pokemon card data found for energy attachment');
            return;
        }

        // Ensure the target has an attachedEnergy array
        if (!targetCardData.attachedEnergy) {
            targetCardData.attachedEnergy = [];
        }

        // Create energy data object
        const energyData = {
            energyType: energyCardData.energyType || energyCardData.type || 'colorless',
            cardName: energyCardData.name || energyCardData.cardName || `${(energyCardData.energyType || energyCardData.type || 'Colorless')} Energy`,
            type: energyCardData.type || 'energy',
            description: energyCardData.description || `Provides ${energyCardData.energyType || energyCardData.type || 'colorless'} energy`
        };

        // Add the energy to the target Pokemon's attached energy
        targetCardData.attachedEnergy.push(energyData);

        // Update the DOM element's card data
        if (targetPokemonEl.cardData) {
            targetPokemonEl.cardData = targetCardData;
        }

        // Also update the card instance if available
        if (targetPokemonEl.cardInstance && targetPokemonEl.cardInstance.attachedEnergy) {
            if (!targetPokemonEl.cardInstance.attachedEnergy) {
                targetPokemonEl.cardInstance.attachedEnergy = [];
            }
            targetPokemonEl.cardInstance.attachedEnergy.push(energyData);
        }

        console.log(`Attached ${energyData.cardName} to ${targetCardData.name || targetCardData.cardName}`, {
            totalAttached: targetCardData.attachedEnergy.length,
            attachedEnergy: targetCardData.attachedEnergy
        });

        // Mark that energy has been attached this turn
        if (this.player1) {
            this.player1.attachedEnergyThisTurn = true;
        }

        // Update the visual energy display
        this.updateAttachedEnergyDisplay(targetPokemonEl, targetCardData);
    }

    // Validate if energy attachment is allowed
    canAttachEnergy(energyCardData, targetCardData, targetPokemonEl) {
        const playerAttachedEnergyThisTurn = this.player1 ? this.player1.attachedEnergyThisTurn : false;
        console.log('DEBUG: Starting energy attachment validation', {
            attachedEnergyThisTurn: playerAttachedEnergyThisTurn,
            isMyTurn: this.isMyTurn(),
            energyCardType: energyCardData?.type,
            targetCardType: targetCardData?.type
        });

        // Basic validation checks
        if (!energyCardData || !targetCardData) {
            console.log('Energy attachment failed: Missing card data');
            return false;
        }

        // Check if the energy card is actually an energy card
        if (energyCardData.type !== 'energy') {
            console.log('Energy attachment failed: Source card is not an energy card');
            return false;
        }

        // Check if the target is a Pokemon
        if (targetCardData.type !== 'pokemon' && !targetCardData.hp) {
            console.log('Energy attachment failed: Target is not a Pokemon');
            return false;
        }

        // Check if it's the player's turn and they haven't already attached energy this turn
        if (!this.isMyTurn()) {
            console.log('Energy attachment failed: Not player\'s turn');
            return false;
        }

        // Check if player has already attached energy this turn (basic rule)
        const playerAttachedEnergyFlag = this.player1 ? this.player1.attachedEnergyThisTurn : false;
        console.log('DEBUG: Checking energy attachment flag:', playerAttachedEnergyFlag, {
            player1Exists: !!this.player1,
            player1Username: this.player1?.username,
            flagValue: this.player1?.attachedEnergyThisTurn
        });
        if (playerAttachedEnergyFlag) {
            console.log('Energy attachment failed: Already attached energy this turn');
            return false;
        }

        // Check if the target Pokemon is on the player's side
        if (!targetPokemonEl.classList.contains('player')) {
            console.log('Energy attachment failed: Target Pokemon is not a player card (missing .player class)');
            console.log('DEBUG: Target element classes:', targetPokemonEl.className);
            return false;
        }

        // All validation checks passed
        console.log('Energy attachment validation passed');
        return true;
    }

    // Reset energy attachment flag (for testing or turn management)
    resetEnergyAttachmentFlag() {
        const currentFlag = this.player1 ? this.player1.attachedEnergyThisTurn : false;
        console.log('DEBUG: Manually resetting energy attachment flag from:', currentFlag);
        if (this.player1) {
            this.player1.attachedEnergyThisTurn = false;
        }
        console.log('Energy attachment flag manually reset to:', this.player1 ? this.player1.attachedEnergyThisTurn : false);
    }

    // Evolution validation methods
    canEvolve(evolutionCardData, targetPokemonData) {
        // Get evolvesFrom with fallback logic
        let evolvesFrom = evolutionCardData?.evolvesFrom;
        if (!evolvesFrom) {
            // Fallback: hardcoded evolution mapping
            const evolutionMap = {
                'Alakazam': 'Kadabra',
                'Blastoise': 'Wartortle', 
                'Arcanine': 'Growlithe',
                'Charizard': 'Charmeleon',
                'Venusaur': 'Ivysaur'
            };
            evolvesFrom = evolutionMap[evolutionCardData?.cardName];
        }
        
        // Get target Pokemon species with fallback
        const targetSpecies = targetPokemonData?.pokemon || targetPokemonData?.cardName || targetPokemonData?.name;
        
        console.log('DEBUG: Starting evolution validation', {
            evolutionCard: evolutionCardData?.cardName,
            evolvesFrom: evolvesFrom,
            targetPokemon: targetPokemonData?.cardName,
            targetSpecies: targetSpecies
        });

        // Basic validation checks
        if (!evolutionCardData || !targetPokemonData) {
            console.log('Evolution failed: Missing card data');
            return false;
        }

        // Check if the evolution card can evolve from something
        if (!evolvesFrom) {
            console.log('Evolution failed: Evolution card does not evolve from anything');
            return false;
        }

        // Check if the target Pokemon matches the evolution requirement
        if (targetSpecies !== evolvesFrom) {
            console.log(`Evolution failed: ${evolutionCardData.cardName} cannot evolve from ${targetSpecies} (needs ${evolvesFrom})`);
            return false;
        }

        // Check if it's the player's turn
        if (!this.isMyTurn()) {
            console.log('Evolution failed: Not your turn');
            return false;
        }

        // All validation checks passed
        console.log('Evolution validation passed');
        return true;
    }

    handleEvolutionDrop(evolutionCardData, targetPokemonEl) {
        console.log('Handling evolution drop', {
            evolutionCard: evolutionCardData?.cardName,
            targetElement: targetPokemonEl
        });

        // Determine the target location and index
        let targetLocation = 'active';
        let targetIndex = 0;

        if (targetPokemonEl.classList.contains('benched')) {
            targetLocation = 'bench';
            // Find the bench index
            const benchCards = Array.from(document.querySelectorAll('.bench .card.player.benched'));
            targetIndex = benchCards.indexOf(targetPokemonEl);
        }

        // Find the evolution card index in hand
        const handCards = Array.from(document.querySelectorAll('#PlayerHand .card'));
        let handIndex = -1;
        
        handCards.forEach((card, index) => {
            const cardData = this.getCardDataFromElement(card);
            if (cardData && cardData.id === evolutionCardData.id) {
                handIndex = index;
            }
        });

        if (handIndex === -1) {
            console.log('Evolution failed: Could not find evolution card in hand');
            if (window.showGameMessage) {
                window.showGameMessage('❌ Evolution card not found in hand!', 3000);
            }
            return;
        }

        console.log(`Evolution drop: card at hand index ${handIndex} to ${targetLocation} ${targetIndex}`);

        // Send evolution request to server
        if (window.wsClient && window.wsClient.send) {
            const success = window.wsClient.send('evolve_pokemon', {
                evolutionCardIndex: handIndex,
                targetPokemonLocation: targetLocation,
                targetPokemonIndex: targetIndex
            });

            if (success) {
                if (window.showGameMessage) {
                    window.showGameMessage(`🔄 Evolving to ${evolutionCardData.cardName}...`, 2000);
                }
            } else {
                if (window.showGameMessage) {
                    window.showGameMessage('❌ Failed to send evolution command!', 3000);
                }
            }
        }
    }

    // Force reset energy flag when turn changes
    onTurnStart() {
        console.log('DEBUG: onTurnStart called - forcing energy flag reset');
        if (this.player1) {
            this.player1.attachedEnergyThisTurn = false;
            console.log('DEBUG: Energy flag forcibly reset on turn start to:', this.player1.attachedEnergyThisTurn);
        }
    }

    // Debug method to check current flag status
    checkEnergyAttachmentStatus() {
        const playerFlag = this.player1 ? this.player1.attachedEnergyThisTurn : false;
        console.log('Energy attachment status:', {
            attachedEnergyThisTurn: playerFlag,
            isMyTurn: this.isMyTurn(),
            dragEnabled: this.dragEnabled,
            myTurnFlag: this.myTurnFlag
        });
        return playerFlag;
    }

    // Update the visual display of attached energy for a Pokemon
    updateAttachedEnergyDisplay(pokemonEl, cardData) {
        // Get the Pokemon's card data to check attached energy
        if (!cardData || !cardData.attachedEnergy || cardData.attachedEnergy.length === 0) {
            // Remove any existing energy display (both class names)
            const existingDisplay1 = pokemonEl.querySelector('.attached-energy-display');
            if (existingDisplay1) {
                existingDisplay1.remove();
            }
            const existingDisplay2 = pokemonEl.querySelector('.energy-display');
            if (existingDisplay2) {
                existingDisplay2.remove();
            }
            return;
        }

        // Remove existing energy display if present (both class names)
        const existingDisplay1 = pokemonEl.querySelector('.attached-energy-display');
        if (existingDisplay1) {
            existingDisplay1.remove();
        }
        const existingDisplay2 = pokemonEl.querySelector('.energy-display');
        if (existingDisplay2) {
            existingDisplay2.remove();
        }

        // Create energy display container
        const energyDisplay = document.createElement('div');
        energyDisplay.className = 'attached-energy-display';
        energyDisplay.style.cssText = `
            position: absolute;
            bottom: 5px;
            right: 5px;
            display: flex;
            gap: 2px;
            z-index: 10;
            pointer-events: none;
        `;

        // Create energy count by type
        const energyCount = {};
        cardData.attachedEnergy.forEach(energy => {
            const type = energy.energyType || energy.type || 'colorless';
            energyCount[type] = (energyCount[type] || 0) + 1;
        });

        // Create visual indicators for each energy type
        Object.entries(energyCount).forEach(([type, count]) => {
            const energyIcon = this.createEnergyIcon(type, 16);
            energyIcon.style.cssText += `
                border: 1px solid rgba(255, 255, 255, 0.8);
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.9);
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
            `;

            // Add count badge if more than 1
            if (count > 1) {
                const countBadge = document.createElement('div');
                countBadge.textContent = count;
                countBadge.style.cssText = `
                    position: absolute;
                    top: -4px;
                    right: -4px;
                    background: #dc3545;
                    color: white;
                    border-radius: 50%;
                    width: 14px;
                    height: 14px;
                    font-size: 10px;
                    font-weight: bold;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 1px solid white;
                `;

                const iconContainer = document.createElement('div');
                iconContainer.style.cssText = 'position: relative; display: inline-block;';
                iconContainer.appendChild(energyIcon);
                iconContainer.appendChild(countBadge);
                energyDisplay.appendChild(iconContainer);
            } else {
                energyDisplay.appendChild(energyIcon);
            }
        });

        // Add tooltip with energy details
        const tooltipText = cardData.attachedEnergy.map(energy => 
            energy.cardName || `${(energy.energyType || energy.type || 'Colorless')} Energy`
        ).join(', ');
        
        energyDisplay.title = `Attached Energy: ${tooltipText} (Total: ${cardData.attachedEnergy.length})`;

        // Append to Pokemon card
        pokemonEl.appendChild(energyDisplay);
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
        return new Promise((resolve) => {
            // Generate coin flip result
            const result = Math.random() < 0.5;
            
            // Show coin flip animation to user
            this.showCoinFlip(result);
            
            // Wait for animation to complete before resolving
            setTimeout(() => {
                resolve(result);
            }, 3000); // Animation takes about 3 seconds
        });
    }
    
    showCoinFlip(result) {
        const modal = document.getElementById('coin-flip-modal');
        const coin = document.getElementById('coin');
        const coinResult = document.getElementById('coin-result');
        
        if (!modal) {
            console.warn('Coin flip modal not found');
            return;
        }
        
        // Reset coin state
        coin.className = '';
        coinResult.textContent = '';
        coinResult.classList.remove('result-visible');
        
        // Show modal
        modal.style.display = 'flex';
        
        // Start spinning animation
        coin.classList.add('coin-spinning');
        
        // After spinning, show result
        setTimeout(() => {
            coin.classList.remove('coin-spinning');
            coin.classList.add(result ? 'coin-result-heads' : 'coin-result-tails');
            coinResult.textContent = result ? 'HEADS!' : 'TAILS!';
            coinResult.classList.add('result-visible');
            
            // Hide modal after showing result
            setTimeout(() => {
                modal.style.display = 'none';
            }, 1500);
        }, 2000); // Match animation duration
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

    // Generic card selection menu with filtering and customizable display
    showCardSelectionMenu(cards, options = {}) {
        const {
            title = 'Select a Card',
            subtitle = '',
            filterFunction = null,
            allowCancel = true,
            cardDisplayFunction = null,
            maxColumns = 4,
            showCardInfo = true
        } = options;

        // Apply filter if provided
        const filteredCards = filterFunction ? cards.filter(filterFunction) : cards;
        
        if (filteredCards.length === 0) {
            if (window.showGameMessage) {
                window.showGameMessage('No cards available for selection', 2000);
            }
            return Promise.resolve(null);
        }

        return new Promise((resolve) => {
            // Create modal overlay
            const modalOverlay = document.createElement('div');
            modalOverlay.className = 'card-selection-modal-overlay';
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
            modalContent.className = 'card-selection-modal-content';
            modalContent.style.cssText = `
                background: white;
                border-radius: 15px;
                padding: 20px;
                max-width: 90vw;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
                position: relative;
            `;

            // Header
            const header = document.createElement('div');
            header.style.cssText = `
                text-align: center;
                margin-bottom: 20px;
                padding-bottom: 15px;
                border-bottom: 2px solid #ddd;
            `;

            const titleElement = document.createElement('h2');
            titleElement.textContent = title;
            titleElement.style.cssText = `
                margin: 0 0 10px 0;
                color: #333;
                font-size: 24px;
            `;

            header.appendChild(titleElement);

            if (subtitle) {
                const subtitleElement = document.createElement('p');
                subtitleElement.textContent = subtitle;
                subtitleElement.style.cssText = `
                    margin: 0;
                    color: #666;
                    font-size: 16px;
                `;
                header.appendChild(subtitleElement);
            }

            // Cards grid
            const cardsGrid = document.createElement('div');
            cardsGrid.style.cssText = `
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 15px;
                max-width: ${maxColumns * 220}px;
                margin: 0 auto;
            `;

            // Create card elements
            filteredCards.forEach(card => {
                const cardContainer = document.createElement('div');
                cardContainer.style.cssText = `
                    border: 2px solid #ddd;
                    border-radius: 10px;
                    padding: 10px;
                    background: #f9f9f9;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    text-align: center;
                `;

                cardContainer.addEventListener('mouseenter', () => {
                    cardContainer.style.borderColor = '#007bff';
                    cardContainer.style.background = '#e3f2fd';
                    cardContainer.style.transform = 'scale(1.02)';
                });

                cardContainer.addEventListener('mouseleave', () => {
                    cardContainer.style.borderColor = '#ddd';
                    cardContainer.style.background = '#f9f9f9';
                    cardContainer.style.transform = 'scale(1)';
                });

                // Card image
                const cardImage = document.createElement('img');
                cardImage.src = card.imgUrl;
                cardImage.style.cssText = `
                    width: 100%;
                    max-width: 150px;
                    height: auto;
                    border-radius: 8px;
                    margin-bottom: 10px;
                `;

                cardContainer.appendChild(cardImage);

                // Card info
                if (showCardInfo) {
                    const cardName = document.createElement('div');
                    cardName.textContent = card.cardName || card.name || 'Unknown Card';
                    cardName.style.cssText = `
                        font-weight: bold;
                        margin-bottom: 5px;
                        color: #333;
                    `;
                    cardContainer.appendChild(cardName);

                    // HP/Damage info for Pokemon
                    if (card.hp !== undefined || card.maxHp !== undefined) {
                        const hpInfo = document.createElement('div');
                        const currentHp = card.hp !== undefined ? card.hp : card.maxHp;
                        const maxHp = card.maxHp || card.hp;
                        const damage = maxHp - currentHp;
                        
                        hpInfo.textContent = damage > 0 ? 
                            `${currentHp}/${maxHp} HP (${damage} damage)` : 
                            `${currentHp}/${maxHp} HP`;
                        
                        hpInfo.style.cssText = `
                            font-size: 12px;
                            color: ${damage > 0 ? '#d32f2f' : '#388e3c'};
                            margin-bottom: 5px;
                        `;
                        cardContainer.appendChild(hpInfo);
                    }

                    // Custom display function
                    if (cardDisplayFunction) {
                        const customInfo = cardDisplayFunction(card);
                        if (customInfo) {
                            const customElement = document.createElement('div');
                            customElement.innerHTML = customInfo;
                            customElement.style.cssText = `
                                font-size: 12px;
                                color: #666;
                                margin-top: 5px;
                            `;
                            cardContainer.appendChild(customElement);
                        }
                    }
                }

                // Click handler
                cardContainer.addEventListener('click', () => {
                    modalOverlay.remove();
                    resolve(card);
                });

                cardsGrid.appendChild(cardContainer);
            });

            // Cancel button
            if (allowCancel) {
                const cancelButton = document.createElement('button');
                cancelButton.textContent = 'Cancel';
                cancelButton.style.cssText = `
                    margin-top: 20px;
                    padding: 10px 20px;
                    background: #6c757d;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 16px;
                    display: block;
                    margin-left: auto;
                    margin-right: auto;
                `;

                cancelButton.addEventListener('click', () => {
                    modalOverlay.remove();
                    resolve(null);
                });

                modalContent.appendChild(header);
                modalContent.appendChild(cardsGrid);
                modalContent.appendChild(cancelButton);
            } else {
                modalContent.appendChild(header);
                modalContent.appendChild(cardsGrid);
            }

            modalOverlay.appendChild(modalContent);
            document.body.appendChild(modalOverlay);

            // Close on overlay click (outside modal)
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay && allowCancel) {
                    modalOverlay.remove();
                    resolve(null);
                }
            });
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

        // Handle server ability system card selection requests
        this.webSocketClient.on('card_selection_request', (data) => {
            this.handleCardSelectionRequest(data);
        });

        this.webSocketClient.on('game_state_update', (data) => {
            this.handleGameStateUpdate(data);
        });
    }

    // Handle card selection request from server
    async handleCardSelectionRequest(data) {
        console.log('Received card selection request:', data);
        
        try {
            // Convert server card data to format expected by selectCardFromPlayer
            const cards = data.cards.map(card => ({
                ...card,
                cardName: card.cardName || card.name // Ensure compatibility
            }));

            // Show the selection UI
            const selectedCard = await this.selectCardFromPlayer(cards, {
                title: data.options.title,
                subtitle: data.options.subtitle,
                cardDisplayFunction: data.options.cardDisplayFunction ? 
                    eval(`(${data.options.cardDisplayFunction})`) : undefined
            });

            // Send response back to server
            this.webSocketClient.send('card_selection_response', {
                selectionId: data.selectionId,
                selectedCardId: selectedCard ? selectedCard.id : null,
                cancelled: !selectedCard
            });

        } catch (error) {
            console.error('Error handling card selection request:', error);
            
            // Send error response
            this.webSocketClient.send('card_selection_response', {
                selectionId: data.selectionId,
                selectedCardId: null,
                cancelled: true,
                error: error.message
            });
        }
    }

    // Handle game state updates from server
    handleGameStateUpdate(data) {
        console.log('Received game state update:', data);
        
        // Update the local game state
        if (this.game && this.game.displayState) {
            // Merge the update with current state
            Object.assign(this.game.displayState, data);
            
            // Trigger UI refresh
            if (this.game.updateDisplay) {
                this.game.updateDisplay();
            }
        }
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
        
        // Simply return the server-provided card data
        // Since we're using server-driven architecture, cardData should contain everything we need
        if (cardEl.cardData) {
            return cardEl.cardData;
        }
        
        // Legacy support for _cardData
        if (cardEl._cardData) {
            return cardEl._cardData;
        }
        
        // Legacy support for cardInstance (which is now just data)
        if (cardEl.cardInstance) {
            return cardEl.cardInstance;
        }
        
        // If no card data found, return null
        console.warn('No card data found on element:', cardEl);
        return null;
    }

    // Extract display data from a card class instance
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
        console.log('DEBUG: Attached energy in modal:', cardData.attachedEnergy);
        
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

        if (cardData.hp !== undefined && cardData.maxHp !== undefined) {
            const hpDisplay = document.createElement('span');
            const damage = cardData.maxHp - cardData.hp;
            hpDisplay.textContent = damage > 0 ? 
                `${cardData.hp}/${cardData.maxHp} HP` : 
                `HP ${cardData.hp}`;
            hpDisplay.style.cssText = `
                background: ${damage > 0 ? '#ff4444' : '#44aa44'};
                color: white;
                padding: 4px 8px;
                border-radius: 12px;
                font-weight: bold;
                font-size: 14px;
            `;
            cardInfo.appendChild(hpDisplay);
        } else if (cardData.hp) {
            const hpDisplay = document.createElement('span');
            hpDisplay.textContent = `HP ${cardData.hp}`;
            hpDisplay.style.cssText = `
                background: #44aa44;
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
                
                // Check if this attack can be used (if we have the necessary context)
                const canUseAttack = this.canUseAttackInModal(cardEl, cardData, attack);
                const isClickable = canUseAttack && this.isMyTurn();
                
                attackDiv.style.cssText = `
                    padding: 12px;
                    margin: 8px 0;
                    background: ${isClickable ? '#fff3cd' : '#f8f9fa'};
                    border: 1px solid ${isClickable ? '#ffc107' : '#dee2e6'};
                    border-radius: 8px;
                    cursor: ${isClickable ? 'pointer' : 'default'};
                    transition: all 0.2s ease;
                    position: relative;
                `;
                
                if (isClickable) {
                    // Add hover effect
                    attackDiv.addEventListener('mouseenter', () => {
                        attackDiv.style.background = '#fff3a0';
                        attackDiv.style.transform = 'translateY(-1px)';
                        attackDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
                    });
                    
                    attackDiv.addEventListener('mouseleave', () => {
                        attackDiv.style.background = '#fff3cd';
                        attackDiv.style.transform = 'translateY(0)';
                        attackDiv.style.boxShadow = 'none';
                    });
                    
                    // Add click handler to use attack
                    attackDiv.addEventListener('click', () => {
                        this.useAttackFromModal(attack.name, modalOverlay);
                    });
                    
                    // Add click indicator
                    const clickIndicator = document.createElement('div');
                    clickIndicator.textContent = '🎯 Click to use!';
                    clickIndicator.style.cssText = `
                        position: absolute;
                        top: 8px;
                        right: 12px;
                        font-size: 12px;
                        color: #856404;
                        font-weight: bold;
                    `;
                    attackDiv.appendChild(clickIndicator);
                } else if (!canUseAttack) {
                    // Add indicator why attack cannot be used
                    const notUsableIndicator = document.createElement('div');
                    notUsableIndicator.textContent = '❌ Not enough energy';
                    notUsableIndicator.style.cssText = `
                        position: absolute;
                        top: 8px;
                        right: 12px;
                        font-size: 12px;
                        color: #6c757d;
                        font-weight: bold;
                    `;
                    attackDiv.appendChild(notUsableIndicator);
                }

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
            console.log('DEBUG: Modal abilities data:', cardData.abilities);
            const abilitiesSection = document.createElement('div');
            abilitiesSection.innerHTML = '<h3 style="color: #555; margin: 15px 0 10px 0;">Abilities:</h3>';
            
            cardData.abilities.forEach((ability, index) => {
                console.log(`DEBUG: Processing ability ${index}:`, ability);
                const abilityDiv = document.createElement('div');
                
                // Check if this ability can be used
                const canUseAbility = this.canUseAbilityInModal(cardEl, cardData, ability);
                const timingCheck = this.checkAbilityTiming(ability.name);
                const isMyTurnFlag = this.isMyTurn();
                const isClickable = canUseAbility && isMyTurnFlag && timingCheck.canUse;
                
                // Determine background color based on availability
                let backgroundColor, borderColor;
                if (isClickable) {
                    backgroundColor = '#d1f2eb'; // Green for usable
                    borderColor = '#28a745';
                } else if (!timingCheck.canUse) {
                    backgroundColor = '#fff3cd'; // Yellow for timing restricted
                    borderColor = '#ffc107';
                } else {
                    backgroundColor = '#e8f4fd'; // Blue for other restrictions
                    borderColor = '#b3d4fc';
                }
                
                abilityDiv.style.cssText = `
                    padding: 12px;
                    margin: 8px 0;
                    background: ${backgroundColor};
                    border: 1px solid ${borderColor};
                    border-radius: 8px;
                    cursor: ${isClickable ? 'pointer' : 'default'};
                    transition: all 0.2s ease;
                    position: relative;
                `;
                
                if (isClickable) {
                    // Add hover effect
                    abilityDiv.addEventListener('mouseenter', () => {
                        abilityDiv.style.background = '#c3e9d0';
                        abilityDiv.style.transform = 'translateY(-1px)';
                        abilityDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
                    });
                    
                    abilityDiv.addEventListener('mouseleave', () => {
                        abilityDiv.style.background = '#d1f2eb';
                        abilityDiv.style.transform = 'translateY(0)';
                        abilityDiv.style.boxShadow = 'none';
                    });
                    
                    // Add click handler to use ability
                    abilityDiv.addEventListener('click', () => {
                        this.useAbilityFromModal(ability.name, modalOverlay);
                    });
                    
                    // Add click indicator
                    const clickIndicator = document.createElement('div');
                    clickIndicator.textContent = '✨ Click to use!';
                    clickIndicator.style.cssText = `
                        position: absolute;
                        top: 8px;
                        right: 12px;
                        font-size: 12px;
                        color: #155724;
                        font-weight: bold;
                    `;
                    abilityDiv.appendChild(clickIndicator);
                } else {
                    // Add restriction indicator
                    const restrictionIndicator = document.createElement('div');
                    let restrictionText, restrictionColor;
                    
                    if (!isMyTurnFlag) {
                        restrictionText = '⏸️ Not your turn';
                        restrictionColor = '#6c757d';
                    } else if (!timingCheck.canUse) {
                        restrictionText = `⏰ ${timingCheck.reason}`;
                        restrictionColor = '#856404';
                    } else if (!canUseAbility) {
                        restrictionText = '❌ Cannot use';
                        restrictionColor = '#6c757d';
                    } else {
                        restrictionText = '❌ Unavailable';
                        restrictionColor = '#6c757d';
                    }
                    
                    restrictionIndicator.textContent = restrictionText;
                    restrictionIndicator.style.cssText = `
                        position: absolute;
                        top: 8px;
                        right: 12px;
                        font-size: 12px;
                        color: ${restrictionColor};
                        font-weight: bold;
                    `;
                    abilityDiv.appendChild(restrictionIndicator);
                }

                const abilityName = document.createElement('strong');
                abilityName.textContent = ability.name;
                abilityName.style.cssText = `
                    color: ${isClickable ? '#155724' : '#0066cc'};
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

        // Attached Cards section (for Pokemon with attached energy/cards)
        if (cardData.attachedEnergy && cardData.attachedEnergy.length > 0) {
            const attachedSection = document.createElement('div');
            attachedSection.innerHTML = '<h3 style="color: #555; margin: 15px 0 10px 0;">Attached Cards:</h3>';
            
            const attachedContainer = document.createElement('div');
            attachedContainer.style.cssText = `
                padding: 12px;
                background: #f0f8ff;
                border-radius: 8px;
                border: 1px solid #b3d9ff;
                max-height: 200px;
                overflow-y: auto;
            `;
            
            cardData.attachedEnergy.forEach((energy, index) => {
                const attachedCardDiv = document.createElement('div');
                attachedCardDiv.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 8px;
                    margin: 4px 0;
                    background: white;
                    border-radius: 6px;
                    border: 1px solid #d6ebff;
                    cursor: pointer;
                    transition: all 0.2s ease;
                `;
                
                // Add hover effect
                attachedCardDiv.addEventListener('mouseenter', () => {
                    attachedCardDiv.style.background = '#e6f3ff';
                    attachedCardDiv.style.transform = 'translateX(5px)';
                });
                
                attachedCardDiv.addEventListener('mouseleave', () => {
                    attachedCardDiv.style.background = 'white';
                    attachedCardDiv.style.transform = 'translateX(0)';
                });
                
                // Energy type icon
                const energyIcon = this.createEnergyIcon(energy.energyType || energy.type || 'colorless', 24);
                energyIcon.style.cssText += 'flex-shrink: 0;';
                attachedCardDiv.appendChild(energyIcon);
                
                // Card info
                const cardInfo = document.createElement('div');
                cardInfo.style.cssText = 'flex: 1;';
                
                const cardName = document.createElement('div');
                cardName.textContent = energy.cardName || energy.name || `${(energy.energyType || energy.type || 'Colorless').charAt(0).toUpperCase() + (energy.energyType || energy.type || 'colorless').slice(1)} Energy`;
                cardName.style.cssText = `
                    font-weight: bold;
                    color: #333;
                    font-size: 14px;
                `;
                cardInfo.appendChild(cardName);
                
                // Additional energy info if available
                if (energy.description) {
                    const cardDesc = document.createElement('div');
                    cardDesc.textContent = energy.description;
                    cardDesc.style.cssText = `
                        color: #666;
                        font-size: 12px;
                        margin-top: 2px;
                    `;
                    cardInfo.appendChild(cardDesc);
                }
                
                attachedCardDiv.appendChild(cardInfo);
                
                // Card number indicator
                const cardNumber = document.createElement('div');
                cardNumber.textContent = `#${index + 1}`;
                cardNumber.style.cssText = `
                    background: #007bff;
                    color: white;
                    padding: 2px 6px;
                    border-radius: 10px;
                    font-size: 10px;
                    font-weight: bold;
                    flex-shrink: 0;
                `;
                attachedCardDiv.appendChild(cardNumber);
                
                // Click handler to show attached card details
                attachedCardDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showAttachedCardDetails(energy, modalOverlay);
                });
                
                attachedContainer.appendChild(attachedCardDiv);
            });
            
            // Summary info
            const summaryDiv = document.createElement('div');
            summaryDiv.style.cssText = `
                margin-top: 10px;
                padding: 8px;
                background: #e6f3ff;
                border-radius: 6px;
                text-align: center;
                font-size: 12px;
                color: #0066cc;
                font-weight: bold;
            `;
            summaryDiv.textContent = `Total Attached: ${cardData.attachedEnergy.length} card${cardData.attachedEnergy.length !== 1 ? 's' : ''}`;
            attachedContainer.appendChild(summaryDiv);
            
            attachedSection.appendChild(attachedContainer);
            infoSection.appendChild(attachedSection);
        } else if (cardData.hp) {
            // Show a demo/placeholder section for Pokemon cards with no attached energy
            const attachedSection = document.createElement('div');
            attachedSection.innerHTML = '<h3 style="color: #555; margin: 15px 0 10px 0;">Attached Cards:</h3>';
            
            const placeholderContainer = document.createElement('div');
            placeholderContainer.style.cssText = `
                padding: 20px;
                background: #f8f9fa;
                border-radius: 8px;
                border: 1px solid #dee2e6;
                text-align: center;
            `;
            
            const placeholderText = document.createElement('div');
            placeholderText.innerHTML = `
                <div style="color: #666; font-size: 14px; margin-bottom: 8px;">No cards attached</div>
                <div style="color: #999; font-size: 12px;">Drag energy cards to this Pokémon to attach them</div>
            `;
            placeholderContainer.appendChild(placeholderText);
            
            // Add a demo button to test the functionality
            const testButton = document.createElement('button');
            testButton.textContent = 'Add Test Energy (Demo)';
            testButton.style.cssText = `
                margin-top: 10px;
                padding: 6px 12px;
                background: #007bff;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
            `;
            
            testButton.addEventListener('click', (e) => {
                e.stopPropagation();
                // Add test energy data and refresh the modal
                cardData.attachedEnergy = [
                    {
                        energyType: 'fire',
                        cardName: 'Fire Energy',
                        description: 'Provides Fire energy'
                    },
                    {
                        energyType: 'water',
                        cardName: 'Water Energy', 
                        description: 'Provides Water energy'
                    }
                ];
                
                // Close current modal and reopen with updated data
                modalOverlay.remove();
                this.showCardInspectionModal(cardEl, cardData);
            });
            
            placeholderContainer.appendChild(testButton);
            attachedSection.appendChild(placeholderContainer);
            infoSection.appendChild(attachedSection);
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

        // Current Health section (if Pokemon has taken damage)
        if (cardData.hp !== undefined && cardData.maxHp !== undefined && cardData.hp < cardData.maxHp) {
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
            const damageAmount = cardData.maxHp - cardData.hp;
            healthEl.innerHTML = `<strong>Damage:</strong> ${damageAmount} damage (${cardData.hp}/${cardData.maxHp} HP remaining)`;
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

    // Check if an attack can be used from the modal
    canUseAttackInModal(cardEl, cardData, attack) {
        // Only allow attacks from active Pokemon
        if (!cardEl || cardEl.id !== 'ActivePokemon') {
            return false;
        }

        // Check if attack has energy requirements
        if (!attack.energyCost || attack.energyCost.length === 0) {
            return true; // No energy required
        }

        // Check attached energy
        const attachedEnergy = cardData.attachedEnergy || [];
        const energyCount = {};

        // Count attached energy by type
        attachedEnergy.forEach(energy => {
            const type = energy.energyType || energy.type;
            energyCount[type] = (energyCount[type] || 0) + 1;
        });

        // Count required energy by type
        const requiredEnergy = {};
        attack.energyCost.forEach(type => {
            requiredEnergy[type] = (requiredEnergy[type] || 0) + 1;
        });

        // Create a copy of energyCount to track what's been used
        const availableEnergy = { ...energyCount };

        // First, satisfy all non-colorless energy requirements
        for (const [type, required] of Object.entries(requiredEnergy)) {
            if (type !== 'colorless') {
                if ((availableEnergy[type] || 0) < required) {
                    return false; // Not enough specific energy type
                }
                // Use up the specific energy type
                availableEnergy[type] -= required;
            }
        }

        // Now handle colorless energy requirements - can use any remaining energy
        const colorlessRequired = requiredEnergy['colorless'] || 0;
        if (colorlessRequired > 0) {
            const totalRemainingEnergy = Object.values(availableEnergy).reduce((sum, count) => sum + count, 0);
            if (totalRemainingEnergy < colorlessRequired) {
                return false; // Not enough energy for colorless cost
            }
        }

        return true;
    }

    // Check if an ability can be used from the modal
    canUseAbilityInModal(cardEl, cardData, ability) {
        // Check if this is the player's Pokemon (not opponent's)
        // Look for player-zone container or player class
        const isPlayerCard = cardEl && (
            cardEl.classList.contains('player') ||
            cardEl.closest('#player-zone') ||
            cardEl.closest('.player-zone') ||
            cardEl.closest('[id*="player"]') ||
            !cardEl.classList.contains('opp')  // Not opponent's card
        );
        
        if (!isPlayerCard) {
            return false;
        }
        
        // Check if the Pokemon is in a valid position to use abilities
        // Most abilities can be used from active Pokemon or bench
        const isActiveOrBench = cardEl && (
            cardEl.classList.contains('active') ||
            cardEl.classList.contains('benched') ||
            cardEl.closest('.active') ||
            cardEl.closest('.bench')
        );
        
        if (!isActiveOrBench) {
            return false;
        }
        
        // Check for status conditions that prevent ability use
        // Many abilities can't be used if Pokemon is Asleep, Confused, or Paralyzed
        if (cardData.statusConditions && cardData.statusConditions.length > 0) {
            const disablingConditions = ['asleep', 'confused', 'paralyzed'];
            const hasDisablingCondition = cardData.statusConditions.some(condition => 
                disablingConditions.includes(condition.toLowerCase())
            );
            if (hasDisablingCondition) {
                return false;
            }
        }
        
        return true;
    }

    // Check ability timing restrictions (client-side validation for UI)
    checkAbilityTiming(abilityName) {
        // Check if we have game state info for timing validation
        const gameState = this.game?.displayState;
        if (!gameState) {
            return { canUse: true, reason: '' };
        }

        // Check if already attacked this turn (most abilities can't be used after attacking)
        if (gameState.attackedThisTurn && this.abilityRequiresBeforeAttack(abilityName)) {
            return { 
                canUse: false, 
                reason: 'Can only be used before attacking' 
            };
        }

        // Check once-per-turn restrictions
        if (this.isOncePerTurnAbility(abilityName)) {
            const yourState = gameState.yourState;
            if (yourState?.abilitiesUsedThisTurn?.includes?.(abilityName)) {
                return { 
                    canUse: false, 
                    reason: 'Can only be used once per turn' 
                };
            }
        }

        // Check phase restrictions
        if (gameState.phase === 'setup' || gameState.phase === 'end') {
            return { 
                canUse: false, 
                reason: 'Can only be used during main phase' 
            };
        }

        // Check if ability would have an effect
        const effectCheck = this.checkAbilityEffect(abilityName, gameState);
        if (!effectCheck.canUse) {
            return effectCheck;
        }

        return { canUse: true, reason: '' };
    }

    // Check if an ability requires being used before attacking (client-side helper)
    abilityRequiresBeforeAttack(abilityName) {
        const beforeAttackAbilities = [
            'Rain Dance',
            'Damage Swap',
            'Pokemon Power'
        ];
        return beforeAttackAbilities.includes(abilityName);
    }

    // Check if an ability can only be used once per turn (client-side helper)
    isOncePerTurnAbility(abilityName) {
        const oncePerTurnAbilities = [
            'Rain Dance'
        ];
        return oncePerTurnAbilities.includes(abilityName);
    }

    // Check if an ability would have an effect (client-side validation)
    checkAbilityEffect(abilityName, gameState) {
        if (!gameState || !gameState.yourState) {
            return { canUse: true, reason: '' };
        }

        switch (abilityName) {
            case 'Damage Swap':
                return this.checkDamageSwapEffect(gameState.yourState);
            
            case 'Rain Dance':
                return this.checkRainDanceEffect(gameState.yourState);
                
            default:
                // For unknown abilities, assume they can be used
                return { canUse: true, reason: '' };
        }
    }

    // Check if Damage Swap would have an effect (client-side)
    checkDamageSwapEffect(playerState) {
        // Get all player's Pokemon
        const allPokemon = [playerState.activePokemon, ...playerState.bench].filter(card => card !== null);
        
        // Check for damaged Pokemon
        const damagedPokemon = allPokemon.filter(card => {
            return card && 
                   card.hp !== undefined && 
                   card.maxHp !== undefined &&
                   typeof card.hp === 'number' && 
                   typeof card.maxHp === 'number' &&
                   card.hp < card.maxHp;
        });
        
        if (damagedPokemon.length === 0) {
            return { 
                canUse: false, 
                reason: 'No damaged Pokemon to heal' 
            };
        }

        // Check for valid targets (Pokemon that won't be KO'd by receiving 10 damage)
        const validTargets = allPokemon.filter(card => {
            return card && card.hp > 10;
        });

        if (validTargets.length === 0) {
            return { 
                canUse: false, 
                reason: 'No valid targets (all would be KO\'d)' 
            };
        }

        // Need different Pokemon for source and target
        const differentTargets = validTargets.filter(target => !damagedPokemon.includes(target));
        if (damagedPokemon.length > 0 && differentTargets.length === 0 && validTargets.length === damagedPokemon.length) {
            return { 
                canUse: false, 
                reason: 'Would KO the only available targets' 
            };
        }

        return { canUse: true, reason: '' };
    }

    // Check if Rain Dance would have an effect (client-side)
    checkRainDanceEffect(playerState) {
        // Debug: Log hand cards
        console.log('Rain Dance check - Hand cards:', playerState.hand.map(card => ({
            name: card?.name,
            type: card?.type,
            energyType: card?.energyType
        })));

        // Check for Water Energy in hand
        const waterEnergyInHand = playerState.hand.filter(card => {
            return card && card.type === 'energy' && card.energyType === 'water';
        });

        console.log('Rain Dance check - Water energy found:', waterEnergyInHand.length);

        if (waterEnergyInHand.length === 0) {
            return { 
                canUse: false, 
                reason: 'No Water Energy in hand' 
            };
        }

        // Check for Water Pokemon
        const allPokemon = [playerState.activePokemon, ...playerState.bench].filter(card => card !== null);
        const waterPokemon = allPokemon.filter(card => {
            return card && (card.type === 'water' || card.type === 'WATER');
        });

        if (waterPokemon.length === 0) {
            return { 
                canUse: false, 
                reason: 'No Water Pokemon to attach energy to' 
            };
        }

        return { canUse: true, reason: '' };
    }

    // Check if it's currently the player's turn
    isMyTurn() {
        // Check if we have access to turn information from window
        if (window.isMyTurn !== undefined) {
            return window.isMyTurn;
        }
        
        // Check our internal flag
        if (this.myTurnFlag !== undefined) {
            return this.myTurnFlag;
        }
        
        // Fallback: check if action buttons are visible (indicating it's player's turn)
        const actionButtons = document.querySelectorAll('.action-btn');
        return actionButtons.length > 0;
    }

    // Use attack from modal
    useAttackFromModal(attackName, modalOverlay) {
        // Close the modal first
        modalOverlay.remove();
        
        // Use the attack via WebSocket if available
        if (this.webSocketClient && this.webSocketClient.send) {
            console.log(`Using attack from modal: ${attackName}`);
            
            // Check connection status - if not connected, fall back to local/demo execution
            if (!this.webSocketClient.connected) {
                console.warn('WebSocket client not connected - falling back to local demo behavior');
                if (window.showGameMessage) {
                    window.showGameMessage('⚠️ Not connected to server - executing locally', 2000);
                }
                // Finalize locally after short delay to allow any local animation
                setTimeout(() => this.handleLocalAttackFinish(), 600);
                return;
            }
            
            // Check if in a game - if not, fall back to local/demo execution
            if (!this.webSocketClient.gameId) {
                console.warn('WebSocket client has no gameId - falling back to local demo behavior');
                if (window.showGameMessage) {
                    window.showGameMessage('⚠️ Not in a networked game - executing locally', 2000);
                }
                setTimeout(() => this.handleLocalAttackFinish(), 600);
                return;
            }
            
            // Check if it's the player's turn
            const currentTurnState = this.isMyTurn();
            console.log('DEBUG: Attack attempt turn check:', {
                isMyTurn: currentTurnState,
                windowIsMyTurn: window.isMyTurn,
                myTurnFlag: this.myTurnFlag,
                actionButtonsVisible: document.querySelectorAll('.action-btn').length > 0
            });
            
            if (!currentTurnState) {
                console.error('Not player\'s turn');
                if (window.showGameMessage) {
                    window.showGameMessage('❌ Not your turn!', 2000);
                }
                return;
            }
            
            const success = this.webSocketClient.send('use_attack', { attackName: attackName });

            if (success) {
                // Show feedback message
                if (window.showGameMessage) {
                    window.showGameMessage(`⚔️ Using ${attackName}...`, 2000);
                }

                // If this client is running in single-player/local mode (no multiplayer), finalize the attack locally
                // Also, if for any reason the websocket exists but we're treating this as a demo, ensure local finalization
                if (!this.isMultiplayer) {
                    // Allow animations to play then end the turn
                    setTimeout(() => this.handleLocalAttackFinish(), 600);
                }
            } else {
                // Sending failed - notify user and fall back to local execution so demo doesn't hang
                console.warn('WebSocket send failed - falling back to local demo behavior');
                if (window.showGameMessage) {
                    window.showGameMessage('⚠️ Failed to send to server - executing locally', 2000);
                }
                setTimeout(() => this.handleLocalAttackFinish(), 600);
            }
        } else {
            // No websocket available — assume local/demo mode: immediately finalize attack and end turn
            console.log('Local attack execution (no WebSocket)');
            if (window.showGameMessage) {
                window.showGameMessage(`⚔️ Using ${attackName}...`, 1200);
            }
            setTimeout(() => this.handleLocalAttackFinish(), 600);
        }
    }

    // Handle finishing an attack in local/demo mode: disable further interactions and advance turn
    handleLocalAttackFinish() {
        console.log('handleLocalAttackFinish called — finalizing local attack and ending turn');

        // Disable drag/interactions for this player
        this.setDragEnabled(false, 'Ended turn after attack');

        // If there's a linked Game instance, ask it to advance the turn locally
        if (this.game && typeof this.game.advanceTurnLocal === 'function') {
            try {
                this.game.advanceTurnLocal();
            } catch (err) {
                console.error('Error advancing local turn:', err);
            }
        } else {
            // Fallback: set internal flag
            this.myTurnFlag = false;
        }
    }

    // Use ability from modal
    useAbilityFromModal(abilityName, modalOverlay) {
        // Close the modal first
        modalOverlay.remove();
        
        // Try server-side execution first if connected
        if (this.webSocketClient && this.webSocketClient.send) {
            console.log(`Using ability from modal: ${abilityName}`);
            
            // Check connection status - if not connected, fall back to local/demo execution
            if (!this.webSocketClient.connected) {
                console.warn('WebSocket client not connected - falling back to local demo behavior for ability');
                if (window.showGameMessage) {
                    window.showGameMessage('⚠️ Not connected to server - executing ability locally', 2000);
                }
                // For now, just show message (local ability execution could be added later)
                setTimeout(() => {
                    if (window.showGameMessage) {
                        window.showGameMessage(`✨ ${abilityName} used locally!`, 1500);
                    }
                }, 600);
                return;
            }
            
            // Check if in a game - if not, fall back to local/demo execution
            if (!this.webSocketClient.gameId) {
                console.warn('WebSocket client has no gameId - falling back to local demo behavior for ability');
                if (window.showGameMessage) {
                    window.showGameMessage('⚠️ Not in a networked game - executing ability locally', 2000);
                }
                setTimeout(() => {
                    if (window.showGameMessage) {
                        window.showGameMessage(`✨ ${abilityName} used locally!`, 1500);
                    }
                }, 600);
                return;
            }
            
            // Check if it's the player's turn
            const currentTurnState = this.isMyTurn();
            if (!currentTurnState) {
                console.error('Not player\'s turn for ability');
                if (window.showGameMessage) {
                    window.showGameMessage('❌ Not your turn!', 2000);
                }
                return;
            }
            
            const success = this.webSocketClient.send('use_ability', { abilityName: abilityName });

            if (success) {
                // Show feedback message
                if (window.showGameMessage) {
                    window.showGameMessage(`✨ Using ${abilityName}...`, 2000);
                }
            } else {
                // Sending failed - notify user and fall back to local execution
                console.warn('WebSocket send failed - falling back to local demo behavior for ability');
                if (window.showGameMessage) {
                    window.showGameMessage('⚠️ Failed to send to server - executing ability locally', 2000);
                }
                setTimeout(() => {
                    if (window.showGameMessage) {
                        window.showGameMessage(`✨ ${abilityName} used locally!`, 1500);
                    }
                }, 600);
            }
        } else if (window.wsClient && window.wsClient.send) {
            // Fallback to legacy wsClient (for multiplayerTest.html compatibility)
            console.log(`Using ability from modal via legacy wsClient: ${abilityName}`);
            window.wsClient.send('use_ability', { abilityName: abilityName });
            
            // Show feedback message
            if (window.showGameMessage) {
                window.showGameMessage(`✨ Using ${abilityName}...`, 2000);
            }
        } else {
            // No websocket available — assume local/demo mode
            console.log('Local ability execution (no WebSocket)');
            if (window.showGameMessage) {
                window.showGameMessage(`✨ Using ${abilityName} (local mode)...`, 1200);
            }
            setTimeout(() => {
                if (window.showGameMessage) {
                    window.showGameMessage(`✨ ${abilityName} used successfully!`, 1500);
                }
            }, 600);
        }
    }

    // Generic method to get a card selection from the player
    async selectCardFromPlayer(cards, options = {}) {
        if (!cards || cards.length === 0) {
            return null;
        }

        // Use the generic card selection menu
        return await this.showCardSelectionMenu(cards, options);
    }

    // Client-side ability handlers registry
    getClientSideAbilityHandlers() {
        const handlers = {};
        for (const [abilityName, handler] of this.clientSideAbilityHandlers) {
            handlers[abilityName] = async () => {
                return await this.executeGenericAbility(abilityName, handler);
            };
        }
        // Fallback to legacy handlers if no registered handlers exist
        if (this.clientSideAbilityHandlers.size === 0) {
            return {
                'Damage Swap': async () => {
                    return await this.handleDamageSwapClientSide();
                },
                'Rain Dance': async () => {
                    return await this.handleRainDanceClientSide();
                }
            };
        }
        return handlers;
    }

    // Load default ability handlers (can be moved to external files later)
    loadDefaultAbilityHandlers() {
        // Try to import and register abilities from Cards.js
        this.loadCardAbilities();
        
        // Fallback: Register legacy abilities if card abilities aren't available
        if (this.clientSideAbilityHandlers.size === 0) {
            this.registerLegacyAbilities();
        }
    }

    async loadCardAbilities() {
        try {
            // Dynamic import to avoid circular dependencies
            const { AbilityRegistry } = await import('./Cards/Base/Base1/Cards.js');
            // Set this instance as the GUIHookUtils for the registry
            AbilityRegistry.setGUIHookUtils(this);
            console.log('Successfully loaded abilities from Cards.js');
        } catch (error) {
            console.warn('Could not load abilities from Cards.js:', error);
            // Fall back to legacy system
        }
    }

    registerLegacyAbilities() {
        // Legacy fallback abilities (can be removed once card-based system is stable)
        this.registerAbilityHandler('Damage Swap', {
            validator: async (gameState) => this.validateDamageSwapAbility(gameState),
            executor: async (gameState, context) => this.executeDamageSwapAbility(gameState, context),
            components: {
                targetSelector: (targets) => this.selectCardFromPlayer(targets, {
                    title: 'Damage Swap',
                    subtitle: 'Choose Pokémon to swap damage between:',
                    cardDisplayFunction: (card) => {
                        const damage = card.maxHp - card.hp;
                        return damage > 0 ? `${damage} damage` : 'No damage';
                    }
                })
            }
        });

        this.registerAbilityHandler('Rain Dance', {
            validator: async (gameState) => this.validateRainDanceAbility(gameState),
            executor: async (gameState, context) => this.executeRainDanceAbility(gameState, context),
            components: {
                energyFilter: (hand) => hand.filter(card => card && card.type === 'energy' && card.energyType === 'water'),
                pokemonFilter: (allPokemon, sourceId) => allPokemon.filter(card => {
                    if (!card || !(card.type === 'water' || card.pokemonType === 'water')) return false;
                    return card.id !== sourceId;
                }),
                targetSelector: (targets) => this.selectCardFromPlayer(targets, {
                    title: 'Rain Dance - Attach Water Energy',
                    subtitle: 'Choose a Water Pokémon to attach a Water Energy card to:',
                    cardDisplayFunction: (card) => {
                        const energyCount = card.attachedEnergy ? card.attachedEnergy.length : 0;
                        return `Currently has ${energyCount} energy card${energyCount !== 1 ? 's' : ''}`;
                    }
                })
            }
        });
    }

    // Register a new ability handler
    registerAbilityHandler(abilityName, handler) {
        if (!handler.validator || !handler.executor) {
            throw new Error(`Ability handler for '${abilityName}' must have validator and executor functions`);
        }
        this.clientSideAbilityHandlers.set(abilityName, handler);
        if (handler.components) {
            this.abilityComponents.set(abilityName, handler.components);
        }
    }

    // Generic ability execution framework
    async executeGenericAbility(abilityName, handler) {
        try {
            // Get current game state
            const gameState = this.game?.displayState;
            if (!gameState || !gameState.yourState) {
                return { success: false, error: 'Cannot get game state' };
            }

            // Validate the ability can be used
            const validation = await handler.validator(gameState);
            if (!validation.valid) {
                return { success: false, error: validation.reason };
            }

            // Execute the ability with context
            const context = {
                gameState,
                components: this.abilityComponents.get(abilityName) || {},
                webSocketClient: this.webSocketClient,
                isMultiplayer: this.isMultiplayer
            };

            return await handler.executor(gameState, context);

        } catch (error) {
            console.error(`Error in generic ability execution for ${abilityName}:`, error);
            return { success: false, error: 'Unexpected error during ability execution' };
        }
    }

    // Check if an ability has a client-side handler
    hasClientSideAbilityHandler(abilityName) {
        const handlers = this.getClientSideAbilityHandlers();
        return handlers.hasOwnProperty(abilityName);
    }

    // Execute ability client-side using registered handler
    async executeClientSideAbility(abilityName) {
        const handlers = this.getClientSideAbilityHandlers();
        const handler = handlers[abilityName];
        
        if (!handler) {
            console.error(`No client-side handler found for ability: ${abilityName}`);
            if (window.showGameMessage) {
                window.showGameMessage(`❌ ${abilityName} handler not found`, 2000);
            }
            return;
        }

        try {
            if (window.showGameMessage) {
                window.showGameMessage(`✨ Using ${abilityName}...`, 1000);
            }
            
            const result = await handler();
            
            if (result && result.success) {
                if (window.showGameMessage) {
                    window.showGameMessage(`✨ ${abilityName} used successfully!`, 2000);
                }
            } else if (result && result.error) {
                if (window.showGameMessage) {
                    window.showGameMessage(`❌ ${result.error}`, 2000);
                }
            }
            
            return result;
            
        } catch (error) {
            console.error(`Error executing client-side ability ${abilityName}:`, error);
            if (window.showGameMessage) {
                window.showGameMessage(`❌ Error using ${abilityName}`, 2000);
            }
        }
    }

    // Handle Damage Swap ability client-side
    async handleDamageSwapClientSide() {
        try {
            // Get current game state
            const gameState = this.game?.displayState;
            if (!gameState || !gameState.yourState) {
                return { success: false, error: 'Cannot get game state' };
            }

            const allPokemon = [gameState.yourState.activePokemon, ...gameState.yourState.bench].filter(card => card !== null);
            
            // Find damaged Pokemon
            const damagedPokemon = allPokemon.filter(card => 
                card && card.hp < card.maxHp
            );

            if (damagedPokemon.length === 0) {
                return { success: false, error: 'No damaged Pokemon to move damage from' };
            }

            // Select source Pokemon
            const sourceTarget = await this.selectCardFromPlayer(damagedPokemon, {
                title: 'Damage Swap - Select Source',
                subtitle: 'Choose a damaged Pokémon to move 1 damage counter from:',
                cardDisplayFunction: (card) => {
                    const damage = card.maxHp - card.hp;
                    return `${damage / 10} damage counter${damage > 10 ? 's' : ''}`;
                }
            });

            if (!sourceTarget) {
                return { success: false, error: 'No source selected' };
            }

            // Find valid damage targets
            const damageTargets = allPokemon.filter(card => 
                card && card !== sourceTarget && card.hp > 10
            );

            if (damageTargets.length === 0) {
                return { success: false, error: 'No valid targets to move damage to' };
            }

            // Select target Pokemon
            const damageTarget = await this.selectCardFromPlayer(damageTargets, {
                title: 'Damage Swap - Select Target',
                subtitle: `Move 1 damage counter from ${sourceTarget.cardName} to:`,
                cardDisplayFunction: (card) => {
                    const hpAfterDamage = card.hp - 10;
                    return `Will have ${hpAfterDamage}/${card.maxHp} HP after receiving damage`;
                }
            });

            if (!damageTarget) {
                return { success: false, error: 'No target selected' };
            }

            // Execute the damage swap locally
            sourceTarget.hp = Math.min(sourceTarget.hp + 10, sourceTarget.maxHp);
            damageTarget.hp = Math.max(damageTarget.hp - 10, 0);

            // Update visual elements if available
            const sourceEl = document.querySelector(`[data-card-id="${sourceTarget.id}"]`);
            const targetEl = document.querySelector(`[data-card-id="${damageTarget.id}"]`);
            
            if (sourceEl) this.updateCardVisualHP(sourceEl, sourceTarget);
            if (targetEl) this.updateCardVisualHP(targetEl, damageTarget);

            return { 
                success: true, 
                message: `Moved 1 damage counter from ${sourceTarget.cardName} to ${damageTarget.cardName}` 
            };

        } catch (error) {
            console.error('Error in client-side Damage Swap:', error);
            return { success: false, error: 'Unexpected error during ability execution' };
        }
    }

    // Handle Rain Dance ability client-side
    async handleRainDanceClientSide() {
        try {
            // Get current game state
            const gameState = this.game?.displayState;
            if (!gameState || !gameState.yourState) {
                return { success: false, error: 'Cannot get game state' };
            }

            // Debug: Log hand cards
            console.log('Rain Dance execution - Hand cards:', gameState.yourState.hand.map(card => ({
                name: card?.name,
                type: card?.type,
                energyType: card?.energyType
            })));

            // Find Water Energy in hand
            const waterEnergyInHand = gameState.yourState.hand.filter(card => 
                card && card.type === 'energy' && card.energyType === 'water'
            );

            console.log('Rain Dance execution - Water energy found:', waterEnergyInHand.length);

            if (waterEnergyInHand.length === 0) {
                return { success: false, error: 'No Water Energy cards in hand' };
            }

            // Find Water Pokemon (excluding the specific Pokemon using the ability)
            const allPokemon = [gameState.yourState.activePokemon, ...gameState.yourState.bench].filter(card => card !== null);
            
            console.log('Rain Dance - All Pokemon:', allPokemon.map(card => ({
                id: card?.id,
                name: card?.name,
                cardName: card?.cardName,
                type: card?.type,
                pokemonType: card?.pokemonType
            })));
            
            // For now, assume the active Pokemon is using Rain Dance (abilities are typically used by active Pokemon)
            // In the future, we could pass the source Pokemon ID to the ability handler
            const sourcePokemanId = gameState.yourState.activePokemon?.id;
            
            const waterPokemon = allPokemon.filter(card => {
                if (!card || !(card.type === 'water' || card.pokemonType === 'water')) {
                    return false;
                }
                
                // Exclude the specific Pokemon using the ability by UUID
                if (card.id === sourcePokemanId) {
                    console.log(`Rain Dance - Excluding source Pokemon: ${card.name || card.cardName} (ID: ${card.id})`);
                    return false;
                }
                
                return true;
            });

            console.log('Rain Dance - Valid Water Pokemon targets:', waterPokemon.length);

            if (waterPokemon.length === 0) {
                return { success: false, error: 'No other Water Pokemon to attach energy to' };
            }

            // Select target Pokemon
            const target = await this.selectCardFromPlayer(waterPokemon, {
                title: 'Rain Dance - Attach Water Energy',
                subtitle: 'Choose a Water Pokémon to attach a Water Energy card to:',
                cardDisplayFunction: (card) => {
                    const energyCount = card.attachedEnergy ? card.attachedEnergy.length : 0;
                    return `Currently has ${energyCount} energy card${energyCount !== 1 ? 's' : ''}`;
                }
            });

            if (!target) {
                return { success: false, error: 'No target selected' };
            }

            // Send the energy attachment to the server
            const energyCard = waterEnergyInHand[0];
            const handIndex = gameState.yourState.hand.indexOf(energyCard);
            
            if (handIndex === -1) {
                return { success: false, error: 'Could not find energy card in hand' };
            }

            // Find the target Pokemon's position
            let targetIndex;
            if (target === gameState.yourState.activePokemon) {
                targetIndex = 'active';
            } else {
                const benchIndex = gameState.yourState.bench.indexOf(target);
                if (benchIndex !== -1) {
                    targetIndex = benchIndex.toString();
                } else {
                    return { success: false, error: 'Could not find target Pokemon position' };
                }
            }

            // Send the card move to the server if we're in multiplayer
            if (this.isMultiplayer && this.webSocketClient) {
                const cardData = {
                    id: energyCard.id,
                    name: energyCard.name,
                    cardName: energyCard.name,
                    type: energyCard.type,
                    energyType: energyCard.energyType,
                    imgUrl: energyCard.imgUrl
                };
                
                this.webSocketClient.sendCardMove('hand', handIndex, 'attach', targetIndex, cardData);
                
                return { 
                    success: true, 
                    message: `Rain Dance: Attaching Water Energy to ${target.name || target.cardName}` 
                };
            } else {
                // Local game mode - modify the state directly
                gameState.yourState.hand.splice(handIndex, 1);
                
                if (!target.attachedEnergy) {
                    target.attachedEnergy = [];
                }
                target.attachedEnergy.push(energyCard);
                
                return { 
                    success: true, 
                    message: `Attached Water Energy to ${target.name || target.cardName}` 
                };
            }

        } catch (error) {
            console.error('Error in client-side Rain Dance:', error);
            return { success: false, error: 'Unexpected error during ability execution' };
        }
    }

    // Helper method to update card visual HP
    updateCardVisualHP(cardEl, cardData) {
        // Update any HP displays on the card element
        const hpElements = cardEl.querySelectorAll('.hp-display, .health-display');
        hpElements.forEach(el => {
            if (cardData.maxHp) {
                el.textContent = `${cardData.hp}/${cardData.maxHp} HP`;
            } else {
                el.textContent = `${cardData.hp} HP`;
            }
        });
    }

    // Show detailed information about an attached card
    showAttachedCardDetails(attachedCardData, parentModal) {
        // Create a smaller overlay modal for the attached card
        const detailOverlay = document.createElement('div');
        detailOverlay.className = 'attached-card-detail-overlay';
        detailOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1001;
            backdrop-filter: blur(3px);
        `;

        const detailContent = document.createElement('div');
        detailContent.className = 'attached-card-detail-content';
        detailContent.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 20px;
            max-width: 400px;
            max-height: 80vh;
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.4);
            position: relative;
            overflow-y: auto;
        `;

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = `
            position: absolute;
            top: 10px;
            right: 15px;
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #666;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: all 0.2s ease;
        `;
        
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.background = '#f0f0f0';
            closeBtn.style.color = '#333';
        });
        
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.background = 'none';
            closeBtn.style.color = '#666';
        });
        
        closeBtn.addEventListener('click', () => {
            detailOverlay.remove();
        });
        
        detailContent.appendChild(closeBtn);

        // Card header
        const cardHeader = document.createElement('div');
        cardHeader.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #ddd;
        `;

        // Energy icon
        const energyIcon = this.createEnergyIcon(attachedCardData.energyType || attachedCardData.type || 'colorless', 32);
        cardHeader.appendChild(energyIcon);

        // Card name
        const cardName = document.createElement('h3');
        cardName.textContent = attachedCardData.cardName || attachedCardData.name || 
            `${(attachedCardData.energyType || attachedCardData.type || 'Colorless').charAt(0).toUpperCase() + 
             (attachedCardData.energyType || attachedCardData.type || 'colorless').slice(1)} Energy`;
        cardName.style.cssText = `
            margin: 0;
            color: #333;
            font-size: 18px;
            flex: 1;
        `;
        cardHeader.appendChild(cardName);

        detailContent.appendChild(cardHeader);

        // Card type
        const cardType = document.createElement('div');
        cardType.style.cssText = `
            margin-bottom: 15px;
        `;
        
        const typeLabel = document.createElement('strong');
        typeLabel.textContent = 'Type: ';
        typeLabel.style.color = '#555';
        cardType.appendChild(typeLabel);
        
        const typeValue = document.createElement('span');
        typeValue.textContent = `${(attachedCardData.energyType || attachedCardData.type || 'Colorless')} Energy`;
        typeValue.style.cssText = `
            background: #e3f2fd;
            color: #1976d2;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
        `;
        cardType.appendChild(typeValue);
        
        detailContent.appendChild(cardType);

        // Description (if available)
        if (attachedCardData.description) {
            const descSection = document.createElement('div');
            descSection.style.cssText = `
                margin-bottom: 15px;
            `;
            
            const descLabel = document.createElement('h4');
            descLabel.textContent = 'Description:';
            descLabel.style.cssText = `
                margin: 0 0 8px 0;
                color: #555;
                font-size: 14px;
            `;
            descSection.appendChild(descLabel);
            
            const descText = document.createElement('div');
            descText.textContent = attachedCardData.description;
            descText.style.cssText = `
                padding: 10px;
                background: #f8f9fa;
                border-radius: 6px;
                border: 1px solid #dee2e6;
                color: #333;
                font-size: 13px;
                line-height: 1.4;
            `;
            descSection.appendChild(descText);
            
            detailContent.appendChild(descSection);
        }

        // Energy value/effect
        const energyInfo = document.createElement('div');
        energyInfo.style.cssText = `
            margin-bottom: 15px;
            padding: 12px;
            background: #fff3cd;
            border-radius: 6px;
            border: 1px solid #ffeaa7;
        `;
        
        const energyLabel = document.createElement('h4');
        energyLabel.textContent = 'Energy Provided:';
        energyLabel.style.cssText = `
            margin: 0 0 8px 0;
            color: #856404;
            font-size: 14px;
        `;
        energyInfo.appendChild(energyLabel);
        
        const energyValue = document.createElement('div');
        energyValue.innerHTML = `Provides 1 ${(attachedCardData.energyType || attachedCardData.type || 'Colorless')} energy for attacks and abilities`;
        energyValue.style.cssText = `
            color: #856404;
            font-size: 13px;
            font-weight: 500;
        `;
        energyInfo.appendChild(energyValue);
        
        detailContent.appendChild(energyInfo);

        // Additional properties (if any)
        if (attachedCardData.special || attachedCardData.properties) {
            const propsSection = document.createElement('div');
            propsSection.style.cssText = `
                margin-bottom: 15px;
            `;
            
            const propsLabel = document.createElement('h4');
            propsLabel.textContent = 'Special Properties:';
            propsLabel.style.cssText = `
                margin: 0 0 8px 0;
                color: #555;
                font-size: 14px;
            `;
            propsSection.appendChild(propsLabel);
            
            const propsList = document.createElement('ul');
            propsList.style.cssText = `
                margin: 0;
                padding-left: 20px;
                color: #333;
                font-size: 13px;
            `;
            
            if (attachedCardData.special) {
                const li = document.createElement('li');
                li.textContent = attachedCardData.special;
                propsList.appendChild(li);
            }
            
            if (attachedCardData.properties) {
                attachedCardData.properties.forEach(prop => {
                    const li = document.createElement('li');
                    li.textContent = prop;
                    propsList.appendChild(li);
                });
            }
            
            propsSection.appendChild(propsList);
            detailContent.appendChild(propsSection);
        }

        detailOverlay.appendChild(detailContent);

        // Close on overlay click
        detailOverlay.addEventListener('click', (e) => {
            if (e.target === detailOverlay) {
                detailOverlay.remove();
            }
        });

        // Close on Escape key
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                detailOverlay.remove();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);

        // Add to page
        document.body.appendChild(detailOverlay);
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

    // Clean up any orphaned energy displays that might be causing visual/collision issues
    cleanupOrphanedEnergyDisplays() {
        console.log('🧹 Cleaning up orphaned energy displays...');
        
        // Find all energy displays on the board
        const allEnergyDisplays = document.querySelectorAll('.attached-energy-display, .energy-display');
        console.log(`Found ${allEnergyDisplays.length} energy displays to check`);
        
        let removedCount = 0;
        
        allEnergyDisplays.forEach((display, index) => {
            const parentCard = display.closest('.card');
            console.log(`Checking energy display ${index + 1}:`, {
                hasParentCard: !!parentCard,
                parentCardId: parentCard?.id,
                parentCardClasses: parentCard?.className
            });
            
            if (!parentCard) {
                // Orphaned display not attached to a card - remove it
                console.log('❌ Removing orphaned energy display (no parent card):', display);
                display.remove();
                removedCount++;
            } else {
                // Check if the parent card actually has attached energy data
                const cardData = this.getCardDataFromElement ? this.getCardDataFromElement(parentCard) : (parentCard.cardData || parentCard._cardData);
                console.log(`Parent card data:`, {
                    hasCardData: !!cardData,
                    hasAttachedEnergy: !!(cardData?.attachedEnergy),
                    attachedEnergyCount: cardData?.attachedEnergy?.length || 0,
                    cardName: cardData?.cardName
                });
                
                if (!cardData || !cardData.attachedEnergy || cardData.attachedEnergy.length === 0) {
                    // Card has no attached energy but still has display - remove it
                    console.log('❌ Removing invalid energy display from card without attached energy:', display);
                    display.remove();
                    removedCount++;
                } else {
                    console.log('✅ Energy display is valid, keeping it');
                }
            }
        });
        
        console.log(`🧹 Cleanup complete: removed ${removedCount} orphaned/invalid energy displays`);
        
        // Additional cleanup: check empty card slots for leftover energy displays
        const emptySlots = document.querySelectorAll('.card.empty, .card[style*="background-image: none"], .card[style=""]');
        emptySlots.forEach(slot => {
            const energyDisplays = slot.querySelectorAll('.attached-energy-display, .energy-display');
            if (energyDisplays.length > 0) {
                console.log(`❌ Found ${energyDisplays.length} energy displays in empty slot, removing:`, slot);
                energyDisplays.forEach(display => {
                    display.remove();
                    removedCount++;
                });
            }
        });
        
        if (removedCount > 0) {
            console.log(`🧹 Final cleanup: removed ${removedCount} total orphaned energy displays`);
        }
    }

    // Update the visual display of attached energy for a Pokemon
    updatePokemonEnergyDisplay(pokemonEl) {
        // Get the Pokemon's card data to check attached energy
        const cardData = this.getCardDataFromElement(pokemonEl);
        
        // Remove existing energy display (both class names)
        const existingEnergyDisplay1 = pokemonEl.querySelector('.energy-display');
        if (existingEnergyDisplay1) {
            existingEnergyDisplay1.remove();
        }
        const existingEnergyDisplay2 = pokemonEl.querySelector('.attached-energy-display');
        if (existingEnergyDisplay2) {
            existingEnergyDisplay2.remove();
        }
        
        // Create new energy display if there's attached energy
        if (cardData && cardData.attachedEnergy && cardData.attachedEnergy.length > 0) {
            const energyDisplay = document.createElement('div');
            energyDisplay.className = 'attached-energy-display';
            energyDisplay.style.cssText = `
                position: absolute;
                bottom: 4px;
                right: 4px;
                display: flex;
                flex-wrap: wrap;
                gap: 2px;
                pointer-events: auto;
                z-index: 5;
                background: rgba(0,0,0,0.7);
                padding: 2px 4px;
                border-radius: 4px;
                max-width: 80%;
            `;
            
            // Count energy by type
            const energyCount = {};
            cardData.attachedEnergy.forEach(energy => {
                const type = energy.energyType || energy.type;
                energyCount[type] = (energyCount[type] || 0) + 1;
            });
            
            // Create tooltip text
            const tooltipText = Object.entries(energyCount)
                .map(([type, count]) => `${count}x ${type.charAt(0).toUpperCase() + type.slice(1)}`)
                .join(', ');
            
            energyDisplay.title = `Attached Energy: ${tooltipText} (Total: ${cardData.attachedEnergy.length})`;
            
            // Add energy icons with count
            Object.entries(energyCount).forEach(([type, count]) => {
                const energyContainer = document.createElement('div');
                energyContainer.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 1px;
                `;
                
                const energyIcon = this.createEnergyIcon(type, 14);
                energyContainer.appendChild(energyIcon);
                
                if (count > 1) {
                    const countLabel = document.createElement('span');
                    countLabel.textContent = count;
                    countLabel.style.cssText = `
                        color: white;
                        font-size: 10px;
                        font-weight: bold;
                        text-shadow: 1px 1px 1px black;
                    `;
                    energyContainer.appendChild(countLabel);
                }
                
                energyDisplay.appendChild(energyContainer);
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
                // For energy attachment rollback, we need to:
                // 1. Remove the attached energy from local data
                // 2. Reset the energy attachment flag
                // 3. Remove visual energy display
                
                console.log('Rolling back energy attachment');
                
                // Reset energy attachment flag since the server rejected it
                if (this.player1 && this.player1.attachedEnergyThisTurn) {
                    console.log('Resetting energy attachment flag due to rollback');
                    this.player1.attachedEnergyThisTurn = false;
                }
                
                // Remove attached energy from target Pokemon's data
                if (targetEl.cardData && targetEl.cardData.attachedEnergy) {
                    // Remove the last attached energy (most recent one)
                    targetEl.cardData.attachedEnergy.pop();
                    console.log('Removed last attached energy from card data');
                }
                
                // Update visual display to reflect the rollback
                this.updateAttachedEnergyDisplay(targetEl, targetEl.cardData || {});
                
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

    // === GENERIC ABILITY IMPLEMENTATIONS ===
    
    // Damage Swap validation
    async validateDamageSwapAbility(gameState) {
        const allPokemon = [gameState.yourState.activePokemon, ...gameState.yourState.bench].filter(card => card !== null);
        const damagedPokemon = allPokemon.filter(card => card && card.hp < card.maxHp);
        
        if (damagedPokemon.length === 0) {
            return { valid: false, reason: 'No damaged Pokemon to move damage from' };
        }
        
        return { valid: true };
    }

    // Damage Swap execution
    async executeDamageSwapAbility(gameState, context) {
        const allPokemon = [gameState.yourState.activePokemon, ...gameState.yourState.bench].filter(card => card !== null);
        const damagedPokemon = allPokemon.filter(card => card && card.hp < card.maxHp);

        // Select Pokemon to move damage from
        const sourceTarget = await context.components.targetSelector(damagedPokemon);
        if (!sourceTarget) {
            return { success: false, error: 'No source Pokemon selected' };
        }

        // Select Pokemon to move damage to
        const destinationTarget = await context.components.targetSelector(allPokemon.filter(p => p !== sourceTarget));
        if (!destinationTarget) {
            return { success: false, error: 'No destination Pokemon selected' };
        }

        // For now, this is a simplified implementation
        // In a full implementation, you'd send this to the server
        console.log(`Damage Swap: Moving damage from ${sourceTarget.name || sourceTarget.cardName} to ${destinationTarget.name || destinationTarget.cardName}`);
        
        return { 
            success: true, 
            message: `Damage Swap used between ${sourceTarget.name || sourceTarget.cardName} and ${destinationTarget.name || destinationTarget.cardName}` 
        };
    }

    // Rain Dance validation
    async validateRainDanceAbility(gameState) {
        const waterEnergyInHand = gameState.yourState.hand.filter(card => 
            card && card.type === 'energy' && card.energyType === 'water'
        );

        if (waterEnergyInHand.length === 0) {
            return { valid: false, reason: 'No Water Energy in hand' };
        }

        const allPokemon = [gameState.yourState.activePokemon, ...gameState.yourState.bench].filter(card => card !== null);
        const sourceId = gameState.yourState.activePokemon?.id;
        const validTargets = allPokemon.filter(card => {
            if (!card || !(card.type === 'water' || card.pokemonType === 'water')) return false;
            return card.id !== sourceId;
        });

        if (validTargets.length === 0) {
            return { valid: false, reason: 'No other Water Pokemon to attach energy to' };
        }

        return { valid: true };
    }

    // Rain Dance execution
    async executeRainDanceAbility(gameState, context) {
        const waterEnergyInHand = context.components.energyFilter(gameState.yourState.hand);
        if (waterEnergyInHand.length === 0) {
            return { success: false, error: 'No Water Energy cards in hand' };
        }

        const allPokemon = [gameState.yourState.activePokemon, ...gameState.yourState.bench].filter(card => card !== null);
        const sourceId = gameState.yourState.activePokemon?.id;
        const waterPokemon = context.components.pokemonFilter(allPokemon, sourceId);

        if (waterPokemon.length === 0) {
            return { success: false, error: 'No other Water Pokemon to attach energy to' };
        }

        // Select target Pokemon
        const target = await context.components.targetSelector(waterPokemon);
        if (!target) {
            return { success: false, error: 'No target selected' };
        }

        // Execute the energy attachment
        const energyCard = waterEnergyInHand[0];
        const handIndex = gameState.yourState.hand.indexOf(energyCard);
        
        if (handIndex === -1) {
            return { success: false, error: 'Could not find energy card in hand' };
        }

        // Find target position
        let targetIndex;
        if (target === gameState.yourState.activePokemon) {
            targetIndex = 'active';
        } else {
            const benchIndex = gameState.yourState.bench.indexOf(target);
            if (benchIndex !== -1) {
                targetIndex = benchIndex.toString();
            } else {
                return { success: false, error: 'Could not find target Pokemon position' };
            }
        }

        // Send to server or execute locally
        if (context.isMultiplayer && context.webSocketClient) {
            const cardData = {
                id: energyCard.id,
                name: energyCard.name,
                cardName: energyCard.name,
                type: energyCard.type,
                energyType: energyCard.energyType,
                imgUrl: energyCard.imgUrl
            };
            
            context.webSocketClient.sendCardMove('hand', handIndex, 'attach', targetIndex, cardData);
            
            return { 
                success: true, 
                message: `Rain Dance: Attaching Water Energy to ${target.name || target.cardName}` 
            };
        } else {
            // Local execution
            gameState.yourState.hand.splice(handIndex, 1);
            if (!target.attachedEnergy) {
                target.attachedEnergy = [];
            }
            target.attachedEnergy.push(energyCard);
            
            return { 
                success: true, 
                message: `Attached Water Energy to ${target.name || target.cardName}` 
            };
        }
    }
}
export default GUIHookUtils;