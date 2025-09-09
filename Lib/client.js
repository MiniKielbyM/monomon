import Deck from './deck.js';
class Client {
    constructor(username, deck) {
        if (!(deck instanceof Deck)) {
            throw new TypeError('deck must be an instance of Deck');
        }
        this.username = username;
        this.isConnected = false;
        this.deck = deck;
    }
}
export default Client;