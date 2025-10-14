import { v4 as uuidv4 } from 'uuid';
import { pokemonCards, energyCards } from './cardData.js';

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
    useAttack(playerNumber, attackName) {
        const player = playerNumber === 1 ? this.gameState.player1 : this.gameState.player2;
        const opponent = playerNumber === 1 ? this.gameState.player2 : this.gameState.player1;

        // Validate it's the player's turn
        if (this.gameState.currentPlayer !== playerNumber) {
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
        
        // Find the attack in the Pokemon's attack list
        const attack = activePokemon.attacks?.find(atk => atk.name === attackName);
        if (!attack) {
            return { success: false, error: 'Attack not found' };
        }

        // Check energy requirements
        const energyCheck = this.checkEnergyRequirements(activePokemon, attack.energyCost);
        if (!energyCheck.success) {
            return { success: false, error: energyCheck.error };
        }

        // Execute the attack
        const attackResult = this.executeAttack(activePokemon, opponent.activePokemon, attack);
        
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

        // Check if requirements are met
        const requiredEnergy = {};
        energyCost.forEach(type => {
            requiredEnergy[type] = (requiredEnergy[type] || 0) + 1;
        });

        for (const [type, required] of Object.entries(requiredEnergy)) {
            if ((energyCount[type] || 0) < required) {
                return { success: false, error: `Not enough ${type} energy` };
            }
        }

        return { success: true };
    }

    // Execute an attack (simplified version)
    executeAttack(attackingPokemon, defendingPokemon, attack) {
        if (!defendingPokemon) {
            return { message: 'No target to attack' };
        }

        // Basic attack execution - can be expanded based on attack descriptions
        let damage = 0;
        
        // Simple damage calculation based on attack name
        if (attack.name === 'Thunder Jolt') {
            damage = 30;
            // Implement coin flip logic here if needed
        } else if (attack.name === 'Confuse Ray') {
            damage = 30;
            // Implement confusion status effect here if needed
        } else if (attack.name === 'Hydro Pump') {
            damage = 40;
            // Can add energy-based damage bonus later
        }

        // Apply damage
        defendingPokemon.health = Math.max(0, defendingPokemon.health - damage);
        
        return {
            damage: damage,
            targetHealth: defendingPokemon.health,
            message: `${attackingPokemon.cardName} dealt ${damage} damage to ${defendingPokemon.cardName}`
        };
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
        // Use imported card data from cardData.js
        console.log('Initializing decks with imported card data:', {
            pokemonCards: pokemonCards.length,
            energyCards: energyCards.length
        });
        
        // Create deck for each player (4 Pokemon cards and 8 energy cards of each type)
        const createDeck = () => {
            const deck = [];
            
            // Add Pokemon cards (4 of each)
            for (let i = 0; i < 4; i++) {
                pokemonCards.forEach(template => {
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
            
            // Return unshuffled deck (will be shuffled after creation)
            return deck;
        };
        
        // Create and shuffle decks
        this.gameState.player1.deck = this.shuffleDeck(createDeck());
        this.gameState.player2.deck = this.shuffleDeck(createDeck());
        
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
                if (player.energyAttachedThisTurn) {
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
        
        // Remove card from source
        switch (fromType) {
            case 'hand':
                player.hand.splice(fromIndex, 1);
                break;
            case 'bench':
                player.bench[fromIndex] = null;
                break;
            case 'active':
                player.activePokemon = null;
                break;
        }
        
        // Place card in destination
        switch (toType) {
            case 'active':
                player.activePokemon = card;
                break;
            case 'bench':
                player.bench[toIndex] = card;
                break;
            case 'discard':
                player.discardPile.push(card);
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