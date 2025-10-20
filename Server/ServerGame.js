import { v4 as uuidv4 } from 'uuid';
import { pokemonCards, energyCards } from './cardData.js';
import { Card, Energy } from '../Lib/card.js';
import CardsBase1, { AbilityRegistry, ServerAbilityContext } from '../Lib/Cards/Base/Base1/Cards.js';

const { Alakazam, Blastoise, Pikachu, Growlithe, Arcanine } = CardsBase1;

// Socket manager for ability system communication
class SocketManager {
    constructor(gameServer, gameId) {
        this.gameServer = gameServer; // Reference to the GameServer instance
        this.gameId = gameId;
        this.pendingSelections = new Map();
    }

    sendToPlayer(playerNumber, event, data) {
        // Find the player's WebSocket connection through the game server
        const game = this.gameServer.games.get(this.gameId);
        if (!game) {
            console.log(`SocketManager: Game ${this.gameId} not found`);
            return;
        }

        const player = playerNumber === 1 ? game.player1 : game.player2;
        if (!player || !player.ws) {
            console.log(`SocketManager: Player ${playerNumber} or WebSocket not found`);
            return;
        }

        // Send message through the WebSocket connection
        const message = JSON.stringify({
            type: event,
            ...data
        });
        
        console.log(`SocketManager: Sending ${event} to player ${playerNumber}:`, data);
        
        if (player.ws.readyState === 1) { // WebSocket.OPEN
            player.ws.send(message);
        } else {
            console.log(`SocketManager: WebSocket not ready for player ${playerNumber}, state:`, player.ws.readyState);
        }
    }

    on(event, handler) {
        // For the ws library, we'll handle events through the game server
        // This is a simplified implementation
        if (!this.gameServer._socketManagerHandlers) {
            this.gameServer._socketManagerHandlers = new Map();
        }
        this.gameServer._socketManagerHandlers.set(event, handler);
    }

    off(event, handler) {
        if (this.gameServer._socketManagerHandlers) {
            this.gameServer._socketManagerHandlers.delete(event);
        }
    }
}

// Server-side Game class - handles all game logic and state
class ServerGame {
    constructor(player1, player2, gameServer = null) {
        this.id = uuidv4();
        this.player1 = { ...player1, playerNumber: 1 };
        this.player2 = { ...player2, playerNumber: 2 };
        this.state = 'waiting_for_ready';
        this.created = new Date();
        
        // Socket manager for client communication
        this.socketManager = gameServer ? new SocketManager(gameServer, this.id) : null;
        
        // Authoritative game state
        this.gameState = {
            player1: {
                activePokemon: null,
                bench: Array(5).fill(null),
                hand: [],
                deck: [],
                discardPile: [],
                prizeCards: Array(6).fill(null),
                energyAttachedThisTurn: false,
                supporterPlayedThisTurn: false,
                stadiumPlayedThisTurn: false,
                abilitiesUsedThisTurn: new Set() // Track abilities used this turn
            },
            player2: {
                activePokemon: null,
                bench: Array(5).fill(null),
                hand: [],
                deck: [],
                discardPile: [],
                prizeCards: Array(6).fill(null),
                energyAttachedThisTurn: false,
                supporterPlayedThisTurn: false,
                stadiumPlayedThisTurn: false,
                abilitiesUsedThisTurn: new Set() // Track abilities used this turn
            },
            turn: 1,
            currentPlayer: 1,
            phase: 'setup', // setup, main, attack, end
            drewCard: false,
            attackedThisTurn: false,
            winner: null,
            gameLog: []
        };
        
        this.initializeDecks();
        
        // Remove automatic test game initialization - let players play normally
        // this.initializeTestGame();
    }
    
