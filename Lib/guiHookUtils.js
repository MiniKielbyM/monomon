class GUIHookUtils {
    constructor(domElement, webSocketClient = null) {
        this.domElement = domElement;
        this.dragging = null;
        this.currentDropTarget = null;
        this.container = null;
        this.webSocketClient = webSocketClient;
        this.isMultiplayer = webSocketClient !== null;
        this.playerNumber = null;
    }

    // Initialize drag and drop system
    initializeDragAndDrop(container, player1) {
        this.container = container;
        this.player1 = player1;
        
        // Set player number from WebSocket client if available
        if (this.webSocketClient) {
            this.playerNumber = this.webSocketClient.playerNumber;
        }
        
        // Ensure container is positioned
        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        // Set up event listeners
        document.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', () => this.onMouseUp());
        
        // Set up WebSocket event listeners if multiplayer
        if (this.isMultiplayer) {
            this.setupMultiplayerEventListeners();
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
        const cardEl = e.target.closest('.card.player');
        if (!cardEl || cardEl.classList.contains('empty')) return;
        
        e.preventDefault();
        const containerRect = this.container.getBoundingClientRect();
        const cardRect = cardEl.getBoundingClientRect();
        const offsetX = e.clientX - cardRect.left;
        const offsetY = e.clientY - cardRect.top;

        const dragEl = this.makeDragEl(cardEl, cardRect, containerRect);
        this.container.appendChild(dragEl);
        this.dragging = { cardEl, dragEl, offsetX, offsetY };
        this.dragging.cardEl.style.backgroundImage = '';
        this.dragging.cardEl.classList.add('empty');
    }

    // Handle mouse move events for drag movement
    onMouseMove(e) {
        if (!this.dragging) return;
        
        const { dragEl, offsetX, offsetY } = this.dragging;
        const containerRect = this.container.getBoundingClientRect();
        dragEl.style.left = `${e.clientX - containerRect.left - offsetX}px`;
        dragEl.style.top = `${e.clientY - containerRect.top - offsetY}px`;

        // Collision detection and highlighting
        const dragRect = dragEl.getBoundingClientRect();
        this.currentDropTarget = null;
        
        document.querySelectorAll('.card.player.empty').forEach(slot => {
            const s = slot.getBoundingClientRect();
            const colliding = !(
                dragRect.right < s.left ||
                dragRect.left > s.right ||
                dragRect.bottom < s.top ||
                dragRect.top > s.bottom
            );
            slot.style.boxShadow = colliding ? '0 0 10px 2px #4caf50' : '';
            if (colliding) this.currentDropTarget = slot;
        });
    }

    // Handle mouse up events for drag end
    onMouseUp() {
        if (!this.dragging) return;

        if (this.currentDropTarget) {
            // Successfully dropped on target
            this.currentDropTarget.style.backgroundImage = window.getComputedStyle(this.dragging.dragEl).backgroundImage;
            this.currentDropTarget.classList.remove('empty');
            
            // Update game state
            this.updateGameStateOnDrop(this.dragging.cardEl, this.currentDropTarget);
        } else {
            // Return to origin
            this.dragging.cardEl.style.backgroundImage = window.getComputedStyle(this.dragging.dragEl).backgroundImage;
            this.dragging.cardEl.classList.remove('empty');
        }

        // Cleanup
        if (this.dragging.dragEl) this.dragging.dragEl.remove();
        document.querySelectorAll('.card.player.empty').forEach(s => s.style.boxShadow = '');
        this.dragging = null;
        this.currentDropTarget = null;
    }

    // Update game state when card is successfully dropped
    updateGameStateOnDrop(sourceEl, targetEl) {
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
    }

    // Handle opponent's card moves
    handleOpponentCardMove(data) {
        const { playerNumber, sourceType, sourceIndex, targetType, targetIndex, cardData } = data;
        
        // Determine if this is from the opponent (opposite player number)
        const isOpponentMove = playerNumber !== this.playerNumber;
        if (!isOpponentMove) return;
        
        // Update opponent's visual board state
        this.updateOpponentVisuals(sourceType, sourceIndex, targetType, targetIndex, cardData);
        
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

    // Handle opponent state updates
    handleOpponentStateUpdate(data) {
        // Update opponent's board state if needed
        console.log('Opponent state updated:', data);
    }
}
export default GUIHookUtils;