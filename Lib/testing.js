import Client from './client.js';
import Game from './game.js';
import Deck from './deck.js';
import Pikachu from './cardTest.js';
import enums from './enums.js';
const card = new Pikachu();
console.log(card);
const game = new Game(new Client('TestUser', new Deck('TestDeck')), new Client('TestUser2', new Deck('TestDeck2')));
console.log(game);
