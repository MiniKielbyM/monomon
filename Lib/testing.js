import Client from './client.js';
import Game from './game.js';
import Deck from './deck.js';
import Pikachu from './cardTest.js';
import enums from './enums.js';
const game = new Game(new Client('TestUser', new Deck('TestDeck')), new Client('TestUser2', new Deck('TestDeck2')));
const pikachu = new Pikachu(game.client1);
game.client1.deck.addCard(pikachu);
console.log(game);
game.client1.deck.cards.forEach(element => {
    console.log(element);
});
console.log(pikachu.owner.uuid);
console.log(pikachu.owner.opponent);
