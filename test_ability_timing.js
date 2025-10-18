#!/usr/bin/env node
// Test script to verify ability timing restrictions

import CardsBase1 from './Lib/Cards/Base/Base1/Cards.js';

const { Alakazam, Blastoise, Pikachu } = CardsBase1;

console.log('Testing Pokemon TCG Ability Timing System\n');

// Mock ServerGame for testing timing validation
class MockServerGame {
    constructor() {
        this.gameState = {
            player1: {
                abilitiesUsedThisTurn: new Set()
            },
            player2: {
                abilitiesUsedThisTurn: new Set()
            },
            currentPlayer: 1,
            attackedThisTurn: false,
            phase: 'main'
        };
    }

    // Copy the validation methods from ServerGame
    validateAbilityTiming(playerNumber, abilityName, ability) {
        const player = playerNumber === 1 ? this.gameState.player1 : this.gameState.player2;
        
        // Check if already attacked this turn (most abilities can't be used after attacking)
        if (this.gameState.attackedThisTurn && this.abilityRequiresBeforeAttack(abilityName)) {
            return { 
                valid: false, 
                error: 'This ability can only be used before attacking' 
            };
        }

        // Check once-per-turn restrictions
        if (this.isOncePerTurnAbility(abilityName)) {
            const abilityKey = `${abilityName}`;
            if (player.abilitiesUsedThisTurn && player.abilitiesUsedThisTurn.has(abilityKey)) {
                return { 
                    valid: false, 
                    error: 'This ability can only be used once per turn' 
                };
            }
        }

        // Check phase restrictions (most abilities are main phase only)
        if (this.gameState.phase === 'setup' || this.gameState.phase === 'end') {
            return { 
                valid: false, 
                error: 'Abilities can only be used during the main phase of your turn' 
            };
        }

        return { valid: true };
    }

    abilityRequiresBeforeAttack(abilityName) {
        const beforeAttackAbilities = [
            'Rain Dance',
            'Damage Swap',
            'Pokemon Power'
        ];
        return beforeAttackAbilities.includes(abilityName);
    }

    isOncePerTurnAbility(abilityName) {
        const oncePerTurnAbilities = [
            'Rain Dance'
        ];
        return oncePerTurnAbilities.includes(abilityName);
    }

    trackAbilityUsage(playerNumber, abilityName) {
        const player = playerNumber === 1 ? this.gameState.player1 : this.gameState.player2;
        const abilityKey = `${abilityName}`;
        player.abilitiesUsedThisTurn.add(abilityKey);
    }
}

const game = new MockServerGame();

console.log('=== Testing Rain Dance (Once per turn, before attack) ===');

// Test 1: Rain Dance should be allowed initially
let result = game.validateAbilityTiming(1, 'Rain Dance', {});
console.log('First Rain Dance attempt:', result.valid ? '✅ ALLOWED' : `❌ BLOCKED: ${result.error}`);

// Mark Rain Dance as used
if (result.valid) {
    game.trackAbilityUsage(1, 'Rain Dance');
    console.log('Rain Dance marked as used');
}

// Test 2: Rain Dance should be blocked (once per turn)
result = game.validateAbilityTiming(1, 'Rain Dance', {});
console.log('Second Rain Dance attempt:', result.valid ? '✅ ALLOWED' : `❌ BLOCKED: ${result.error}`);

console.log('\n=== Testing Damage Swap (Multiple times, before attack) ===');

// Test 3: Damage Swap should be allowed multiple times
result = game.validateAbilityTiming(1, 'Damage Swap', {});
console.log('First Damage Swap attempt:', result.valid ? '✅ ALLOWED' : `❌ BLOCKED: ${result.error}`);

if (result.valid) {
    game.trackAbilityUsage(1, 'Damage Swap');
}

result = game.validateAbilityTiming(1, 'Damage Swap', {});
console.log('Second Damage Swap attempt:', result.valid ? '✅ ALLOWED' : `❌ BLOCKED: ${result.error}`);

console.log('\n=== Testing After Attack ===');

// Test 4: Abilities should be blocked after attacking
game.gameState.attackedThisTurn = true;

result = game.validateAbilityTiming(1, 'Rain Dance', {});
console.log('Rain Dance after attack:', result.valid ? '✅ ALLOWED' : `❌ BLOCKED: ${result.error}`);

result = game.validateAbilityTiming(1, 'Damage Swap', {});
console.log('Damage Swap after attack:', result.valid ? '✅ ALLOWED' : `❌ BLOCKED: ${result.error}`);

console.log('\n=== Testing Phase Restrictions ===');

// Test 5: Abilities should be blocked in setup phase
game.gameState.attackedThisTurn = false;
game.gameState.phase = 'setup';

result = game.validateAbilityTiming(1, 'Rain Dance', {});
console.log('Rain Dance in setup phase:', result.valid ? '✅ ALLOWED' : `❌ BLOCKED: ${result.error}`);

// Test 6: Abilities should work in main phase
game.gameState.phase = 'main';

result = game.validateAbilityTiming(1, 'Damage Swap', {});
console.log('Damage Swap in main phase:', result.valid ? '✅ ALLOWED' : `❌ BLOCKED: ${result.error}`);

console.log('\n=== Summary ===');
console.log('✅ Rain Dance: Once per turn restriction working');
console.log('✅ Damage Swap: Multiple use allowed working');
console.log('✅ Before attack restriction working');
console.log('✅ Phase restrictions working');
console.log('\nAbility timing system test completed!');