    // Fisher-Yates shuffle algorithm for proper randomization
    shuffleDeck(deck) {
        const shuffled = [...deck]; // Create a copy to avoid mutating original
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    // Shuffle a player's deck during gameplay
    shufflePlayerDeck(playerNumber) {
        const player = playerNumber === 1 ? this.gameState.player1 : this.gameState.player2;
        player.deck = this.shuffleDeck(player.deck);
        this.logAction(`Player ${playerNumber} shuffled their deck`);
        return true;
    }

    // Use a Pokemon's attack
    async useAttack(playerNumber, attackName) {
        const player = playerNumber === 1 ? this.gameState.player1 : this.gameState.player2;
        const opponent = playerNumber === 1 ? this.gameState.player2 : this.gameState.player1;

        // Debug turn state
        console.log('Attack attempt - Turn state:', {
            attackingPlayer: playerNumber,
            currentPlayer: this.gameState.currentPlayer,
            turn: this.gameState.turn,
            isPlayersTurn: this.gameState.currentPlayer === playerNumber
        });

        // Validate it's the player's turn
        console.log('Turn validation check:', {
            gameStateCurrentPlayer: this.gameState.currentPlayer,
            gameStateCurrentPlayerType: typeof this.gameState.currentPlayer,
            playerNumber: playerNumber,
            playerNumberType: typeof playerNumber,
            strictEquality: this.gameState.currentPlayer === playerNumber,
            looseEquality: this.gameState.currentPlayer == playerNumber
        });
        
        if (this.gameState.currentPlayer !== playerNumber) {
            console.log('TURN VALIDATION FAILED - returning Not your turn');
            return { success: false, error: 'Not your turn' };
        }

        // Check if player has already attacked this turn
        if (this.gameState.attackedThisTurn) {
            return { success: false, error: 'Already attacked this turn' };
        }

        // Check if player has an active Pokemon
        if (!player.activePokemon) {
            return { success: false, error: 'No active Pokemon' };
        }

        const activePokemon = player.activePokemon;
        
        // Debug logging for attack structure
        console.log('Active Pokemon:', {
            cardName: activePokemon.cardName,
            hasAttacks: !!activePokemon.attacks,
            attacksType: typeof activePokemon.attacks,
            attacksKeys: activePokemon.attacks ? Object.keys(activePokemon.attacks) : 'no attacks',
            attacksArray: Array.isArray(activePokemon.attacks),
            attacksContent: activePokemon.attacks
        });
        console.log('Looking for attack:', attackName);
        
        // Find the attack in the Pokemon's attack list
        let attack = null;
        
        // Attacks are stored as object with attack name as key (from Card class)
        if (activePokemon.attacks && typeof activePokemon.attacks === 'object') {
            attack = activePokemon.attacks[attackName];
        }
        
        console.log('Found attack:', attack);
        
        if (!attack) {
            return { success: false, error: 'Attack not found' };
        }

        // Check energy requirements
        const energyCheck = this.checkEnergyRequirements(activePokemon, attack.energyCost || attack.cost);
        if (!energyCheck.success) {
            return { success: false, error: energyCheck.error };
        }

        // Execute the attack directly using the callback
        console.log('Executing attack callback directly:', {
            attacker: activePokemon.cardName,
            defender: opponent.activePokemon?.cardName,
            attack: attackName,
            hasCallback: !!attack.callback
        });
        
        let attackResult = { damage: 0, effects: [], message: `${activePokemon.cardName} used ${attackName}!` };
        
        if (attack.callback && typeof attack.callback === 'function') {
            try {
                // Set up the attacking Pokemon's owner and opponent references
                if (activePokemon.owner) {
                    activePokemon.owner.opponent = {
                        activePokemon: opponent.activePokemon,
                        bench: opponent.bench || []
                    };
                    
                    // Provide server-side guiHook with coin flip functionality
                    const game = this; // Capture reference to the game instance
                    activePokemon.owner.guiHook = {
                        async coinFlip() {
                            const result = Math.random() < 0.5;
                            console.log(`Server coin flip result: ${result ? 'heads' : 'tails'}`);
                            
                            // Broadcast coin flip to all clients
                            game.broadcastCoinFlip(result, activePokemon.owner.username || activePokemon.cardName);
                            
                            return result;
                        },
                        damageCardElement(pokemon, damage) {
                            console.log(`Server: ${pokemon.cardName} takes ${damage} damage (GUI update skipped)`);
                        },
                        handleKnockout(pokemon) {
                            // Find which player owns this Pokemon and handle knockout
                            const playerNumber = activePokemon.owner === game.gameState.player1 ? 1 : 2;
                            const player = playerNumber === 1 ? game.gameState.player1 : game.gameState.player2;
                            
                            // Determine if this is active or bench Pokemon
                            if (player.activePokemon && player.activePokemon.id === pokemon.id) {
                                game.handleKnockout(player, 'active', 0);
                            } else {
                                // Find on bench
                                const benchIndex = player.bench.findIndex(p => p && p.id === pokemon.id);
                                if (benchIndex !== -1) {
                                    game.handleKnockout(player, 'bench', benchIndex);
                                }
                            }
                        },
                        // Store attacking Pokemon type for weakness/resistance calculations
                        attackingPokemonType: activePokemon.type
                    };
                }
                
                // Record initial HP values
                const initialDefenderHp = opponent.activePokemon.hp;
                const initialAttackerHp = activePokemon.hp;
                
                console.log('BEFORE ATTACK:', {
                    defender: {
                        name: opponent.activePokemon.cardName,
                        hp: initialDefenderHp
                    },
                    attacker: {
                        name: activePokemon.cardName,
                        hp: initialAttackerHp
                    }
                });
                
                // Execute the attack callback
                console.log('Calling attack callback...');
                await attack.callback.call(activePokemon);
                
                console.log('AFTER ATTACK:', {
                    defender: {
                        name: opponent.activePokemon.cardName,
                        hp: opponent.activePokemon.hp,
                        hpChange: initialDefenderHp - opponent.activePokemon.hp
                    },
                    attacker: {
                        name: activePokemon.cardName,
                        hp: activePokemon.hp,
                        hpChange: initialAttackerHp - activePokemon.hp
                    }
                });
                
                // Calculate damage dealt (now using HP changes since damage() modifies HP directly)
                const defenderDamage = Math.max(0, initialDefenderHp - opponent.activePokemon.hp);
                const attackerSelfDamage = Math.max(0, initialAttackerHp - activePokemon.hp);
                
                attackResult = {
                    damage: defenderDamage,
                    selfDamage: attackerSelfDamage,
                    defenderHp: opponent.activePokemon.hp,
                    attackerHp: activePokemon.hp,
                    effects: opponent.activePokemon.statusConditions || [],
                    message: `${activePokemon.cardName} used ${attackName}${defenderDamage > 0 ? ` dealing ${defenderDamage} damage` : ''}${attackerSelfDamage > 0 ? ` (${attackerSelfDamage} self-damage)` : ''}!`
                };
                
                console.log('Attack executed successfully:', attackResult);
                
                // Clean up circular references to prevent JSON serialization issues
                if (activePokemon.owner) {
                    delete activePokemon.owner.opponent;
                    delete activePokemon.owner.guiHook;
                }
                
            } catch (error) {
                console.error('Error executing attack callback:', error);
                attackResult.message = `${activePokemon.cardName} tried to use ${attackName} but something went wrong.`;
                
                // Clean up circular references even on error
                if (activePokemon.owner) {
                    delete activePokemon.owner.opponent;
                    delete activePokemon.owner.guiHook;
                }
            }
        } else {
            // Fallback for attacks without callbacks
            const fallbackDamage = this.getBasicAttackDamage(attackName);
            opponent.activePokemon.hp = Math.max(0, opponent.activePokemon.hp - fallbackDamage);
            attackResult = {
                damage: fallbackDamage,
                defenderHp: opponent.activePokemon.hp,
                effects: [],
                message: `${activePokemon.cardName} used ${attackName} dealing ${fallbackDamage} damage!`
            };
        }
        
        // Mark that player has attacked this turn
        this.gameState.attackedThisTurn = true;
        
        this.logAction(`Player ${playerNumber}'s ${activePokemon.cardName} used ${attackName}`);
        
        // Check for knockouts and handle them (attacker self-damage or defender KO)
        try {
            // Defender knockout (opponent active Pokemon)
            if (opponent.activePokemon && typeof opponent.activePokemon.hp === 'number' && opponent.activePokemon.hp <= 0) {
                console.log('DEBUG: Defender HP <= 0, handling knockout for opponent active');
                this.handleKnockout(opponent, 'active', 0);
            }

            // Attacker self-knockout (if attacker damaged itself)
            if (activePokemon && typeof activePokemon.hp === 'number' && activePokemon.hp <= 0) {
                console.log('DEBUG: Attacker HP <= 0, handling knockout for current player active');
                // Note: player variable refers to the attacking player
                this.handleKnockout(player, 'active', 0);
            }
        } catch (err) {
            console.error('Error while handling knockouts after attack:', err);
        }

        return { success: true, result: attackResult };
    }

    // Use a Pokemon's ability
    async useAbility(playerNumber, abilityName) {
        console.log(`=== ABILITY USE ATTEMPT ===`);
        console.log(`Player: ${playerNumber}, Ability: ${abilityName}`);
        
        const player = playerNumber === 1 ? this.gameState.player1 : this.gameState.player2;
        const opponent = playerNumber === 1 ? this.gameState.player2 : this.gameState.player1;

        // Debug ability state
        console.log('Ability attempt - Turn state:', {
            usingPlayer: playerNumber,
            currentPlayer: this.gameState.currentPlayer,
            turn: this.gameState.turn,
            phase: this.gameState.phase,
            attackedThisTurn: this.gameState.attackedThisTurn,
            abilitiesUsed: Array.from(player.abilitiesUsedThisTurn || []),
            isPlayersTurn: this.gameState.currentPlayer === playerNumber
        });

        // Try to use new server callback system first
        const serverCallback = AbilityRegistry.getServerCallback(abilityName);
        console.log(`Debug: serverCallback exists: ${!!serverCallback}, socketManager exists: ${!!this.socketManager}`);
        
        if (serverCallback && this.socketManager) {
            try {
                console.log(`Using new server callback system for ability: ${abilityName}`);
                
                // Create ability context
                const context = new ServerAbilityContext(this.gameState, playerNumber, this.socketManager);
                
                // Execute the server callback
                const result = await serverCallback(context);
                
                if (result.success) {
                    console.log(`Server ability execution successful: ${result.message}`);
                    
                    // Broadcast state changes to all players
                    this.broadcastGameState();
                    
                    return result;
                } else {
                    console.log(`Server ability execution failed: ${result.error}`);
                    return result;
                }
            } catch (error) {
                console.error(`Error executing server ability callback for ${abilityName}:`, error);
                // Fall through to legacy system
            }
        }

        // Fall back to legacy ability system
        console.log(`Using legacy ability system for: ${abilityName}`);

        // Validate it's the player's turn
        if (this.gameState.currentPlayer !== playerNumber) {
            return { success: false, error: 'Not your turn' };
        }

        // Check if player has an active Pokemon
        if (!player.activePokemon) {
            return { success: false, error: 'No active Pokemon' };
        }

        // Search for the ability on ALL of the player's Pokemon (active + bench)
        let abilityPokemon = null;
        let ability = null;
        
        // Get all player's Pokemon
        const allPlayerPokemon = [player.activePokemon, ...(player.bench || [])];
        
        console.log('Searching for ability on all Pokemon:', {
            totalPokemon: allPlayerPokemon.length,
            pokemonNames: allPlayerPokemon.map(p => p?.cardName).filter(Boolean),
            searchingFor: abilityName
        });
        
        // Search through all Pokemon for the ability
        for (const pokemon of allPlayerPokemon) {
            if (!pokemon || !pokemon.abilities) continue;
            
            console.log(`Checking ${pokemon.cardName} for ability:`, {
                hasAbilities: !!pokemon.abilities,
                abilitiesType: typeof pokemon.abilities,
                abilitiesKeys: pokemon.abilities ? Object.keys(pokemon.abilities) : 'no abilities'
            });
            
            let foundAbility = null;
            
            if (Array.isArray(pokemon.abilities)) {
                // New format: abilities are stored as an array
                foundAbility = pokemon.abilities.find(a => a.name === abilityName);
            } else if (typeof pokemon.abilities === 'object') {
                // Old format: abilities stored as object with ability name as key
                foundAbility = pokemon.abilities[abilityName];
            }
            
            if (foundAbility) {
                abilityPokemon = pokemon;
                ability = foundAbility;
                console.log(`Found ability "${abilityName}" on ${pokemon.cardName}:`, ability);
                break;
            }
        }
        
        if (!ability) {
            console.log('Ability not found on any Pokemon');
            return { success: false, error: 'Ability not found' };
        }

        // Validate ability timing constraints
        const timingValidation = this.validateAbilityTiming(playerNumber, abilityName, ability);
        if (!timingValidation.valid) {
            return { success: false, error: timingValidation.error };
        }

        // Validate ability would have an effect
        const effectValidation = this.validateAbilityEffect(playerNumber, abilityName, abilityPokemon);
        if (!effectValidation.valid) {
            return { success: false, error: effectValidation.error };
        }

        // Execute the ability directly using the callback
        console.log('Executing ability callback directly:', {
            pokemon: abilityPokemon.cardName,
            ability: abilityName,
            hasCallback: !!ability.callback
        });
        
        let abilityResult = { effects: [], message: `${abilityPokemon.cardName} used ${abilityName}!` };
        
        if (ability.callback && typeof ability.callback === 'function') {
            try {
                // Set up the Pokemon's owner and opponent references like in attacks
                if (abilityPokemon.owner) {
                    abilityPokemon.owner.opponent = {
                        activePokemon: opponent.activePokemon,
                        bench: opponent.bench || []
                    };
                    
                    // Provide server-side guiHook with necessary functionality
                    const game = this; // Capture reference to the game instance
                    abilityPokemon.owner.guiHook = {
                        async coinFlip() {
                            const result = Math.random() < 0.5;
                            console.log(`Server coin flip result: ${result ? 'heads' : 'tails'}`);
                            
                            // Broadcast coin flip to all clients
                            game.broadcastCoinFlip(result, abilityPokemon.owner.username || abilityPokemon.cardName);
                            
                            return result;
                        },
                        damageCardElement(pokemon, damage) {
                            console.log(`Server: ${pokemon.cardName} takes ${damage} damage (GUI update skipped)`);
                        },
                        healCardElement(pokemon, amount) {
                            console.log(`Server: ${pokemon.cardName} heals ${amount} HP (GUI update skipped)`);
                        },
                        handleKnockout(pokemon) {
                            // Find which player owns this Pokemon and handle knockout
                            const playerNumber = abilityPokemon.owner === game.gameState.player1 ? 1 : 2;
                            const player = playerNumber === 1 ? game.gameState.player1 : game.gameState.player2;
                            
                            // Determine if this is active or bench Pokemon
                            if (player.activePokemon && player.activePokemon.id === pokemon.id) {
                                game.handleKnockout(player, 'active', 0);
                            } else {
                                // Find on bench
                                const benchIndex = player.bench.findIndex(p => p && p.id === pokemon.id);
                                if (benchIndex !== -1) {
                                    game.handleKnockout(player, 'bench', benchIndex);
                                }
                            }
                        },
                        async selectFromCards(cards) {
                            // For server-side, just return the first valid card (could be improved with AI logic)
                            console.log(`Server: Auto-selecting from ${cards.length} cards`);
                            return cards.length > 0 ? cards[0] : null;
                        },
                        async showCardSelectionMenu(cards, options = {}) {
                            // For server-side, just return the first valid card (could be improved with AI logic)
                            console.log(`Server: Auto-selecting from ${cards.length} cards for ${options.title || 'selection'}`);
                            return cards.length > 0 ? cards[0] : null;
                        }
                    };
                    
                    // Make sure the owner has access to current player state
                    abilityPokemon.owner.bench = player.bench;
                    abilityPokemon.owner.activePokemon = player.activePokemon;
                    abilityPokemon.owner.hand = player.hand;
                }
                
                console.log('Calling ability callback...');
                await ability.callback.call(abilityPokemon);
                
                abilityResult = {
                    effects: abilityPokemon.statusConditions || [],
                    message: `${abilityPokemon.cardName} used ${abilityName} successfully!`
                };
                
                console.log('Ability executed successfully:', abilityResult);
                
                // Clean up circular references to prevent JSON serialization issues
                if (abilityPokemon.owner) {
                    delete abilityPokemon.owner.opponent;
                    delete abilityPokemon.owner.guiHook;
                }
                
            } catch (error) {
                console.error('Error executing ability callback:', error);
                abilityResult.message = `${abilityPokemon.cardName} tried to use ${abilityName} but something went wrong.`;
                
                // Clean up circular references even on error
                if (abilityPokemon.owner) {
                    delete abilityPokemon.owner.opponent;
                    delete abilityPokemon.owner.guiHook;
                }
            }
        } else {
            // Fallback for abilities without callbacks
            abilityResult = {
                effects: [],
                message: `${abilityPokemon.cardName} used ${abilityName}!`
            };
        }
        
        // Track ability usage for timing constraints
        this.trackAbilityUsage(playerNumber, abilityName, abilityPokemon.cardName);
        
        this.logAction(`Player ${playerNumber}'s ${abilityPokemon.cardName} used ability ${abilityName}`);
        
        return { success: true, result: abilityResult };
    }

    // Validate ability timing constraints
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

    // Check if an ability requires being used before attacking
    abilityRequiresBeforeAttack(abilityName) {
        // Most Pokemon abilities in Base Set require "before your attack"
        const beforeAttackAbilities = [
            'Rain Dance',
            'Damage Swap',
            'Pokemon Power' // Generic catch-all
        ];
        return beforeAttackAbilities.includes(abilityName);
    }

    // Check if an ability can only be used once per turn
    isOncePerTurnAbility(abilityName) {
        const oncePerTurnAbilities = [
            'Rain Dance' // Explicitly states "Once during your turn"
        ];
        return oncePerTurnAbilities.includes(abilityName);
    }

    // Validate that an ability would actually have an effect if used
    validateAbilityEffect(playerNumber, abilityName, activePokemon) {
        const player = playerNumber === 1 ? this.gameState.player1 : this.gameState.player2;
        const opponent = playerNumber === 1 ? this.gameState.player2 : this.gameState.player1;

        // First, try to use dynamic validator if available
        if (activePokemon.abilities) {
            let ability = null;
            
            if (Array.isArray(activePokemon.abilities)) {
                // New format: abilities are stored as an array
                ability = activePokemon.abilities.find(a => a.name === abilityName);
            } else if (typeof activePokemon.abilities === 'object') {
                // Old format: abilities stored as object with ability name as key
                ability = activePokemon.abilities[abilityName];
            }
            
            // Use dynamic validator if available
            if (ability && ability.effectValidator && typeof ability.effectValidator === 'function') {
                try {
                    return ability.effectValidator.call(activePokemon, player, opponent);
                } catch (error) {
                    console.error('Error in dynamic ability validator:', error);
                    // Fall through to hard-coded validation
                }
            }
        }

        // Fallback to hard-coded validation for abilities without dynamic validators
        switch (abilityName) {
            case 'Damage Swap':
                return this.validateDamageSwapEffect(player, opponent);
            
            case 'Rain Dance':
                return this.validateRainDanceEffect(player);
                
            default:
                // For unknown abilities, assume they can be used (better than blocking legitimate uses)
                return { valid: true };
        }
    }

    // Validate Damage Swap would have an effect
    validateDamageSwapEffect(player, opponent) {
        // Check if there are any damaged Pokemon to move damage from
        const allPlayerPokemon = [player.activePokemon, ...player.bench].filter(card => card !== null);
        
        console.log('DEBUG: All player Pokemon for Damage Swap:', allPlayerPokemon.map(p => ({
            name: p.cardName,
            hp: p.hp,
            maxHp: p.maxHp,
            isDamaged: p.hp < p.maxHp
        })));
        
        const damagedPokemon = allPlayerPokemon.filter(card => {
            return card && 
                   typeof card.hp === 'number' && 
                   typeof card.maxHp === 'number' && 
                   card.hp < card.maxHp;
        });
        
        console.log('DEBUG: Damaged Pokemon count:', damagedPokemon.length);
        
        if (damagedPokemon.length === 0) {
            return { 
                valid: false, 
                error: 'No damaged Pokemon to move damage from' 
            };
        }

        // Check if there are valid targets to move damage to (Pokemon that won't be KO'd by +10 damage)
        const validTargets = allPlayerPokemon.filter(card => {
            return card && card.hp > 10; // Must have more than 10 HP to survive the damage transfer
        });

        console.log('DEBUG: Valid targets for damage:', validTargets.map(p => ({
            name: p.cardName,
            hp: p.hp,
            canReceiveDamage: p.hp > 10
        })));

        if (validTargets.length === 0) {
            return { 
                valid: false, 
                error: 'No valid targets to move damage to (all Pokemon would be KO\'d)' 
            };
        }

        // Need at least one damaged Pokemon and one different valid target
        const differentTargets = validTargets.filter(target => !damagedPokemon.includes(target));
        if (damagedPokemon.length > 0 && differentTargets.length === 0 && validTargets.length === damagedPokemon.length) {
            return { 
                valid: false, 
                error: 'Cannot move damage (would KO the only available targets)' 
            };
        }

        return { valid: true };
    }

    // Validate Rain Dance would have an effect
    validateRainDanceEffect(player) {
        // Check if player has Water Energy cards in hand
        const waterEnergyInHand = player.hand.filter(card => {
            // Check if it's an Energy card and if it's Water type
            return card && (
                (card.constructor && card.constructor.name === 'Energy' && card.energyType === 'water') ||
                (card.type === 'water' && card.cardName && card.cardName.toLowerCase().includes('water'))
            );
        });

        if (waterEnergyInHand.length === 0) {
            return { 
                valid: false, 
                error: 'No Water Energy cards in hand to attach' 
            };
        }

        // Check if there are Water Pokemon to attach energy to
        const allPlayerPokemon = [player.activePokemon, ...player.bench].filter(card => card !== null);
        const waterPokemon = allPlayerPokemon.filter(card => {
            return card && (card.type === 'water' || card.type === 'WATER');
        });

        if (waterPokemon.length === 0) {
            return { 
                valid: false, 
                error: 'No Water Pokemon to attach energy to' 
            };
        }

        return { valid: true };
    }

    // Track ability usage for timing validation
    trackAbilityUsage(playerNumber, abilityName, pokemonName) {
        const player = playerNumber === 1 ? this.gameState.player1 : this.gameState.player2;
        
        // Initialize Set if it doesn't exist (in case of JSON serialization issues)
        if (!player.abilitiesUsedThisTurn || !(player.abilitiesUsedThisTurn instanceof Set)) {
            player.abilitiesUsedThisTurn = new Set();
        }

        // Track the ability usage
        const abilityKey = `${abilityName}`;
        player.abilitiesUsedThisTurn.add(abilityKey);

        console.log(`Tracked ability usage: Player ${playerNumber} used ${abilityName} (${pokemonName})`);
        console.log(`Total abilities used this turn:`, Array.from(player.abilitiesUsedThisTurn));
    }

    // Check if Pokemon has enough energy for an attack
    checkEnergyRequirements(pokemon, energyCost) {
        if (!energyCost || energyCost.length === 0) {
            return { success: true };
        }

        const attachedEnergy = pokemon.attachedEnergy || [];
        const energyCount = {};

        // Count attached energy by type
        attachedEnergy.forEach(energy => {
            const type = energy.energyType || energy.type;
            energyCount[type] = (energyCount[type] || 0) + 1;
        });

        // Count required energy by type
        const requiredEnergy = {};
        energyCost.forEach(type => {
            requiredEnergy[type] = (requiredEnergy[type] || 0) + 1;
        });

        // Create a copy of energyCount to track what's been used
        const availableEnergy = { ...energyCount };

        // First, satisfy all non-colorless energy requirements
        for (const [type, required] of Object.entries(requiredEnergy)) {
            if (type !== 'colorless') {
                if ((availableEnergy[type] || 0) < required) {
                    return { success: false, error: `Not enough ${type} energy (need ${required}, have ${availableEnergy[type] || 0})` };
                }
                // Use up the specific energy type
                availableEnergy[type] -= required;
            }
        }

        // Now handle colorless energy requirements - can use any remaining energy
        const colorlessRequired = requiredEnergy['colorless'] || 0;
        if (colorlessRequired > 0) {
            const totalRemainingEnergy = Object.values(availableEnergy).reduce((sum, count) => sum + count, 0);
            if (totalRemainingEnergy < colorlessRequired) {
                return { success: false, error: `Not enough energy for colorless cost (need ${colorlessRequired} more energy of any type)` };
            }
        }

        return { success: true };
    }

    // Execute an attack (improved version that calls actual attack methods)
    async executeAttack(attackingPokemon, defendingPokemon, attack) {
        console.log('=== EXECUTE ATTACK CALLED ===');
        console.log('Attacking Pokemon:', attackingPokemon?.cardName);
        console.log('Defending Pokemon:', defendingPokemon?.cardName);
        console.log('Attack object:', attack);
        
        if (!defendingPokemon) {
            return { message: 'No target to attack' };
        }

        let damage = 0;
        let effects = [];
        
        // Update opponent reference for the attacking Pokemon
        if (attackingPokemon.owner) {
            attackingPokemon.owner.opponent = {
                activePokemon: defendingPokemon,
                bench: [] // Add empty bench for now
            };
            
            // Provide server-side guiHook with coin flip functionality
            const game = this; // Capture reference to the game instance
            attackingPokemon.owner.guiHook = {
                async coinFlip() {
                    const result = Math.random() < 0.5;
                    console.log(`Server coin flip result: ${result ? 'heads' : 'tails'}`);
                    
                    // Broadcast coin flip to all clients
                    game.broadcastCoinFlip(result, attackingPokemon.owner.username || attackingPokemon.cardName);
                    
                    return result;
                },
                damageCardElement(pokemon, damage) {
                    // Server-side damage is handled by the game state, no UI updates needed
                    console.log(`Server: ${pokemon.cardName} takes ${damage} damage`);
                },
                handleKnockout(pokemon) {
                    // Find which player owns this Pokemon and handle knockout
                    const playerNumber = attackingPokemon.owner === game.gameState.player1 ? 1 : 2;
                    const player = playerNumber === 1 ? game.gameState.player1 : game.gameState.player2;
                    
                    // Determine if this is active or bench Pokemon
                    if (player.activePokemon && player.activePokemon.id === pokemon.id) {
                        game.handleKnockout(player, 'active', 0);
                    } else {
                        // Find on bench
                        const benchIndex = player.bench.findIndex(p => p && p.id === pokemon.id);
                        if (benchIndex !== -1) {
                            game.handleKnockout(player, 'bench', benchIndex);
                        }
                    }
                }
            };
        }
        
        // Convert attack name to method name (remove spaces and keep PascalCase)
        const methodName = attack.name.replace(/\s+/g, '');
        
        // Try to use callback first, then fall back to method name
        let attackMethod = null;
        if (attack.callback && typeof attack.callback === 'function') {
            console.log(`Using callback for ${attack.name}`);
            attackMethod = attack.callback.bind(attackingPokemon);
        } else if (attackingPokemon[methodName] && typeof attackingPokemon[methodName] === 'function') {
            console.log(`Using method ${methodName} for ${attack.name}`);
            attackMethod = attackingPokemon[methodName].bind(attackingPokemon);
        }
        
        // If we found an attack method, call it
        if (attackMethod) {
            try {
                console.log(`Calling attack method for ${attack.name} on ${attackingPokemon.cardName}`);
                const initialHp = defendingPokemon.hp;
                const initialStatusConditions = [...(defendingPokemon.statusConditions || [])];
                
                // Call the actual attack method
                await attackMethod();
                
                // Calculate damage dealt by comparing HP before and after
                damage = Math.max(0, initialHp - defendingPokemon.hp);
                
                // Check for new status effects
                const newStatusConditions = defendingPokemon.statusConditions || [];
                const addedEffects = newStatusConditions.filter(effect => 
                    !initialStatusConditions.includes(effect)
                );
                effects.push(...addedEffects);
                
            } catch (error) {
                console.error(`Error executing attack ${attack.name}:`, error);
                // Fallback to basic damage calculation
                damage = this.getBasicAttackDamage(attack.name);
                defendingPokemon.hp = Math.max(0, defendingPokemon.hp - damage);
            }
        } else {
            // Fallback to basic damage calculation if method not found
            console.log(`Using fallback damage for ${attack.name} (method ${methodName} not found)`);
            console.log(`Available methods on Pokemon:`, Object.getOwnPropertyNames(attackingPokemon).filter(name => typeof attackingPokemon[name] === 'function'));
            damage = this.getBasicAttackDamage(attack.name);
            
            // Enhanced debugging for HP modification
            console.log(`BEFORE DAMAGE - Defending Pokemon HP: ${defendingPokemon.hp}`);
            console.log(`Calculated damage: ${damage}`);
            console.log(`Defending Pokemon reference:`, {
                cardName: defendingPokemon.cardName,
                maxHp: defendingPokemon.maxHp,
                currentHp: defendingPokemon.hp,
                objectId: defendingPokemon.id || 'no-id'
            });
            
            defendingPokemon.hp = Math.max(0, defendingPokemon.hp - damage);
            
            console.log(`AFTER DAMAGE - Defending Pokemon HP: ${defendingPokemon.hp}`);
        }

        // Check if Pokemon was knocked out
        if (defendingPokemon.hp <= 0) {
            effects.push('knocked_out');
        }

        return {
            damage: damage,
            targetHp: defendingPokemon.hp,
            effects: effects,
            message: `${attackingPokemon.cardName} used ${attack.name}${damage > 0 ? ` dealing ${damage} damage` : ''}!`
        };
    }
    
    // Basic damage calculation fallback
    getBasicAttackDamage(attackName) {
        switch (attackName) {
            case 'Thunder Jolt':
                return 30;
            case 'Confuse Ray':
                return 30;
            case 'Hydro Pump':
                return 40;
            default:
                return 20; // Default damage
        }
    }

    // Execute an ability (simplified version)
    executeAbility(pokemon, ability, player, opponent) {
        // Basic ability execution - can be expanded based on ability descriptions
        if (ability.name === 'Rain Dance') {
            // Allow extra energy attachment (simplified)
            return { message: 'Rain Dance activated - may attach extra Water energy' };
        } else if (ability.name === 'Damage Swap') {
            // Allow damage counter movement (simplified)
            return { message: 'Damage Swap activated - may move damage counters' };
        }

        return { message: `${ability.name} activated` };
    }

    initializeDecks() {
        // Create mapping of card names to their classes
        const cardClassMap = {
            'Alakazam': Alakazam,
            'Blastoise': Blastoise,
            'Pikachu': Pikachu,
            'Growlithe': Growlithe,
            'Arcanine': Arcanine
        };
        
        // Use imported card data from cardData.js
        console.log('Initializing decks with imported card data:', {
            pokemonCards: pokemonCards.length,
            energyCards: energyCards.length
        });
        
        // Create deck for each player (4 Pokemon cards and 8 energy cards of each type)
        const createDeck = (playerNumber) => {
            const deck = [];
            
            // Create a mock owner for server-side cards
            const game = this; // Capture reference to the game instance
            const mockOwner = {
                uuid: `server-player-${playerNumber}`,
                guiHook: {
                    coinFlip: () => {
                        const result = Math.random() < 0.5;
                        // Broadcast coin flip to all clients (note: this is synchronous)
                        game.broadcastCoinFlip(result, `Player ${playerNumber}`);
                        return result;
                    },
                    damageCardElement: (card, damage) => {},
                    healCardElement: (card, amount) => {},
                    handleKnockout: (pokemon) => {
                        // Find which player owns this Pokemon and handle knockout
                        const player = playerNumber === 1 ? game.gameState.player1 : game.gameState.player2;
                        
                        // Determine if this is active or bench Pokemon
                        if (player.activePokemon && player.activePokemon.id === pokemon.id) {
                            game.handleKnockout(player, 'active', 0);
                        } else {
                            // Find on bench
                            const benchIndex = player.bench.findIndex(p => p && p.id === pokemon.id);
                            if (benchIndex !== -1) {
                                game.handleKnockout(player, 'bench', benchIndex);
                            }
                        }
                    },
                    selectFromCards: async (cards) => cards[0] // Default to first card
                },
                opponent: null // Will be set after both players are created
            };
            
            // Add Pokemon cards (4 of each)
            for (let i = 0; i < 10; i++) {
                pokemonCards.forEach(template => {
                    const CardClass = cardClassMap[template.name];
                    if (CardClass) {
                        const cardInstance = new CardClass(mockOwner);
                        // Override the ID for server tracking
                        cardInstance.id = uuidv4();
                        deck.push(cardInstance);
                    } else {
                        // Fallback to plain object if class not found
                        deck.push({
                            id: uuidv4(),
                            cardName: template.name,
                            type: template.type,
                            maxHp: template.hp,
                            hp: template.hp,
                            imgUrl: template.imgUrl,
                            statusConditions: [],
                            attachedEnergy: [],
                            abilities: template.abilities || [],
                            attacks: template.attacks || []
                        });
                    }
                });
            }
            
            // Add Energy cards (8 of each type)
            for (let i = 0; i < 8; i++) {
                energyCards.forEach(template => {
                    deck.push({
                        id: uuidv4(),
                        cardName: template.name,
                        type: template.type,
                        energyType: template.energyType,
                        imgUrl: template.imgUrl,
                        statusConditions: []
                    });
                });
            }
            
            return deck;
        };
        
        // Create and shuffle decks
        this.gameState.player1.deck = this.shuffleDeck(createDeck(1));
        this.gameState.player2.deck = this.shuffleDeck(createDeck(2));
        
        // Set up opponent references for card instances
        this.setupCardOpponentReferences();
        
        // Log deck composition for verification
        console.log('Deck composition (shuffled):');
        console.log('- Pokemon cards: 4 of each type (' + pokemonCards.length * 4 + ' total)');
        console.log('- Energy cards: 8 of each type (' + energyCards.length * 8 + ' total)');
        console.log('- Total deck size: ' + this.gameState.player1.deck.length + ' cards');
        console.log('- Decks have been shuffled using Fisher-Yates algorithm');
        
        // Draw initial hands (7 cards each)
        this.gameState.player1.hand = this.gameState.player1.deck.splice(0, 7);
        this.gameState.player2.hand = this.gameState.player2.deck.splice(0, 7);
        
        // Set up prize cards (6 cards each)
        for (let i = 0; i < 6; i++) {
            if (this.gameState.player1.deck.length > 0) {
                this.gameState.player1.prizeCards[i] = this.gameState.player1.deck.splice(0, 1)[0];
            }
            if (this.gameState.player2.deck.length > 0) {
                this.gameState.player2.prizeCards[i] = this.gameState.player2.deck.splice(0, 1)[0];
            }
        }
        
        this.logAction('Game initialized with shuffled decks, hands, and prize cards');
        
        // Debug: Log initial prize cards
        console.log('DEBUG: Initial prize cards for player 1:', this.gameState.player1.prizeCards.map(card => card ? card.cardName : 'null'));
        console.log('DEBUG: Initial prize cards for player 2:', this.gameState.player2.prizeCards.map(card => card ? card.cardName : 'null'));
        
        // Start the first turn (Player 1 draws their first card)
        this.startTurn();
    }
    
    // TEST METHOD: Manually damage a Pokemon to test knockout logic
    testKnockout() {
        console.log('DEBUG: Testing knockout logic...');
        
        // Find the first Pokemon in player 1's active or bench
        let targetPokemon = this.gameState.player1.activePokemon;
        if (!targetPokemon && this.gameState.player1.bench.length > 0) {
            targetPokemon = this.gameState.player1.bench.find(p => p !== null);
        }
        
        if (targetPokemon) {
            console.log(`DEBUG: Found test target: ${targetPokemon.cardName} with ${targetPokemon.hp} HP`);
            console.log(`DEBUG: Prize cards value on target: ${targetPokemon.prizeCards}`);
            
            // Manually set HP to 0 to trigger knockout
            targetPokemon.hp = 0;
            
            // Manually trigger the knockout handler
            if (targetPokemon.owner && targetPokemon.owner.guiHook && targetPokemon.owner.guiHook.handleKnockout) {
                targetPokemon.owner.guiHook.handleKnockout(targetPokemon);
            } else {
                console.log('DEBUG: No handleKnockout method available on target Pokemon owner');
            }
        } else {
            console.log('DEBUG: No target Pokemon found for knockout test');
        }
    }
    
    // Set up opponent references for all card instances
    setupCardOpponentReferences() {
        const updateOpponentRefs = (cards, opponentPlayer) => {
            cards.forEach(card => {
                if (card.owner && card.owner.guiHook) {
                    card.owner.opponent = {
                        activePokemon: opponentPlayer.activePokemon,
                        bench: opponentPlayer.bench
                    };
                }
            });
        };
        
        // Update all cards in both players' decks, hands, etc.
        updateOpponentRefs(this.gameState.player1.deck, this.gameState.player2);
        updateOpponentRefs(this.gameState.player1.hand, this.gameState.player2);
        updateOpponentRefs(this.gameState.player2.deck, this.gameState.player1);
        updateOpponentRefs(this.gameState.player2.hand, this.gameState.player1);
    }
    
    // Server-side card movement validation and execution
    moveCard(playerNumber, fromType, fromIndex, toType, toIndex) {
        const player = playerNumber === 1 ? this.gameState.player1 : this.gameState.player2;
        const opponent = playerNumber === 1 ? this.gameState.player2 : this.gameState.player1;
        
        // Validate it's the player's turn
        if (this.gameState.currentPlayer !== playerNumber) {
            return { success: false, error: 'Not your turn' };
        }
        
        // Get the card being moved
        let card = null;
        switch (fromType) {
            case 'hand':
                card = player.hand[fromIndex];
                break;
            case 'bench':
                card = player.bench[fromIndex];
                break;
            case 'active':
                card = player.activePokemon;
                break;
            default:
                return { success: false, error: 'Invalid source location' };
        }
        
        if (!card) {
            return { success: false, error: 'No card at source location' };
        }
        
        // Validate the move based on game rules
        const validation = this.validateMove(playerNumber, fromType, fromIndex, toType, toIndex, card);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }
        
        // Execute the move
        this.executeMove(playerNumber, fromType, fromIndex, toType, toIndex, card);
        
        this.logAction(`Player ${playerNumber} moved ${card.cardName} from ${fromType} to ${toType}`);
        
        return { success: true };
    }
    
