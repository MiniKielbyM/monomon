import { v4 as uuidv4 } from 'uuid';
import { pokemonCards, energyCards } from './cardData.js';
import { Card, Energy } from '../Lib/card.js';
import CardsBase1 from '../Lib/Cards/Base/Base1/Cards.js';

const { Alakazam, Blastoise, Pikachu } = CardsBase1;

// Server-side Game class - handles all game logic and state
class ServerGame {
    constructor(player1, player2) {
        this.id = uuidv4();
        this.player1 = { ...player1, playerNumber: 1 };
        this.player2 = { ...player2, playerNumber: 2 };
        this.state = 'waiting_for_ready';
        this.created = new Date();
        
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
                stadiumPlayedThisTurn: false
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
                stadiumPlayedThisTurn: false
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
                    activePokemon.owner.guiHook = {
                        async coinFlip() {
                            const result = Math.random() < 0.5;
                            console.log(`Server coin flip result: ${result ? 'heads' : 'tails'}`);
                            return result;
                        },
                        damageCardElement(pokemon, damage) {
                            console.log(`Server: ${pokemon.cardName} takes ${damage} damage (GUI update skipped)`);
                        },
                        // Store attacking Pokemon type for weakness/resistance calculations
                        attackingPokemonType: activePokemon.type
                    };
                }
                
                // Record initial hp/health values
                const initialDefenderHp = opponent.activePokemon.hp;
                const initialDefenderHealth = opponent.activePokemon.health;
                const initialAttackerHp = activePokemon.hp;
                const initialAttackerHealth = activePokemon.health;
                
                console.log('BEFORE ATTACK:', {
                    defender: {
                        name: opponent.activePokemon.cardName,
                        hp: initialDefenderHp,
                        health: initialDefenderHealth
                    },
                    attacker: {
                        name: activePokemon.cardName,
                        hp: initialAttackerHp,
                        health: initialAttackerHealth
                    }
                });
                
                // Execute the attack callback
                console.log('Calling attack callback...');
                await attack.callback.call(activePokemon);
                
                console.log('AFTER ATTACK:', {
                    defender: {
                        name: opponent.activePokemon.cardName,
                        hp: opponent.activePokemon.hp,
                        health: opponent.activePokemon.health,
                        hpChange: initialDefenderHp - opponent.activePokemon.hp,
                        healthChange: initialDefenderHealth - opponent.activePokemon.health
                    },
                    attacker: {
                        name: activePokemon.cardName,
                        hp: activePokemon.hp,
                        health: activePokemon.health,
                        hpChange: initialAttackerHp - activePokemon.hp,
                        healthChange: initialAttackerHealth - activePokemon.health
                    }
                });
                
                // Calculate damage dealt (use health changes since that's what damage() method modifies)
                const defenderDamage = Math.max(0, initialDefenderHealth - opponent.activePokemon.health);
                const attackerSelfDamage = Math.max(0, initialAttackerHealth - activePokemon.health);
                
                // Sync hp with health (since damage() only modifies health)
                opponent.activePokemon.hp = opponent.activePokemon.health;
                activePokemon.hp = activePokemon.health;
                
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
        
