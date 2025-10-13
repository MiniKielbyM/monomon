import Deck from './deck.js';
import Game from './game.js';
import { Card } from './card.js';
class Client {
    constructor(username, deck = null) {
        // Deck is now optional - server manages all game state
        if (deck && !(deck instanceof Deck)) {
            throw new TypeError('deck must be an instance of Deck');
        }
        this.username = username;
        this.isConnected = false;
        this.deck = deck; // Can be null in server-authoritative mode
        this.game = null;
        this.opponent = null;
        this.activePokemon = null;
        this.uuid = crypto.randomUUID();
        this.bench = [];
        this.hand = [];
        this.prizeCards = [];
        this.discardPile = [];
        this.lost = false;
        this.attachedEnergyThisTurn = false;
        this.hasPlayedSupporterThisTurn = false;
        this.hasPlayedStadiumThisTurn = false;
    }
    setHand(cards) {
        if (!Array.isArray(cards) || !cards.every(card => card instanceof Card)) {
            throw new TypeError('cards must be an array of Card instances');
        }
        
        this.hand = cards;
        
        // If we have a game instance, let it handle the GUI update
        if (this.game && this.game.updateHandGUI) {
            this.game.boardState.player1.hand = cards;
            this.game.updateHandGUI();
        } else {
            // Fallback to direct DOM manipulation
            this.updateHandDOM(cards);
        }
    }
    
    // Direct DOM manipulation for hand (fallback)
    updateHandDOM(cards) {
        const handContainer = document.getElementById('PlayerHand');
        if (!handContainer) return;
        
        handContainer.innerHTML = '';
        for (const card of cards) {
            const cardDiv = document.createElement('div');
            cardDiv.classList.add('card', 'player', 'in-hand');
            cardDiv.style.backgroundImage = `url(${card.imgUrl})`;
            handContainer.appendChild(cardDiv);
        }
    }
    setActivePokemon(card) {
        if (this.activePokemon !== null) {
            throw new Error('Active Pokemon is already set');
        }
        if (!(card instanceof Card)) {
            throw new TypeError('card must be an instance of Card');
        }
        if (!this.hand.includes(card)) {
            throw new Error('card must be in hand');
        }
        
        this.activePokemon = card;
        
        // Remove from hand
        const index = this.hand.indexOf(card);
        if (index !== -1) {
            this.hand.splice(index, 1);
        }
        
        // If we have a game instance, let it handle the state update
        if (this.game) {
            this.game.boardState.player1.activePokemon = card;
            this.game.boardState.player1.hand = this.hand;
            this.game.updateGUIState();
        } else {
            // Fallback to direct DOM manipulation
            this.updateActivePokemonDOM(card);
            this.updateHandDOM(this.hand);
        }
    }
    
    // Direct DOM manipulation for active Pokemon (fallback)
    updateActivePokemonDOM(card) {
        const activeSlot = document.getElementById('ActivePokemon');
        if (activeSlot) {
            activeSlot.style.backgroundImage = `url(${card.imgUrl})`;
            activeSlot.classList.remove('empty');
            activeSlot.card = card;
        }
    }
}
export default Client;