    validateMove(playerNumber, fromType, fromIndex, toType, toIndex, card) {
        const player = playerNumber === 1 ? this.gameState.player1 : this.gameState.player2;
        
        // Energy attachment validation
        if (card.type === 'energy') {
            if (toType === 'attach') {
                // Check if player has already attached energy this turn
                console.log(`DEBUG: Server energy attachment validation for Player ${playerNumber}:`, {
                    playerEnergyFlag: player.energyAttachedThisTurn,
                    currentPlayer: this.gameState.currentPlayer,
                    turn: this.gameState.turn,
                    playerNumber: playerNumber
                });
                
                if (player.energyAttachedThisTurn) {
                    console.log(`DEBUG: Server rejecting energy attachment - flag is true for Player ${playerNumber}`);
                    return { valid: false, error: 'Can only attach one energy per turn' };
                }
                
                // Validate target Pokemon exists
                const targetPokemon = toIndex === 'active' ? player.activePokemon : player.bench[parseInt(toIndex)];
                if (!targetPokemon) {
                    return { valid: false, error: 'No Pokemon at target location' };
                }
                
                return { valid: true };
            }
        }
        
        // Pokemon placement validation
        if (card.type !== 'energy') {
            switch (toType) {
                case 'active':
                    // Can only place one active Pokemon
                    if (player.activePokemon !== null) {
                        return { valid: false, error: 'Active Pokemon slot already occupied' };
                    }
                    break;
                    
                case 'bench':
                    // Bench has max 5 slots
                    if (toIndex < 0 || toIndex >= 5) {
                        return { valid: false, error: 'Invalid bench position' };
                    }
                    if (player.bench[toIndex] !== null) {
                        return { valid: false, error: 'Bench position already occupied' };
                    }
                    break;
                    
                case 'discard':
                    // Cards can always be discarded (unless specific rules prevent it)
                    break;
                    
                default:
                    return { valid: false, error: 'Invalid destination' };
            }
        }
        
        return { valid: true };
    }
    
