#!/usr/bin/env node
// Test script to verify that attacks work as intended

import { Card } from './Lib/card.js';
import CardsBase1 from './Lib/Cards/Base/Base1/Cards.js';
import enums from './Lib/enums.js';

const { Alakazam, Blastoise, Pikachu } = CardsBase1.default;
const { PokemonType } = enums;

// Create mock owners for testing
const createMockOwner = (name) => ({
    uuid: `test-${name}`,
    guiHook: {
        coinFlip: async () => {
            const result = Math.random() < 0.5;
            console.log(`  🪙 Coin flip: ${result ? 'HEADS' : 'TAILS'}`);
            return result;
        },
        damageCardElement: (card, damage) => {
            console.log(`  💥 Visual damage indicator: ${damage} damage to ${card.cardName}`);
        },
        healCardElement: (card, amount) => {
            console.log(`  💚 Visual heal indicator: ${amount} health to ${card.cardName}`);
        },
        selectFromCards: async (cards) => {
            if (cards.length > 0) {
                console.log(`  🎯 Auto-selecting: ${cards[0].cardName}`);
                return cards[0];
            }
            return null;
        }
    },
    opponent: null // Will be set up later
});

async function testAttacks() {
    console.log('🧪 Testing Pokemon TCG Attack System');
    console.log('=====================================\n');

    // Create mock players
    const player1 = createMockOwner('Player1');
    const player2 = createMockOwner('Player2');

    // Create Pokemon instances
    console.log('📦 Creating Pokemon...');
    const pikachu = new Pikachu(player1);
    const alakazam = new Alakazam(player1);
    const blastoise = new Blastoise(player2);
    
    // Set up opponent references
    player1.opponent = { activePokemon: blastoise };
    player2.opponent = { activePokemon: pikachu };
    
    console.log(`✅ Created: ${pikachu.cardName} (${pikachu.hp} HP)`);
    console.log(`✅ Created: ${alakazam.cardName} (${alakazam.hp} HP)`);
    console.log(`✅ Created: ${blastoise.cardName} (${blastoise.hp} HP)\n`);

    // Test 1: Pikachu's Thunder Jolt
    console.log('⚡ TEST 1: Pikachu\'s Thunder Jolt Attack');
    console.log('------------------------------------------');
    console.log(`Before: ${blastoise.cardName} has ${blastoise.health}/${blastoise.hp} HP`);
    
    if (pikachu.ThunderJolt) {
        try {
            await pikachu.ThunderJolt();
            console.log(`After: ${blastoise.cardName} has ${blastoise.health}/${blastoise.hp} HP`);
            console.log(`✅ Thunder Jolt executed successfully!\n`);
        } catch (error) {
            console.log(`❌ Thunder Jolt failed: ${error.message}\n`);
        }
    } else {
        console.log('❌ Thunder Jolt method not found!\n');
    }

    // Test 2: Alakazam's Confuse Ray
    console.log('🔮 TEST 2: Alakazam\'s Confuse Ray Attack');
    console.log('------------------------------------------');
    console.log(`Before: ${blastoise.cardName} has ${blastoise.health}/${blastoise.hp} HP`);
    
    if (alakazam.ConfuseRay) {
        try {
            await alakazam.ConfuseRay();
            console.log(`After: ${blastoise.cardName} has ${blastoise.health}/${blastoise.hp} HP`);
            console.log(`Status conditions: ${blastoise.statusConditions.join(', ') || 'None'}`);
            console.log(`✅ Confuse Ray executed successfully!\n`);
        } catch (error) {
            console.log(`❌ Confuse Ray failed: ${error.message}\n`);
        }
    } else {
        console.log('❌ Confuse Ray method not found!\n');
    }

    // Test 3: Blastoise's Hydro Pump
    console.log('🌊 TEST 3: Blastoise\'s Hydro Pump Attack');
    console.log('------------------------------------------');
    
    // Add some water energy to Blastoise for testing
    blastoise.energy = [PokemonType.WATER, PokemonType.WATER, PokemonType.WATER, PokemonType.WATER];
    console.log(`Blastoise energy: [${blastoise.energy.join(', ')}]`);
    console.log(`Before: ${pikachu.cardName} has ${pikachu.health}/${pikachu.hp} HP`);
    
    if (blastoise.HydroPump) {
        try {
            await blastoise.HydroPump();
            console.log(`After: ${pikachu.cardName} has ${pikachu.health}/${pikachu.hp} HP`);
            console.log(`✅ Hydro Pump executed successfully!\n`);
        } catch (error) {
            console.log(`❌ Hydro Pump failed: ${error.message}\n`);
        }
    } else {
        console.log('❌ Hydro Pump method not found!\n');
    }

    // Test 4: Check attack data structure
    console.log('📋 TEST 4: Attack Data Structure');
    console.log('----------------------------------');
    console.log('Pikachu attacks:', Object.keys(pikachu.attacks));
    console.log('Alakazam attacks:', Object.keys(alakazam.attacks));
    console.log('Blastoise attacks:', Object.keys(blastoise.attacks));
    
    if (pikachu.attacks['Thunder Jolt']) {
        console.log('Thunder Jolt details:', pikachu.attacks['Thunder Jolt']);
    }
    
    console.log('\n🎉 Attack System Test Complete!');
    console.log('=================================');
}

// Run the test
testAttacks().catch(console.error);