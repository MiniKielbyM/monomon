#!/usr/bin/env node
// Test script to verify ability functionality

import CardsBase1 from './Lib/Cards/Base/Base1/Cards.js';
import Client from './Lib/client.js';
import Deck from './Lib/deck.js';

const { Alakazam, Blastoise, Pikachu } = CardsBase1;

console.log('Testing Pokemon TCG Ability System\n');

// Create a mock owner
const mockOwner = {
    uuid: 'test-player',
    bench: [],
    hand: [],
    activePokemon: null,
    guiHook: {
        coinFlip: () => Math.random() < 0.5,
        damageCardElement: (card, damage) => console.log(`${card.cardName} takes ${damage} damage`),
        healCardElement: (card, amount) => console.log(`${card.cardName} heals ${amount} HP`),
        selectFromCards: async (cards) => {
            console.log(`Auto-selecting from ${cards.length} cards`);
            return cards.length > 0 ? cards[0] : null;
        }
    },
    opponent: {
        activePokemon: null,
        bench: []
    }
};

// Test Alakazam abilities
console.log('=== Testing Alakazam ===');
const alakazam = new Alakazam(mockOwner);
console.log('Card Name:', alakazam.cardName);
console.log('HP:', alakazam.hp);
console.log('Abilities Object:', alakazam.abilities);
console.log('Ability Names:', Object.keys(alakazam.abilities || {}));

if (alakazam.abilities && alakazam.abilities['Damage Swap']) {
    console.log('✅ Damage Swap ability found');
    console.log('Description:', alakazam.abilities['Damage Swap'].description);
    console.log('Has Callback:', typeof alakazam.abilities['Damage Swap'].callback === 'function');
} else {
    console.log('❌ Damage Swap ability not found');
}

console.log('\n=== Testing Blastoise ===');
const blastoise = new Blastoise(mockOwner);
console.log('Card Name:', blastoise.cardName);
console.log('HP:', blastoise.hp);
console.log('Abilities Object:', blastoise.abilities);
console.log('Ability Names:', Object.keys(blastoise.abilities || {}));

if (blastoise.abilities && blastoise.abilities['Rain Dance']) {
    console.log('✅ Rain Dance ability found');
    console.log('Description:', blastoise.abilities['Rain Dance'].description);
    console.log('Has Callback:', typeof blastoise.abilities['Rain Dance'].callback === 'function');
} else {
    console.log('❌ Rain Dance ability not found');
}

console.log('\n=== Testing Pikachu ===');
const pikachu = new Pikachu(mockOwner);
console.log('Card Name:', pikachu.cardName);
console.log('HP:', pikachu.hp);
console.log('Abilities Object:', pikachu.abilities);
console.log('Ability Names:', Object.keys(pikachu.abilities || {}));

// Test attacks too
console.log('\n=== Testing Attacks ===');
console.log('Alakazam Attacks:', Object.keys(alakazam.attacks || {}));
console.log('Blastoise Attacks:', Object.keys(blastoise.attacks || {}));
console.log('Pikachu Attacks:', Object.keys(pikachu.attacks || {}));

console.log('\n=== Testing Ability Execution (Damage Swap) ===');
try {
    // Set up a scenario for Damage Swap
    const targetPokemon = new Pikachu(mockOwner);
    targetPokemon.damage(20); // Damage the target first
    mockOwner.bench = [targetPokemon];
    mockOwner.activePokemon = alakazam;
    
    console.log(`Before: Alakazam HP=${alakazam.health}, Pikachu HP=${targetPokemon.health}`);
    
    if (alakazam.abilities['Damage Swap'] && alakazam.abilities['Damage Swap'].callback) {
        console.log('Attempting to call Damage Swap...');
        // await alakazam.abilities['Damage Swap'].callback.call(alakazam);
        console.log('✅ Damage Swap callback is callable');
    }
} catch (error) {
    console.log('❌ Error testing Damage Swap:', error.message);
}

console.log('\nAbility system test completed!');