    executeMove(playerNumber, fromType, fromIndex, toType, toIndex, card) {
        const player = playerNumber === 1 ? this.gameState.player1 : this.gameState.player2;
        
        // Handle energy attachment
        if (card.type === 'energy' && toType === 'attach') {
            // Remove energy from hand
            const energyCard = player.hand.splice(fromIndex, 1)[0];
            
            // Attach to target Pokemon
            const targetPokemon = toIndex === 'active' ? player.activePokemon : player.bench[parseInt(toIndex)];
            if (!targetPokemon.attachedEnergy) {
                targetPokemon.attachedEnergy = [];
            }
            // Store the full energy card object
            targetPokemon.attachedEnergy.push(energyCard);
            
            // Mark that player has attached energy this turn
            player.energyAttachedThisTurn = true;
            
            this.logAction(`Player ${playerNumber} attached ${energyCard.cardName} to ${targetPokemon.cardName}`);
            return;
        }
        
        // Get the actual card with all its current state (including attached energy)
        let actualCard = card;
        switch (fromType) {
            case 'hand':
                actualCard = player.hand[fromIndex];
                player.hand.splice(fromIndex, 1);
                break;
            case 'bench':
                actualCard = player.bench[fromIndex];
                player.bench[fromIndex] = null;
                break;
            case 'active':
                actualCard = player.activePokemon;
                player.activePokemon = null;
                break;
        }
        
        // Place card in destination (preserving all state including attached energy)
        switch (toType) {
            case 'active':
                player.activePokemon = actualCard;
                break;
            case 'bench':
                player.bench[toIndex] = actualCard;
                break;
            case 'discard':
                // If discarding a Pokemon, decompose into separate discard entries
                if (actualCard && actualCard.type === 'pokemon') {
                    const discardEntries = this.collectDiscardEntries(actualCard);
                    discardEntries.forEach(entry => player.discardPile.push(entry));
                } else {
                    player.discardPile.push(actualCard);
                }
                break;
        }
    }

