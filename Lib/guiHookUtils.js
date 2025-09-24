class GUIHookUtils {
    constructor(domElement) {
        this.domElement = domElement;
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
}
export default GUIHookUtils;