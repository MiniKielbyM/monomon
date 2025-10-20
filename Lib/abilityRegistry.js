// Example: How to register new abilities with the extensible system
// This file shows how new card abilities can be added without modifying guiHookUtils.js

// Example of registering a new ability for a hypothetical card
function registerNewCardAbilities(guiHookUtils) {
    
    // Example 1: Simple energy attachment ability
    guiHookUtils.registerAbilityHandler('Energy Burn', {
        validator: async (gameState) => {
            // Check if there are any energy cards in hand
            const energyInHand = gameState.yourState.hand.filter(card => 
                card && card.type === 'energy'
            );
            
            if (energyInHand.length === 0) {
                return { valid: false, reason: 'No energy cards in hand' };
            }
            
            return { valid: true };
        },
        
        executor: async (gameState, context) => {
            // Convert all energy to fire energy (Charizard's ability)
            console.log('Energy Burn: All energy now counts as Fire energy');
            return { 
                success: true, 
                message: 'Energy Burn activated - all energy is now Fire energy' 
            };
        }
    });

    // Example 2: Complex ability with card selection
    guiHookUtils.registerAbilityHandler('Pokemon Power', {
        validator: async (gameState) => {
            const benchPokemon = gameState.yourState.bench.filter(card => card !== null);
            
            if (benchPokemon.length === 0) {
                return { valid: false, reason: 'No Pokemon on bench' };
            }
            
            return { valid: true };
        },
        
        executor: async (gameState, context) => {
            const benchPokemon = gameState.yourState.bench.filter(card => card !== null);
            
            // Use the selectCardFromPlayer utility
            const target = await context.guiHookUtils.selectCardFromPlayer(benchPokemon, {
                title: 'Pokemon Power',
                subtitle: 'Choose a Pokemon to activate:',
                cardDisplayFunction: (card) => `${card.name || card.cardName} - ${card.hp}/${card.maxHp} HP`
            });
            
            if (!target) {
                return { success: false, error: 'No Pokemon selected' };
            }
            
            // Do something with the selected Pokemon
            console.log(`Pokemon Power used on: ${target.name || target.cardName}`);
            
            return { 
                success: true, 
                message: `Pokemon Power activated on ${target.name || target.cardName}` 
            };
        },
        
        components: {
            // Define reusable components for this ability
            pokemonFilter: (pokemon) => pokemon.filter(card => card !== null),
            targetSelector: (targets) => guiHookUtils.selectCardFromPlayer(targets, {
                title: 'Pokemon Power',
                subtitle: 'Choose a Pokemon:',
                cardDisplayFunction: (card) => `${card.name || card.cardName}`
            })
        }
    });

    // Example 3: Ability that interacts with server
    guiHookUtils.registerAbilityHandler('Computer Search', {
        validator: async (gameState) => {
            // Trainer cards might have different validation
            return { valid: true };
        },
        
        executor: async (gameState, context) => {
            // For trainer cards, you might send a different message to server
            if (context.isMultiplayer && context.webSocketClient) {
                // Send custom action to server
                context.webSocketClient.send('trainer_card_action', { 
                    cardName: 'Computer Search',
                    action: 'search_deck' 
                });
                
                return { 
                    success: true, 
                    message: 'Computer Search - searching deck...' 
                };
            } else {
                // Local implementation
                console.log('Computer Search: Searching deck locally');
                return { 
                    success: true, 
                    message: 'Computer Search used locally' 
                };
            }
        }
    });
}

// Usage example:
// After creating GUIHookUtils instance:
// const guiHook = new GUIHookUtils(domElement, webSocketClient);
// registerNewCardAbilities(guiHook);

export default registerNewCardAbilities;