    // Collect discardable entries when a Pokemon is discarded (attached energy and evolution stack)
    collectDiscardEntries(pokemonCard) {
        const entries = [];

        if (!pokemonCard) return entries;

        // If the pokemon has an evolutionStack, push each previous evolution as its own discard entry
        if (pokemonCard.evolutionStack && Array.isArray(pokemonCard.evolutionStack)) {
            // Push in order from oldest to newest
            pokemonCard.evolutionStack.forEach(prev => {
                if (prev) entries.push(prev);
                // Also if previous forms had attached energy arrays, push those energies separately
                if (prev && prev.attachedEnergy && Array.isArray(prev.attachedEnergy)) {
                    prev.attachedEnergy.forEach(en => entries.push(en));
                    prev.attachedEnergy = [];
                }
            });
            // Clear the evolution stack from the card to avoid duplication
            pokemonCard.evolutionStack = [];
        }

        // Push the top form itself as a discard entry
        entries.push(pokemonCard);

        // If the top form has attachedEnergy, push each energy as its own discard entry
        if (pokemonCard.attachedEnergy && Array.isArray(pokemonCard.attachedEnergy)) {
            pokemonCard.attachedEnergy.forEach(energyCard => entries.push(energyCard));
            pokemonCard.attachedEnergy = [];
        }

        // Backwards compatibility: old 'energy' array
        if (pokemonCard.energy && Array.isArray(pokemonCard.energy)) {
            pokemonCard.energy.forEach(energyType => {
                const energyCard = {
                    cardName: `${energyType} Energy`,
                    type: 'Energy',
                    energyType: energyType,
                    id: this.generateUUID ? this.generateUUID() : uuidv4(),
                    imgUrl: `../../Cards/Base/Base Set/${energyType}_Energy.png`
                };
                entries.push(energyCard);
            });
            pokemonCard.energy = [];
        }

        return entries;
    }
    
