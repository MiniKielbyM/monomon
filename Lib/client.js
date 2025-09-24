import Deck from './deck.js';
import Game from './game.js';
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
}
export default Client;