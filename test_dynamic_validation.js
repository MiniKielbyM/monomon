// Test dynamic ability effect validation
import ServerGame from './Server/ServerGame.js';
import CardsBase1 from './Lib/Cards/Base/Base1/Cards.js';

const { Alakazam, Blastoise, Pikachu } = CardsBase1;

console.log('Testing dynamic ability effect validation...\n');

// Create a game
const game = new ServerGame(
    { id: 'test1', username: 'player1' },
    { id: 'test2', username: 'player2' }
);
game.gameState.phase = 'main';

console.log('=== Testing Alakazam\'s Damage Swap (Dynamic Validator) ===');

// Set up Alakazam
const alakazam = new Alakazam();
alakazam.owner = game.gameState.player1;
game.gameState.player1.activePokemon = alakazam;

// Check if the ability has a validator
const damageSwapAbility = alakazam.abilities['Damage Swap'];
console.log('Damage Swap ability structure:');
console.log('- Has callback:', !!damageSwapAbility.callback);
console.log('- Has effectValidator:', !!damageSwapAbility.effectValidator);
console.log('- Validator type:', typeof damageSwapAbility.effectValidator);

// Test 1: No damaged Pokemon
console.log('\nTest 1: No damaged Pokemon (should be blocked)');
try {
    const result = await game.useAbility(1, 'Damage Swap');
    console.log('Result:', result.success ? 'Allowed ✅' : 'Blocked ❌');
    console.log('Reason:', result.error || 'Success');
} catch (error) {
    console.log('Error:', error.message);
}

console.log('\n=== Testing Blastoise\'s Rain Dance (Dynamic Validator) ===');

// Set up Blastoise
const blastoise = new Blastoise();
blastoise.owner = game.gameState.player1;
game.gameState.player1.activePokemon = blastoise;

// Check Rain Dance validator
const rainDanceAbility = blastoise.abilities['Rain Dance'];
console.log('Rain Dance ability structure:');
console.log('- Has callback:', !!rainDanceAbility.callback);
console.log('- Has effectValidator:', !!rainDanceAbility.effectValidator);
console.log('- Validator type:', typeof rainDanceAbility.effectValidator);

// Test 2: No Water Energy in hand
console.log('\nTest 2: No Water Energy in hand (should be blocked)');
game.gameState.player1.hand = []; // Empty hand
game.gameState.player1.abilitiesUsedThisTurn.clear();

try {
    const result = await game.useAbility(1, 'Rain Dance');
    console.log('Result:', result.success ? 'Allowed ✅' : 'Blocked ❌');
    console.log('Reason:', result.error || 'Success');
} catch (error) {
    console.log('Error:', error.message);
}

console.log('\n=== Testing Pikachu (No Custom Validator) ===');

// Set up Pikachu (should fall back to default behavior)
const pikachu = new Pikachu();
pikachu.owner = game.gameState.player1;
game.gameState.player1.activePokemon = pikachu;

console.log('Pikachu abilities:', Object.keys(pikachu.abilities));
console.log('Should fall back to legacy validation (if any abilities exist)');

console.log('\n✅ Dynamic validation test completed!');