    // Attack execution
    executeAttack(playerNumber, attackName, targetType, targetIndex) {
        // Validate it's the player's turn and attack phase
        if (this.gameState.currentPlayer !== playerNumber) {
            return { success: false, error: 'Not your turn' };
        }
        
        if (this.gameState.phase !== 'attack') {
            return { success: false, error: 'Not in attack phase' };
        }
        
        if (this.gameState.attackedThisTurn) {
            return { success: false, error: 'Already attacked this turn' };
        }
        
        const player = playerNumber === 1 ? this.gameState.player1 : this.gameState.player2;
        const opponent = playerNumber === 1 ? this.gameState.player2 : this.gameState.player1;
        
        const attacker = player.activePokemon;
        if (!attacker) {
            return { success: false, error: 'No active Pokemon to attack with' };
        }
        
        // Get target
        let target = null;
        if (targetType === 'active') {
            target = opponent.activePokemon;
        } else if (targetType === 'bench') {
            target = opponent.bench[targetIndex];
        }
        
        if (!target) {
            return { success: false, error: 'Invalid target' };
        }
        
        // Execute attack logic (simplified)
        const damage = this.calculateAttackDamage(attacker, attackName, target);
        target.health -= damage;
        
        if (target.health <= 0) {
            target.health = 0;
            this.handleKnockout(opponent, targetType, targetIndex);
        }
        
        this.gameState.attackedThisTurn = true;
        this.logAction(`Player ${playerNumber}'s ${attacker.cardName} attacked ${target.cardName} for ${damage} damage`);
        
        return { success: true, damage };
    }
    
    calculateAttackDamage(attacker, attackName, target) {
        // Simplified damage calculation
        // In a real implementation, this would use the actual card class attack methods
        const baseDamage = {
            'Spark': 20,
            'Confuse Ray': 30,
            'Hydro Pump': 40,
            'Thunder Shock': 10
        };
        
        return baseDamage[attackName] || 20;
    }
    
    handleKnockout(player, cardType, cardIndex) {
        let knockedOutCard = null;
        
        console.log(`DEBUG: handleKnockout called for ${cardType} at index ${cardIndex}`);
        
        if (cardType === 'active') {
            knockedOutCard = player.activePokemon;
            player.activePokemon = null;
        } else if (cardType === 'bench') {
            knockedOutCard = player.bench[cardIndex];
            player.bench[cardIndex] = null;
        }
        
        if (knockedOutCard) {
            console.log(`DEBUG: Knocked out Pokemon: ${knockedOutCard.cardName}, prizeCards value: ${knockedOutCard.prizeCards}`);
            
            // Decompose the knocked out Pokemon and push separate discard entries (previous evolutions + top form + attached energies)
            const discardEntries = this.collectDiscardEntries(knockedOutCard);
            discardEntries.forEach(entry => player.discardPile.push(entry));
            this.logAction(`Discarded ${discardEntries.length} entries from knocked out ${knockedOutCard.cardName}`);
            
            // Handle prize card drawing for the opponent
            const opponent = player === this.gameState.player1 ? this.gameState.player2 : this.gameState.player1;
            const prizeCardsToTake = knockedOutCard.prizeCards || 1;
            
            console.log(`DEBUG: Opponent should draw ${prizeCardsToTake} prize cards`);
            console.log(`DEBUG: Opponent prize cards before:`, opponent.prizeCards.map(card => card ? card.cardName : 'null'));
            
            this.drawPrizeCards(opponent, prizeCardsToTake);
            
            this.logAction(`${knockedOutCard.cardName} was knocked out! Opponent draws ${prizeCardsToTake} prize card(s)`);
            
            // Broadcast the knockout event to all clients
            this.broadcastKnockout(knockedOutCard, opponent, prizeCardsToTake);
            
            // Broadcast updated game state to show cards in discard pile
            this.broadcastGameState();
        } else {
            console.log(`DEBUG: No knocked out card found for ${cardType} at index ${cardIndex}`);
        }
    }
    
