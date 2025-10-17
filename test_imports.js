// Test imports to debug the issue
import CardsBase1 from './Lib/Cards/Base/Base1/Cards.js';

console.log('CardsBase1:', CardsBase1);
console.log('CardsBase1 type:', typeof CardsBase1);
console.log('CardsBase1 keys:', Object.keys(CardsBase1 || {}));

if (CardsBase1) {
    console.log('Alakazam:', CardsBase1.Alakazam);
    console.log('Blastoise:', CardsBase1.Blastoise);
    console.log('Pikachu:', CardsBase1.Pikachu);
}