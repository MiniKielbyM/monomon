import { Card } from './card.js';
class Deck {
    constructor(name) {
        this.name = name;
        this.cards = [];
    }
    addCard(card) {
        if (!(card instanceof Card)) {
            throw new Error(`Can only add instances of Card to the deck`);
        }
        this.cards.push(card);
    }
}
export default Deck;