    // Draw prize cards for a player
    drawPrizeCards(player, numCards) {
        let cardsDrawn = 0;
        
        console.log(`DEBUG: Attempting to draw ${numCards} prize cards`);
        console.log(`DEBUG: Prize cards array length: ${player.prizeCards.length}`);
        console.log(`DEBUG: Prize cards content:`, player.prizeCards.map(card => card ? card.cardName : 'null'));
        
        for (let i = 0; i < player.prizeCards.length && cardsDrawn < numCards; i++) {
            if (player.prizeCards[i] !== null) {
                const prizeCard = player.prizeCards[i];
                player.hand.push(prizeCard);
                player.prizeCards[i] = null;
                cardsDrawn++;
                this.logAction(`Player drew prize card: ${prizeCard.cardName}`);
            }
        }
        
        if (cardsDrawn > 0) {
            this.logAction(`Player drew ${cardsDrawn} prize card(s)`);
        } else {
            console.log(`DEBUG: No prize cards were drawn - all slots were null`);
        }
        
        return cardsDrawn;
    }

    // Evolution system
    evolveCard(playerNumber, evolutionCardIndex, targetPokemonLocation, targetPokemonIndex) {
        const player = playerNumber === 1 ? this.gameState.player1 : this.gameState.player2;
        
        // Validate it's the player's turn
        if (this.gameState.currentPlayer !== playerNumber) {
            return { success: false, error: 'Not your turn' };
        }
        
        // Get the evolution card from hand
        const evolutionCard = player.hand[evolutionCardIndex];
        if (!evolutionCard) {
            return { success: false, error: 'Evolution card not found in hand' };
        }
        
        // Get the target Pokemon to evolve
        let targetPokemon = null;
        if (targetPokemonLocation === 'active') {
            targetPokemon = player.activePokemon;
        } else if (targetPokemonLocation === 'bench') {
            targetPokemon = player.bench[targetPokemonIndex];
        } else {
            return { success: false, error: 'Invalid target location' };
        }
        
        if (!targetPokemon) {
            return { success: false, error: 'No Pokemon at target location' };
        }
        
        // Check if evolution is valid
        const validation = this.validateEvolution(evolutionCard, targetPokemon);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }
        
        // Execute the evolution
        this.executeEvolution(player, evolutionCard, targetPokemon, targetPokemonLocation, targetPokemonIndex);
        
        this.logAction(`Player ${playerNumber} evolved ${targetPokemon.cardName} into ${evolutionCard.cardName}`);
        
