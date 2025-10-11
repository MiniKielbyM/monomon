import Deck from './deck.js';
import Game from './game.js';
import { Card } from './card.js';
class Client {
    constructor(username, deck) {
        if (!(deck instanceof Deck)) {
            throw new TypeError('deck must be an instance of Deck');
        }
        this.username = username;
        this.isConnected = false;
        this.deck = deck;
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
        document.getElementById('PlayerHand').innerHTML = '';
        for (const card of cards) {
            const cardDiv = document.createElement('div');
            cardDiv.classList.add('card', 'player', 'in-hand');
            cardDiv.style.backgroundImage = `url(${card.imgUrl})`;
            document.getElementById('PlayerHand').appendChild(cardDiv);
        }
        this.hand = cards;
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
        console.log(document.getElementById('ActivePokemon'));
        document.getElementById('ActivePokemon').style.backgroundImage = `url(${card.imgUrl})`;
        document.getElementById('ActivePokemon').classList.remove('empty');
        document.getElementById('ActivePokemon').card = card;
        const index = this.hand.indexOf(card);
        if (index !== -1) {
            this.hand.splice(index, 1);
        }
        this.setHand(this.hand);
    }
}
export default Client;