        return { success: true, result: attackResult };
    }

    // Use a Pokemon's ability
    useAbility(playerNumber, abilityName) {
        const player = playerNumber === 1 ? this.gameState.player1 : this.gameState.player2;
        const opponent = playerNumber === 1 ? this.gameState.player2 : this.gameState.player1;

        // Validate it's the player's turn
        if (this.gameState.currentPlayer !== playerNumber) {
            return { success: false, error: 'Not your turn' };
        }

        // Check if player has an active Pokemon
        if (!player.activePokemon) {
            return { success: false, error: 'No active Pokemon' };
        }

        const activePokemon = player.activePokemon;
        
        // Find the ability in the Pokemon's ability list
        const ability = activePokemon.abilities?.find(ab => ab.name === abilityName);
        if (!ability) {
            return { success: false, error: 'Ability not found' };
        }

        // Execute the ability
        const abilityResult = this.executeAbility(activePokemon, ability, player, opponent);
        
        this.logAction(`Player ${playerNumber}'s ${activePokemon.cardName} used ability ${abilityName}`);
        
        return { success: true, result: abilityResult };
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
            attackingPokemon.owner.guiHook = {
                async coinFlip() {
                    const result = Math.random() < 0.5;
                    console.log(`Server coin flip result: ${result ? 'heads' : 'tails'}`);
                    return result;
                },
                damageCardElement(pokemon, damage) {
                    // Server-side damage is handled by the game state, no UI updates needed
                    console.log(`Server: ${pokemon.cardName} takes ${damage} damage`);
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
                const initialHealth = defendingPokemon.health;
                const initialStatusConditions = [...(defendingPokemon.statusConditions || [])];
                
                // Call the actual attack method
                await attackMethod();
                
                // Calculate damage dealt by comparing health before and after
                damage = Math.max(0, initialHealth - defendingPokemon.health);
                
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
                defendingPokemon.health = Math.max(0, defendingPokemon.health - damage);
            }
        } else {
            // Fallback to basic damage calculation if method not found
            console.log(`Using fallback damage for ${attack.name} (method ${methodName} not found)`);
            console.log(`Available methods on Pokemon:`, Object.getOwnPropertyNames(attackingPokemon).filter(name => typeof attackingPokemon[name] === 'function'));
            damage = this.getBasicAttackDamage(attack.name);
            
            // Enhanced debugging for health modification
            console.log(`BEFORE DAMAGE - Defending Pokemon health: ${defendingPokemon.health}`);
            console.log(`Calculated damage: ${damage}`);
            console.log(`Defending Pokemon reference:`, {
                cardName: defendingPokemon.cardName,
                maxHealth: defendingPokemon.maxHealth,
                currentHealth: defendingPokemon.health,
                objectId: defendingPokemon.id || 'no-id'
            });
            
            defendingPokemon.health = Math.max(0, defendingPokemon.health - damage);
            
            console.log(`AFTER DAMAGE - Defending Pokemon health: ${defendingPokemon.health}`);
        }

        // Check if Pokemon was knocked out
        if (defendingPokemon.health <= 0) {
            effects.push('knocked_out');
        }

        return {
            damage: damage,
            targetHealth: defendingPokemon.health,
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
            'Pikachu': Pikachu
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
            const mockOwner = {
                uuid: `server-player-${playerNumber}`,
                guiHook: {
                    coinFlip: () => Math.random() < 0.5,
                    damageCardElement: (card, damage) => {},
                    healCardElement: (card, amount) => {},
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
                            hp: template.hp,
                            health: template.hp,
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
        
        this.logAction('Game initialized with shuffled decks and hands');
        
        // Start the first turn (Player 1 draws their first card)
        this.startTurn();
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
            player.hand.splice(fromIndex, 1);
            
            // Attach to target Pokemon
            const targetPokemon = toIndex === 'active' ? player.activePokemon : player.bench[parseInt(toIndex)];
            if (!targetPokemon.attachedEnergy) {
                targetPokemon.attachedEnergy = [];
            }
            targetPokemon.attachedEnergy.push({
                id: card.id,
                energyType: card.energyType,
                cardName: card.cardName,
                imgUrl: card.imgUrl
            });
            
            // Mark that player has attached energy this turn
            player.energyAttachedThisTurn = true;
            
            this.logAction(`Player ${playerNumber} attached ${card.cardName} to ${targetPokemon.cardName}`);
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
                player.discardPile.push(actualCard);
                break;
        }
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
        
        if (cardType === 'active') {
            knockedOutCard = player.activePokemon;
            player.activePokemon = null;
        } else if (cardType === 'bench') {
            knockedOutCard = player.bench[cardIndex];
            player.bench[cardIndex] = null;
        }
        
        if (knockedOutCard) {
            player.discardPile.push(knockedOutCard);
            this.logAction(`${knockedOutCard.cardName} was knocked out`);
        }
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
        
        return {
            yourState: {
                ...yourState,
                hand: yourState.hand // Player can see their own hand
            },
            opponentState: {
                ...opponentState,
                hand: [], // Hide opponent's hand
                handCount: opponentState.hand.length
            },
            turn: this.gameState.turn,
            currentPlayer: this.gameState.currentPlayer,
            phase: this.gameState.phase,
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
}

export default ServerGame;