        return { success: true };
    }
    
    validateEvolution(evolutionCard, targetPokemon) {
        // Check if the evolution card can evolve from the target Pokemon
        if (!evolutionCard.evolvesFrom) {
            return { valid: false, error: 'This card cannot evolve from any Pokemon' };
        }
        
        if (evolutionCard.evolvesFrom !== targetPokemon.pokemon) {
            return { 
                valid: false, 
                error: `${evolutionCard.cardName} can only evolve from ${evolutionCard.evolvesFrom}, not ${targetPokemon.pokemon}` 
            };
        }
        
        return { valid: true };
    }
    
    executeEvolution(player, evolutionCard, targetPokemon, targetLocation, targetIndex) {
        // Remove evolution card from hand
        const handIndex = player.hand.indexOf(evolutionCard);
        player.hand.splice(handIndex, 1);
        
        // Preserve important state from the target Pokemon
        const currentHp = targetPokemon.hp;
        const currentDamage = targetPokemon.maxHp - currentHp;
        const attachedEnergy = targetPokemon.attachedEnergy || [];
        const statusConditions = targetPokemon.statusConditions || [];
        
        // Create the evolved Pokemon with preserved state and evolution stack
        const evolvedPokemon = {
            ...evolutionCard,
            hp: evolutionCard.hp - currentDamage, // Preserve damage taken
            maxHp: evolutionCard.hp,
            attachedEnergy: attachedEnergy, // Preserve attached energy
            statusConditions: statusConditions, // Preserve status conditions
            evolutionStack: [
                ...(targetPokemon.evolutionStack || []), // Preserve any existing evolution stack
                targetPokemon // Add the current Pokemon to the stack
            ]
        };
        
        // Make sure HP doesn't go below 0 or above max
        evolvedPokemon.hp = Math.max(0, Math.min(evolvedPokemon.hp, evolvedPokemon.maxHp));
        
        // Place the evolved Pokemon in the target location
        if (targetLocation === 'active') {
            player.activePokemon = evolvedPokemon;
        } else if (targetLocation === 'bench') {
            player.bench[targetIndex] = evolvedPokemon;
        }
        
        // Note: Pre-evolution Pokemon is now stored in evolutionStack, not discarded
    }
    
    // Helper method to get evolution stack for a Pokemon
    getEvolutionStack(pokemon) {
        return pokemon.evolutionStack || [];
    }
    
    // Helper method to devolve a Pokemon (for future devolution cards)
    devolvePokemon(pokemon, stages = 1) {
        if (!pokemon.evolutionStack || pokemon.evolutionStack.length === 0) {
            return null; // Cannot devolve - no evolution stack
        }
        
        let devolvedPokemon = pokemon;
        const discardedEvolutions = [];
        
        // Devolve the specified number of stages
        for (let i = 0; i < stages && devolvedPokemon.evolutionStack.length > 0; i++) {
            // Store the current evolution for discard
            const currentForm = {
                ...devolvedPokemon,
                evolutionStack: undefined // Don't include stack in discarded card
            };
            discardedEvolutions.push(currentForm);
            
            // Revert to previous evolution
            devolvedPokemon = devolvedPokemon.evolutionStack.pop();
            
            // Preserve current damage and energy
            const currentDamage = currentForm.maxHp - currentForm.hp;
            devolvedPokemon.hp = Math.max(0, devolvedPokemon.maxHp - currentDamage);
            devolvedPokemon.attachedEnergy = currentForm.attachedEnergy;
            devolvedPokemon.statusConditions = currentForm.statusConditions;
        }
        
        return {
            devolvedPokemon: devolvedPokemon,
            discardedEvolutions: discardedEvolutions
        };
    }

    // Broadcast knockout event to all clients
    broadcastKnockout(knockedOutCard, winner, prizeCardsDrawn) {
        if (!this.socketManager) return;
        
        const knockoutData = {
            knockedOutCard: {
                cardName: knockedOutCard.cardName,
                prizeCards: knockedOutCard.prizeCards || 1
            },
            winner: winner === this.gameState.player1 ? 1 : 2,
            prizeCardsDrawn: prizeCardsDrawn
        };
        
        // Send to both players
        this.socketManager.sendToPlayer(1, 'pokemon_knockout', knockoutData);
        this.socketManager.sendToPlayer(2, 'pokemon_knockout', knockoutData);
        
        console.log(`Broadcasting Pokemon knockout: ${knockedOutCard.cardName}, winner draws ${prizeCardsDrawn} prize cards`);
    }
    
    // Generate UUID helper method
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    // Draw a card from deck to hand
    drawCard(playerNumber) {
        const player = playerNumber === 1 ? this.gameState.player1 : this.gameState.player2;
        
        if (player.deck.length === 0) {
            // No cards left to draw - this could be a win condition
            this.logAction(`Player ${playerNumber} cannot draw - deck is empty`);
            return { success: false, reason: 'deck_empty' };
        }
        
        const drawnCard = player.deck.pop(); // Draw from top of deck
        player.hand.push(drawnCard);
        
        this.logAction(`Player ${playerNumber} drew a card (${drawnCard.cardName})`);
        return { success: true, card: drawnCard };
    }

    // Start turn actions (including card draw)
    startTurn() {
        const currentPlayerNumber = this.gameState.currentPlayer;
        const currentPlayer = currentPlayerNumber === 1 ? this.gameState.player1 : this.gameState.player2;
        
        // Reset turn-specific flags for the player starting their turn
        currentPlayer.energyAttachedThisTurn = false;
        currentPlayer.supporterPlayedThisTurn = false;
        currentPlayer.stadiumPlayedThisTurn = false;
        
        console.log(`DEBUG: Turn ${this.gameState.turn} start - Reset flags for Player ${currentPlayerNumber}:`, {
            energyAttachedThisTurn: currentPlayer.energyAttachedThisTurn,
            supporterPlayedThisTurn: currentPlayer.supporterPlayedThisTurn,
            stadiumPlayedThisTurn: currentPlayer.stadiumPlayedThisTurn
        });
        
        // Player 1 draws a card at the start of their turn (including turn 1)
        // Player 2 draws a card at the start of their turn (but not turn 1 since they go second)
        const shouldDrawCard = (currentPlayerNumber === 1) || (currentPlayerNumber === 2 && this.gameState.turn > 1);
        
        if (shouldDrawCard) {
            const drawResult = this.drawCard(currentPlayerNumber);
            if (!drawResult.success && drawResult.reason === 'deck_empty') {
                // Handle deck-out loss condition if needed
                this.logAction(`Player ${currentPlayerNumber} loses - cannot draw from empty deck`);
            }
        }
        
        this.logAction(`Turn ${this.gameState.turn} - Player ${currentPlayerNumber}'s turn begins`);
    }

    // Turn management
    endTurn() {
        // Reset turn-specific flags
        const currentPlayer = this.gameState.currentPlayer === 1 ? this.gameState.player1 : this.gameState.player2;
        currentPlayer.energyAttachedThisTurn = false;
        currentPlayer.supporterPlayedThisTurn = false;
        currentPlayer.stadiumPlayedThisTurn = false;
        
        console.log(`DEBUG: Turn ${this.gameState.turn} end - Reset flags for Player ${this.gameState.currentPlayer}:`, {
            energyAttachedThisTurn: currentPlayer.energyAttachedThisTurn,
            supporterPlayedThisTurn: currentPlayer.supporterPlayedThisTurn,
            stadiumPlayedThisTurn: currentPlayer.stadiumPlayedThisTurn
        });
        
        this.gameState.drewCard = false;
        this.gameState.attackedThisTurn = false;
        
        // Switch to next player
        this.gameState.currentPlayer = this.gameState.currentPlayer === 1 ? 2 : 1;
        this.gameState.turn++;
        this.gameState.phase = 'main';
        
        // Start the new turn (including card draw)
        this.startTurn();
    }
    
    // Get safe game state for client (hides opponent's hand)
    getGameStateForPlayer(playerNumber) {
        const isPlayer1 = playerNumber === 1;
        const yourState = isPlayer1 ? this.gameState.player1 : this.gameState.player2;
        const opponentState = isPlayer1 ? this.gameState.player2 : this.gameState.player1;
        
        // Debug: Log the HP values being sent
        console.log(`Getting game state for player ${playerNumber}:`);
        if (yourState.activePokemon) {
            console.log(`Your active Pokemon (${yourState.activePokemon.cardName}) HP: ${yourState.activePokemon.hp}`);
        }
        if (opponentState.activePokemon) {
            console.log(`Opponent active Pokemon (${opponentState.activePokemon.cardName}) HP: ${opponentState.activePokemon.hp}`);
        }
        
        // Helper function to clean card data for JSON serialization (removes circular references)
        const cleanCardData = (card) => {
            if (!card) return null;
            
            // Create a clean copy without circular references
            return {
                id: card.id,
                cardName: card.cardName,
                name: card.name,
                type: card.type,
                energyType: card.energyType,
                maxHp: card.maxHp,
                hp: card.hp,
                imgUrl: card.imgUrl,
                statusConditions: card.statusConditions || [],
                attachedEnergy: card.attachedEnergy || [],
                weakness: card.weakness,
                resistance: card.resistance,
                retreatCost: card.retreatCost,
                // Include abilities and attacks data without the callback functions
                abilities: card.abilities ? (Array.isArray(card.abilities) 
                    ? card.abilities.map(ability => ({
                        name: ability.name,
                        description: ability.description || '',
                        event: ability.event,
                        hasValidator: !!(ability.effectValidator)
                    }))
                    : Object.keys(card.abilities).map(abilityName => ({
                        name: abilityName,
                        description: card.abilities[abilityName].description || '',
                        event: card.abilities[abilityName].event,
                        hasValidator: !!(card.abilities[abilityName].effectValidator)
                    }))
                ) : [],
                attacks: card.attacks ? Object.keys(card.attacks).map(attackName => ({
                    name: attackName,
                    description: card.attacks[attackName].description || '',
                    cost: card.attacks[attackName].cost || [],
                    energyCost: card.attacks[attackName].energyCost || card.attacks[attackName].cost || [],
                    damage: card.attacks[attackName].damage
                })) : []
            };
        };
        
        // Helper function to clean player state
        const cleanPlayerState = (playerState) => {
            return {
                activePokemon: cleanCardData(playerState.activePokemon),
                bench: playerState.bench.map(card => cleanCardData(card)),
                hand: playerState.hand.map(card => cleanCardData(card)),
                deck: [], // Don't send deck contents for security
                deckCount: playerState.deck.length,
                discardPile: playerState.discardPile.map(card => cleanCardData(card)),
                prizeCards: playerState.prizeCards.map(card => cleanCardData(card)),
                energyAttachedThisTurn: playerState.energyAttachedThisTurn || false,
                supporterPlayedThisTurn: playerState.supporterPlayedThisTurn || false,
                stadiumPlayedThisTurn: playerState.stadiumPlayedThisTurn || false,
                abilitiesUsedThisTurn: Array.from(playerState.abilitiesUsedThisTurn || [])
            };
        };
        
        const cleanYourState = cleanPlayerState(yourState);
        const cleanOpponentState = cleanPlayerState(opponentState);
        
        // Hide opponent's hand but show hand count
        cleanOpponentState.hand = [];
        cleanOpponentState.handCount = opponentState.hand.length;
        
        return {
            yourState: cleanYourState,
            opponentState: cleanOpponentState,
            turn: this.gameState.turn,
            currentPlayer: this.gameState.currentPlayer,
            phase: this.gameState.phase,
            attackedThisTurn: this.gameState.attackedThisTurn, // Include attack state for timing validation
            isYourTurn: this.gameState.currentPlayer === playerNumber,
            gameLog: this.gameState.gameLog.slice(-10) // Last 10 actions
        };
    }
    
    logAction(action) {
        this.gameState.gameLog.push({
            turn: this.gameState.turn,
            timestamp: new Date(),
            action: action
        });
        console.log(`[Game ${this.id}] ${action}`);
    }

    // Broadcast current game state to all connected players
    broadcastGameState() {
        if (!this.socketManager) return;
        
        // Send to player 1
        const player1State = this.getGameStateForPlayer(1);
        this.socketManager.sendToPlayer(1, 'game_state_update', {
            gameState: player1State
        });
        
        // Send to player 2
        const player2State = this.getGameStateForPlayer(2);
        this.socketManager.sendToPlayer(2, 'game_state_update', {
            gameState: player2State
        });
    }
    
    // Broadcast coin flip result to all connected players
    broadcastCoinFlip(result, playerName = 'A player') {
        if (!this.socketManager) return;
        
        const coinFlipData = {
            result: result,
            player: playerName
        };
        
        // Send to both players
        this.socketManager.sendToPlayer(1, 'coin_flip_show', coinFlipData);
        this.socketManager.sendToPlayer(2, 'coin_flip_show', coinFlipData);
        
        console.log(`Broadcasting coin flip: ${result ? 'heads' : 'tails'} by ${playerName}`);
    }

    // Handle client selection response
    handleCardSelectionResponse(playerNumber, data) {
        if (this.socketManager) {
            // Emit the response for the ability context to handle
            this.socketManager.io.emit('card_selection_response', data);
        }
    }

    // Initialize a test game with some Pokemon for testing abilities
    initializeTestGame() {
        try {
            // Create test Pokemon instances for both players
            const alakazam1 = new Alakazam({ playerNumber: 1 });
            const blastoise1 = new Blastoise({ playerNumber: 1 });
            const pikachu1 = new Pikachu({ playerNumber: 1 });
            
            const alakazam2 = new Alakazam({ playerNumber: 2 });
            const blastoise2 = new Blastoise({ playerNumber: 2 });
            
            // Set up player 1
            this.gameState.player1.activePokemon = alakazam1;
            this.gameState.player1.bench[0] = blastoise1;
            this.gameState.player1.bench[1] = pikachu1;
            
            // Add some damage for testing Damage Swap
            alakazam1.hp = alakazam1.maxHp - 20; // 20 damage
            blastoise1.hp = blastoise1.maxHp - 10; // 10 damage
            
            // Set up player 2
            this.gameState.player2.activePokemon = alakazam2;
            this.gameState.player2.bench[0] = blastoise2;
            
            // Add some Water Energy to hand for Rain Dance testing
            const waterEnergy1 = { 
                id: 'water-energy-1', 
                name: 'Water Energy', 
                type: 'energy', 
                energyType: 'water',
                imgUrl: 'https://images.pokemontcg.io/base1/102_hires.png'
            };
            const waterEnergy2 = { 
                id: 'water-energy-2', 
                name: 'Water Energy', 
                type: 'energy', 
                energyType: 'water',
                imgUrl: 'https://images.pokemontcg.io/base1/102_hires.png'
            };
            
            this.gameState.player1.hand.push(waterEnergy1);
            this.gameState.player2.hand.push(waterEnergy2);
            
            // Set game to main phase so abilities can be used
            this.gameState.phase = 'main';
            this.gameState.currentPlayer = 1; // Player 1 starts
            
            console.log('Test game initialized with Pokemon and abilities ready');
            
        } catch (error) {
            console.error('Error initializing test game:', error);
        }
    }
}

export default ServerGame;