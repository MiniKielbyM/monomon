import { Card } from "../../../card.js";
import enums from "../../../enums.js";
const { PokemonType, CardModifiers, AbilityEventListeners } = enums;

// Static registry for ability handlers - will be registered with GUIHookUtils when available
class AbilityRegistry {
    static handlers = new Map();
    static serverCallbacks = new Map();
    static guiHookUtils = null;

    static setGUIHookUtils(guiHookUtils) {
        this.guiHookUtils = guiHookUtils;
        // Register all pending abilities
        for (const [abilityName, handler] of this.handlers) {
            guiHookUtils.registerAbilityHandler(abilityName, handler);
        }
    }

    static registerAbility(abilityName, handler) {
        this.handlers.set(abilityName, handler);
        // If GUIHookUtils is available, register immediately
        if (this.guiHookUtils) {
            this.guiHookUtils.registerAbilityHandler(abilityName, handler);
        }
    }

    static registerServerCallback(abilityName, callback) {
        // Prevent duplicate registrations
        if (this.serverCallbacks.has(abilityName)) {
            console.log(`Server callback for ${abilityName} already registered, skipping`);
            return;
        }
        
        console.log(`Registering server callback for ability: ${abilityName}`);
        this.serverCallbacks.set(abilityName, callback);
        console.log(`Server callbacks now has ${this.serverCallbacks.size} abilities:`, Array.from(this.serverCallbacks.keys()));
    }

    static getServerCallback(abilityName) {
        console.log(`Looking for server callback: ${abilityName}`);
        console.log(`Available server callbacks:`, Array.from(this.serverCallbacks.keys()));
        const callback = this.serverCallbacks.get(abilityName);
        console.log(`Found callback:`, !!callback);
        return callback;
    }
}

// Server-side ability execution context
class ServerAbilityContext {
    constructor(gameState, playerNumber, socketManager) {
        this.gameState = gameState;
        this.playerNumber = playerNumber;
        this.socketManager = socketManager;
        this.player = playerNumber === 1 ? gameState.player1 : gameState.player2;
        this.opponent = playerNumber === 1 ? gameState.player2 : gameState.player1;
    }

    // Request client to select from a list of cards
    async requestCardSelection(cards, options = {}) {
        return new Promise((resolve) => {
            const selectionId = `selection_${Date.now()}_${Math.random()}`;
            
            // Send selection request to client
            this.socketManager.sendToPlayer(this.playerNumber, 'card_selection_request', {
                selectionId,
                cards: cards.map(card => ({
                    id: card.id,
                    name: card.name || card.cardName,
                    type: card.type,
                    hp: card.hp,
                    maxHp: card.maxHp,
                    imgUrl: card.imgUrl,
                    // Add any other data needed for display
                    ...card
                })),
                options: {
                    title: options.title || 'Select a card',
                    subtitle: options.subtitle || 'Choose a card:',
                    cardDisplayFunction: options.cardDisplayFunction,
                    allowCancel: options.allowCancel !== false
                }
            });

            // Listen for the response
            const responseHandler = (data) => {
                if (data.selectionId === selectionId) {
                    this.socketManager.off('card_selection_response', responseHandler);
                    
                    if (data.cancelled || !data.selectedCardId) {
                        resolve(null);
                    } else {
                        // Find the selected card from the original list
                        const selectedCard = cards.find(card => card.id === data.selectedCardId);
                        resolve(selectedCard);
                    }
                }
            };

            this.socketManager.on('card_selection_response', responseHandler);
        });
    }

    // Helper to get all player's Pokemon
    getAllPokemon() {
        return [this.player.activePokemon, ...this.player.bench].filter(card => card !== null);
    }

    // Helper to get damaged Pokemon
    getDamagedPokemon() {
        const allPokemon = this.getAllPokemon();
        console.log('Checking for damaged Pokemon:', allPokemon.map(card => ({
            name: card?.cardName || card?.name,
            hp: card?.hp,
            maxHp: card?.maxHp,
            isDamaged: card && card.hp < card.maxHp
        })));
        
        const damaged = allPokemon.filter(card => card && card.hp < card.maxHp);
        console.log(`Found ${damaged.length} damaged Pokemon out of ${allPokemon.length} total`);
        
        return damaged;
    }

    // Helper to get cards by type
    getCardsByType(location, type) {
        const cards = this.player[location] || [];
        return cards.filter(card => card && card.type === type);
    }

    // Execute damage swap between two Pokemon
    executeDamageSwap(sourcePokemon, targetPokemon, amount = 10) {
        // Heal source
        sourcePokemon.hp = Math.min(sourcePokemon.hp + amount, sourcePokemon.maxHp);
        
        // Damage target
        targetPokemon.hp = Math.max(targetPokemon.hp - amount, 0);
        
        // Log the action
        this.gameState.gameLog.push({
            turn: this.gameState.turn,
            player: this.playerNumber,
            action: 'damage_swap',
            source: sourcePokemon.name || sourcePokemon.cardName,
            target: targetPokemon.name || targetPokemon.cardName,
            amount: amount
        });

        return true;
    }

    // Execute energy attachment
    executeEnergyAttachment(energyCard, targetPokemon) {
        // Remove energy from hand
        const handIndex = this.player.hand.indexOf(energyCard);
        if (handIndex !== -1) {
            this.player.hand.splice(handIndex, 1);
        }

        // Add to target Pokemon
        if (!targetPokemon.attachedEnergy) {
            targetPokemon.attachedEnergy = [];
        }
        targetPokemon.attachedEnergy.push(energyCard);

        // Log the action
        this.gameState.gameLog.push({
            turn: this.gameState.turn,
            player: this.playerNumber,
            action: 'energy_attachment',
            energy: energyCard.name || energyCard.cardName,
            target: targetPokemon.name || targetPokemon.cardName
        });

        return true;
    }

    // === GENERIC SERVER FUNCTIONS FOR POKEMON DATA ===

    // Get Pokemon by HP criteria
    getPokemonByHP(minHp = null, maxHp = null, includeMax = false) {
        return this.getAllPokemon().filter(card => {
            if (!card || card.hp === undefined) return false;
            if (minHp !== null && card.hp < minHp) return false;
            if (maxHp !== null && card.hp > maxHp) return false;
            if (!includeMax && card.hp === card.maxHp) return false;
            return true;
        });
    }

    // Get Pokemon by type
    getPokemonByType(type) {
        return this.getAllPokemon().filter(card => 
            card && card.type && card.type.toLowerCase() === type.toLowerCase()
        );
    }

    // Get Pokemon that can have energy attached
    getPokemonForEnergyAttachment(energyType = null) {
        return this.getAllPokemon().filter(card => {
            if (!card) return false;
            // If specific energy type, check compatibility (could be expanded)
            if (energyType && card.type && energyType !== 'colorless') {
                return card.type.toLowerCase() === energyType.toLowerCase();
            }
            return true; // All Pokemon can receive colorless or unspecified energy
        });
    }

    // Get cards from hand by type
    getHandCardsByType(type) {
        return this.player.hand.filter(card => 
            card && card.type && card.type.toLowerCase() === type.toLowerCase()
        );
    }

    // Get energy cards from hand
    getEnergyFromHand(energyType = null) {
        return this.player.hand.filter(card => {
            if (!card || !card.cardName) return false;
            const isEnergy = card.cardName.toLowerCase().includes('energy');
            if (!isEnergy) return false;
            if (!energyType) return true;
            return card.cardName.toLowerCase().includes(energyType.toLowerCase());
        });
    }

    // Check if player has cards matching criteria in hand
    hasCardsInHand(filter) {
        return this.player.hand.some(filter);
    }

    // Count cards matching criteria
    countCards(location, filter = null) {
        const cards = this.player[location] || [];
        if (!filter) return cards.length;
        return cards.filter(filter).length;
    }

    // Get opponent's Pokemon data (for abilities that affect opponent)
    getOpponentPokemon() {
        return [this.opponent.activePokemon, ...this.opponent.bench].filter(card => card !== null);
    }

    // Get opponent's damaged Pokemon
    getOpponentDamagedPokemon() {
        return this.getOpponentPokemon().filter(card => card && card.hp < card.maxHp);
    }

    // Heal Pokemon
    healPokemon(pokemon, amount) {
        if (!pokemon || pokemon.hp === undefined) return false;
        const oldHp = pokemon.hp;
        pokemon.hp = Math.min(pokemon.hp + amount, pokemon.maxHp);
        const actualHeal = pokemon.hp - oldHp;
        
        console.log(`Server: ${pokemon.cardName || pokemon.name} healed for ${actualHeal} HP (${oldHp} -> ${pokemon.hp})`);
        
        // Log the action
        this.gameState.gameLog.push({
            turn: this.gameState.turn,
            player: this.playerNumber,
            action: 'heal',
            target: pokemon.name || pokemon.cardName,
            amount: actualHeal
        });

        return actualHeal > 0;
    }

    // Damage Pokemon
    damagePokemon(pokemon, amount) {
        if (!pokemon || pokemon.hp === undefined) return false;
        const oldHp = pokemon.hp;
        pokemon.hp = Math.max(pokemon.hp - amount, 0);
        const actualDamage = oldHp - pokemon.hp;
        
        console.log(`Server: ${pokemon.cardName || pokemon.name} takes ${actualDamage} damage (${oldHp} -> ${pokemon.hp})`);
        
        // Log the action
        this.gameState.gameLog.push({
            turn: this.gameState.turn,
            player: this.playerNumber,
            action: 'damage',
            target: pokemon.name || pokemon.cardName,
            amount: actualDamage
        });

        return actualDamage > 0;
    }

    // Move card between locations
    moveCard(card, fromLocation, toLocation, targetPokemon = null) {
        // Remove from source
        const fromArray = this.player[fromLocation];
        const fromIndex = fromArray.indexOf(card);
        if (fromIndex === -1) return false;
        
        fromArray.splice(fromIndex, 1);

        // Add to destination
        if (toLocation === 'attach' && targetPokemon) {
            if (!targetPokemon.attachedEnergy) targetPokemon.attachedEnergy = [];
            targetPokemon.attachedEnergy.push(card);
        } else {
            const toArray = this.player[toLocation];
            toArray.push(card);
        }

        // Log the action
        this.gameState.gameLog.push({
            turn: this.gameState.turn,
            player: this.playerNumber,
            action: 'move_card',
            card: card.name || card.cardName,
            from: fromLocation,
            to: toLocation,
            target: targetPokemon ? (targetPokemon.name || targetPokemon.cardName) : null
        });

        return true;
    }

    // Validate that ability can be used (basic checks)
    canUseAbility() {
        // Check if it's player's turn
        if (this.gameState.currentPlayer !== this.playerNumber) {
            return { valid: false, error: 'Not your turn' };
        }

        // Check if in main phase (before attack)
        if (this.gameState.attackedThisTurn) {
            return { valid: false, error: 'Cannot use abilities after attacking' };
        }

        return { valid: true };
    }
}

class Alakazam extends Card {
    // Define validator method before constructor
    validateDamageSwap(player, opponent) {
        // Get all player's Pokemon - handle both client and server contexts
        const bench = Array.isArray(player.bench) ? player.bench : [];
        const activePokemon = player.activePokemon || null;
        const allPlayerPokemon = [activePokemon, ...bench].filter(card => card !== null);
        
        // Check for damaged Pokemon
        const damagedPokemon = allPlayerPokemon.filter(card => {
            return card && 
                   typeof card.hp === 'number' && 
                   typeof card.maxHp === 'number' && 
                   card.hp < card.maxHp;
        });
        
        if (damagedPokemon.length === 0) {
            return { 
                valid: false, 
                error: 'No damaged Pokemon to move damage from' 
            };
        }

        // Check for valid targets (Pokemon that won't be KO'd by +10 damage)
        const validTargets = allPlayerPokemon.filter(card => {
            return card && card.hp > 10;
        });

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

    constructor(owner) {
        super(
            owner,
            'https://images.pokemontcg.io/base1/1_hires.png',
            'Alakazam',
            PokemonType.PSYCHIC,
            80,
            'Alakazam',
            'Kadabra',
            true,
            PokemonType.PSYCHIC,
            null,
            3,
            1,
            CardModifiers.BASE
        );
        this.addAbility('Damage Swap', `As often as you like during your turn (before your attack), you may move 1 damage counter from 1 of your Pokémon to another as long as you don't Knock Out that Pokémon. This power can't be used if Alakazam is Asleep, Confused, or Paralyzed.`, AbilityEventListeners.ONABILITYUSE, this.DamageSwap);
        this.addAttack('Confuse Ray', 'Flip a coin. If heads, the Defending Pokémon is now Confused', [PokemonType.PSYCHIC, PokemonType.PSYCHIC, PokemonType.PSYCHIC], this.ConfuseRay);
        
        // Register ability with both client and server systems
        Alakazam.registerDamageSwapAbility();
    }

    static registerDamageSwapAbility() {
        // Register server-side callback
        AbilityRegistry.registerServerCallback('Damage Swap', async (context) => {
            // Check basic ability constraints
            const abilityCheck = context.canUseAbility();
            if (!abilityCheck.valid) {
                return { success: false, error: abilityCheck.error };
            }

            // Get damaged Pokemon using generic function
            const damagedPokemon = context.getDamagedPokemon();
            
            if (damagedPokemon.length === 0) {
                return { success: false, error: 'No damaged Pokemon to move damage from' };
            }

            // Request client to select source Pokemon
            const sourcePokemon = await context.requestCardSelection(damagedPokemon, {
                title: 'Damage Swap - Select Source',
                subtitle: 'Choose a damaged Pokémon to move 1 damage counter from:',
                cardDisplayFunction: (card) => {
                    const damage = card.maxHp - card.hp;
                    return `${damage / 10} damage counter${damage > 10 ? 's' : ''}`;
                }
            });

            if (!sourcePokemon) {
                return { success: false, error: 'No source Pokemon selected' };
            }

            // Get valid targets using generic function - Pokemon with more than 10 HP (excluding source)
            const validTargets = context.getPokemonByHP(11, null, true).filter(card => card !== sourcePokemon);

            if (validTargets.length === 0) {
                return { success: false, error: 'No valid targets to move damage to' };
            }

            // Request client to select target Pokemon
            const targetPokemon = await context.requestCardSelection(validTargets, {
                title: 'Damage Swap - Select Target',
                subtitle: `Move 1 damage counter from ${sourcePokemon.cardName || sourcePokemon.name} to:`,
                cardDisplayFunction: (card) => {
                    const hpAfterDamage = card.hp - 10;
                    return `Will have ${hpAfterDamage}/${card.maxHp} HP after receiving damage`;
                }
            });

            if (!targetPokemon) {
                return { success: false, error: 'No target Pokemon selected' };
            }

            // Execute the damage swap using generic functions
            context.healPokemon(sourcePokemon, 10);
            context.damagePokemon(targetPokemon, 10);

            return {
                success: true,
                message: `Damage Swap: Moved 1 damage counter from ${sourcePokemon.cardName || sourcePokemon.name} to ${targetPokemon.cardName || targetPokemon.name}`,
                // Include state changes for client synchronization
                stateChanges: {
                    [`${sourcePokemon.id}.hp`]: sourcePokemon.hp,
                    [`${targetPokemon.id}.hp`]: targetPokemon.hp
                }
            };
        });

        // Register client-side ability (for backwards compatibility and validation)
        AbilityRegistry.registerAbility('Damage Swap', {
            validator: async (gameState) => {
                const allPokemon = [gameState.yourState.activePokemon, ...gameState.yourState.bench].filter(card => card !== null);
                const damagedPokemon = allPokemon.filter(card => card && card.hp < card.maxHp);
                
                if (damagedPokemon.length === 0) {
                    return { valid: false, reason: 'No damaged Pokemon to move damage from' };
                }
                
                return { valid: true };
            },

            executor: async (gameState, context) => {
                const allPokemon = [gameState.yourState.activePokemon, ...gameState.yourState.bench].filter(card => card !== null);
                const damagedPokemon = allPokemon.filter(card => card && card.hp < card.maxHp);

                // Select Pokemon to move damage from
                const sourceTarget = await context.components.selectDamageSource(damagedPokemon);
                if (!sourceTarget) {
                    return { success: false, error: 'No source Pokemon selected' };
                }

                // Select Pokemon to move damage to (excluding source, must survive 10 damage)
                const validTargets = allPokemon.filter(card => 
                    card && card !== sourceTarget && card.hp > 10
                );

                if (validTargets.length === 0) {
                    return { success: false, error: 'No valid targets to move damage to' };
                }

                const destinationTarget = await context.components.selectDamageTarget(validTargets, sourceTarget);
                if (!destinationTarget) {
                    return { success: false, error: 'No destination Pokemon selected' };
                }

                // For now, log the action (server integration would be added here)
                console.log(`Damage Swap: Moving damage from ${sourceTarget.name || sourceTarget.cardName} to ${destinationTarget.name || destinationTarget.cardName}`);
                
                return { 
                    success: true, 
                    message: `Damage Swap used: moved damage from ${sourceTarget.name || sourceTarget.cardName} to ${destinationTarget.name || destinationTarget.cardName}` 
                };
            },

            components: {
                selectDamageSource: (damagedPokemon) => {
                    // This will be replaced with actual GUIHookUtils instance method when available
                    return AbilityRegistry.guiHookUtils?.selectCardFromPlayer(damagedPokemon, {
                        title: 'Damage Swap - Select Source',
                        subtitle: 'Choose a damaged Pokémon to move 1 damage counter from:',
                        cardDisplayFunction: (card) => {
                            const damage = card.maxHp - card.hp;
                            return `${damage / 10} damage counter${damage > 10 ? 's' : ''}`;
                        }
                    });
                },
                selectDamageTarget: (validTargets, sourceTarget) => {
                    return AbilityRegistry.guiHookUtils?.selectCardFromPlayer(validTargets, {
                        title: 'Damage Swap - Select Target',
                        subtitle: `Move 1 damage counter from ${sourceTarget.cardName || sourceTarget.name} to:`,
                        cardDisplayFunction: (card) => {
                            const hpAfterDamage = card.hp - 10;
                            return `Will have ${hpAfterDamage}/${card.maxHp} HP after receiving damage`;
                        }
                    });
                }
            }
        });
    }
    async DamageSwap(){
        // Get all player's Pokemon (filter out null slots)
        // Safety check for server-side execution where bench might not be properly set up
        const bench = Array.isArray(this.owner.bench) ? this.owner.bench : [];
        const activePokemon = this.owner.activePokemon || null;
        const allPlayerPokemon = [activePokemon, ...bench].filter(card => card !== null);
        
        // Find damaged Pokemon (HP < maxHP)
        const damagedCards = allPlayerPokemon.filter(card => card && card.hp < card.maxHp);
        
        if (damagedCards.length === 0) {
            console.log('No damaged Pokemon to heal');
            return { success: false, error: 'No damaged Pokemon to heal' };
        }
        
        // Select which damaged Pokemon to heal from using the generic selection method
        const sourceTarget = await this.owner.guiHook.selectCardFromPlayer(damagedCards, {
            title: 'Damage Swap - Select Source',
            subtitle: 'Choose a damaged Pokémon to move 1 damage counter from:',
            cardDisplayFunction: (card) => {
                const damage = card.maxHp - card.hp;
                return `${damage / 10} damage counter${damage > 10 ? 's' : ''}`;
            }
        });
        
        if (!sourceTarget) {
            console.log('No source target selected');
            return;
        }
        
        // Find valid targets to move damage to (must have > 10 HP to survive, and not the same as source)
        const damageTargets = allPlayerPokemon.filter(card => 
            card && 
            card !== sourceTarget && 
            card.hp > 10  // Won't be KO'd by receiving 10 damage
        );
        
        if (damageTargets.length === 0) {
            console.log('No valid targets to move damage to');
            return;
        }
        
        // Select which Pokemon to move damage to using the generic selection method
        const damageTarget = await this.owner.guiHook.selectCardFromPlayer(damageTargets, {
            title: 'Damage Swap - Select Target',
            subtitle: `Move 1 damage counter from ${sourceTarget.cardName} to:`,
            cardDisplayFunction: (card) => {
                const hpAfterDamage = card.hp - 10;
                return `Will have ${hpAfterDamage}/${card.maxHp} HP after receiving damage`;
            }
        });
        
        if (!damageTarget) {
            console.log('No damage target selected');
            return;
        }
        
        // Move 1 damage counter (10 damage) from source to target
        console.log(`Moving 10 damage from ${sourceTarget.cardName} to ${damageTarget.cardName}`);
        sourceTarget.heal(10);     // Remove 10 damage from source
        damageTarget.damage(10);   // Add 10 damage to target
    }
    async ConfuseRay(){
        if( await this.owner.guiHook.coinFlip()){
            this.owner.opponent.activePokemon.addStatusCondition('confused');
        }
        // Pass attacking Pokemon type for weakness/resistance calculation
        const attackingType = this.owner.guiHook.attackingPokemonType || this.type;
        this.owner.opponent.activePokemon.damage(30, attackingType);
        this.owner.guiHook.damageCardElement(this.owner.opponent.activePokemon, 30);
    }
}
class Blastoise extends Card {
    // Define validator method before constructor
    validateRainDance(player, opponent) {
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

    constructor(owner) {
        super(
            owner,
            'https://images.pokemontcg.io/base1/2_hires.png',
            'Blastoise',
            PokemonType.WATER,
            100,
            'Blastoise',
            'Wartortle',
            true,
            PokemonType.LIGHTNING,
            null,
            3,
            1,
            CardModifiers.BASE
        );
        this.addAbility(
            "Rain Dance",
            "As often as you like during your turn (before your attack), you may attach 1 Water Energy card from your hand to 1 of your Water Pokémon. This power can't be used if Blastoise is Asleep, Confused, or Paralyzed.",
            {
                event: 'manual',
                phase: 'beforeAttack',
                unlimited: true,
                callback: async function(gameState, playerId, targetId) {
                    const player = gameState.players[playerId];
                    
                    // Find Water Energy in hand
                    const waterEnergyInHand = player.hand.filter(card => {
                        return card && (
                            (card.constructor && card.constructor.name === 'Energy' && card.energyType === 'water') ||
                            (card.type === 'water' && card.cardName && card.cardName.toLowerCase().includes('water'))
                        );
                    });
                    
                    if (waterEnergyInHand.length === 0) {
                        return { 
                            success: false, 
                            error: 'No Water Energy cards in hand' 
                        };
                    }
                    
                    // Use the first Water Energy found
                    const energyCard = waterEnergyInHand[0];
                    
                    // Remove from hand
                    const handIndex = player.hand.indexOf(energyCard);
                    if (handIndex !== -1) {
                        player.hand.splice(handIndex, 1);
                    }
                    
                    // Add to target Pokemon
                    const targetPokemon = gameState.findPokemonById(targetId, playerId);
                    if (targetPokemon) {
                        if (!targetPokemon.energyCards) {
                            targetPokemon.energyCards = [];
                        }
                        targetPokemon.energyCards.push(energyCard);
                    }
                    
                    return { 
                        success: true, 
                        message: `Attached Water Energy to ${targetPokemon ? targetPokemon.cardName : 'Pokemon'}` 
                    };
                }
            },
            this.validateRainDance
        );
        this.addAttack('Hydro Pump', 'Does 40 damage plus 10 more damage for each water energy Energy attached to Blastoise but not used to pay for this attack\'s Energy cost. Extra water energy Energy after the 2nd doesn\'t count.', [PokemonType.WATER, PokemonType.WATER, PokemonType.WATER], this.HydroPump);
        
        // Register ability with generic system
        Blastoise.registerRainDanceAbility();
    }

    static registerRainDanceAbility() {
        // Register server-side callback
        AbilityRegistry.registerServerCallback('Rain Dance', async (context) => {
            // Check basic ability constraints
            const abilityCheck = context.canUseAbility();
            if (!abilityCheck.valid) {
                return { success: false, error: abilityCheck.error };
            }

            // Get Water Energy from hand using generic function
            const waterEnergyInHand = context.getEnergyFromHand('water');

            if (waterEnergyInHand.length === 0) {
                return { success: false, error: 'No Water Energy cards in hand to attach' };
            }

            // Get Water Pokemon using generic function
            const waterPokemon = context.getPokemonByType('water');

            if (waterPokemon.length === 0) {
                return { success: false, error: 'No Water Pokemon to attach energy to' };
            }

            // Request client to select target Pokemon
            const targetPokemon = await context.requestCardSelection(waterPokemon, {
                title: 'Rain Dance - Attach Water Energy',
                subtitle: 'Choose a Water Pokémon to attach a Water Energy card to:',
                cardDisplayFunction: (card) => {
                    const energyCount = card.attachedEnergy ? card.attachedEnergy.length : 0;
                    return `Currently has ${energyCount} energy card${energyCount !== 1 ? 's' : ''}`;
                }
            });

            if (!targetPokemon) {
                return { success: false, error: 'No target Pokemon selected' };
            }

            // Execute the energy attachment using generic function
            const energyCard = waterEnergyInHand[0];
            context.moveCard(energyCard, 'hand', 'attach', targetPokemon);

            return {
                success: true,
                message: `Rain Dance: Attached Water Energy to ${targetPokemon.cardName || targetPokemon.name}`,
                // Include state changes for client synchronization
                stateChanges: {
                    hand: context.player.hand,
                    [`${targetPokemon.id}.attachedEnergy`]: targetPokemon.attachedEnergy
                }
            };
        });

        // Register client-side ability (for backwards compatibility and validation)
        AbilityRegistry.registerAbility('Rain Dance', {
            validator: async (gameState) => {
                const waterEnergyInHand = gameState.yourState.hand.filter(card => 
                    card && card.type === 'energy' && card.energyType === 'water'
                );

                if (waterEnergyInHand.length === 0) {
                    return { valid: false, reason: 'No Water Energy in hand' };
                }

                const allPokemon = [gameState.yourState.activePokemon, ...gameState.yourState.bench].filter(card => card !== null);
                const sourceId = gameState.yourState.activePokemon?.id;
                const validTargets = allPokemon.filter(card => {
                    if (!card || !(card.type === 'water' || card.pokemonType === 'water')) return false;
                    return card.id !== sourceId; // Exclude the Blastoise using the ability
                });

                if (validTargets.length === 0) {
                    return { valid: false, reason: 'No other Water Pokemon to attach energy to' };
                }

                return { valid: true };
            },

            executor: async (gameState, context) => {
                const waterEnergyInHand = context.components.energyFilter(gameState.yourState.hand);
                if (waterEnergyInHand.length === 0) {
                    return { success: false, error: 'No Water Energy cards in hand' };
                }

                const allPokemon = [gameState.yourState.activePokemon, ...gameState.yourState.bench].filter(card => card !== null);
                const sourceId = gameState.yourState.activePokemon?.id;
                const waterPokemon = context.components.pokemonFilter(allPokemon, sourceId);

                if (waterPokemon.length === 0) {
                    return { success: false, error: 'No other Water Pokemon to attach energy to' };
                }

                // Select target Pokemon
                const target = await context.components.targetSelector(waterPokemon);
                if (!target) {
                    return { success: false, error: 'No target selected' };
                }

                // Execute the energy attachment
                const energyCard = waterEnergyInHand[0];
                const handIndex = gameState.yourState.hand.indexOf(energyCard);
                
                if (handIndex === -1) {
                    return { success: false, error: 'Could not find energy card in hand' };
                }

                // Find target position
                let targetIndex;
                if (target === gameState.yourState.activePokemon) {
                    targetIndex = 'active';
                } else {
                    const benchIndex = gameState.yourState.bench.indexOf(target);
                    if (benchIndex !== -1) {
                        targetIndex = benchIndex.toString();
                    } else {
                        return { success: false, error: 'Could not find target Pokemon position' };
                    }
                }

                // Send to server or execute locally
                if (context.isMultiplayer && context.webSocketClient) {
                    const cardData = {
                        id: energyCard.id,
                        name: energyCard.name,
                        cardName: energyCard.name,
                        type: energyCard.type,
                        energyType: energyCard.energyType,
                        imgUrl: energyCard.imgUrl
                    };
                    
                    context.webSocketClient.sendCardMove('hand', handIndex, 'attach', targetIndex, cardData);
                    
                    return { 
                        success: true, 
                        message: `Rain Dance: Attaching Water Energy to ${target.name || target.cardName}` 
                    };
                } else {
                    // Local execution
                    gameState.yourState.hand.splice(handIndex, 1);
                    if (!target.attachedEnergy) {
                        target.attachedEnergy = [];
                    }
                    target.attachedEnergy.push(energyCard);
                    
                    return { 
                        success: true, 
                        message: `Attached Water Energy to ${target.name || target.cardName}` 
                    };
                }
            },

            components: {
                energyFilter: (hand) => hand.filter(card => card && card.type === 'energy' && card.energyType === 'water'),
                pokemonFilter: (allPokemon, sourceId) => allPokemon.filter(card => {
                    if (!card || !(card.type === 'water' || card.pokemonType === 'water')) return false;
                    return card.id !== sourceId; // Exclude source Pokemon by UUID
                }),
                targetSelector: (targets) => {
                    return AbilityRegistry.guiHookUtils?.selectCardFromPlayer(targets, {
                        title: 'Rain Dance - Attach Water Energy',
                        subtitle: 'Choose a Water Pokémon to attach a Water Energy card to:',
                        cardDisplayFunction: (card) => {
                            const energyCount = card.attachedEnergy ? card.attachedEnergy.length : 0;
                            return `Currently has ${energyCount} energy card${energyCount !== 1 ? 's' : ''}`;
                        }
                    });
                }
            }
        });
    }
    async RainDance(){
        if (this.owner.bench.length === 0 || this.owner.hand.filter(nrg => nrg instanceof Energy).filter(nrg => nrg.type === PokemonType.WATER).length === 0) {
            return;
        }
        const potentialTargets = [this.owner.activePokemon, ...this.owner.bench].filter(card => card !== this).filter(card => card.type === PokemonType.WATER);
        
        const target = await this.owner.guiHook.showCardSelectionMenu(potentialTargets, {
            title: 'Rain Dance - Attach Water Energy',
            subtitle: 'Choose a Water Pokémon to attach a Water Energy card to:',
            cardDisplayFunction: (card) => {
                const energyCount = card.energyCards ? card.energyCards.length : 0;
                return `Currently has ${energyCount} energy card${energyCount !== 1 ? 's' : ''}`;
            }
        });
        
        if (!target) {
            return;
        }
        
        const tempStore = this.owner.attachedEnergyThisTurn;
        this.owner.hand.filter(nrg => nrg instanceof Energy).filter(nrg => nrg.type === PokemonType.WATER)[0].attachTo(target);
        this.owner.attachedEnergyThisTurn = tempStore;
    }
    async HydroPump(){
        const energyMod = Math.max(Math.min(this.energy.filter(nrg => nrg === PokemonType.WATER).length-3, 2), 0) * 10;
        // Pass attacking Pokemon type for weakness/resistance calculation
        const attackingType = this.owner.guiHook.attackingPokemonType || this.type;
        this.owner.opponent.activePokemon.damage(40 + energyMod, attackingType);
    }
}
class Pikachu extends Card {
    constructor(owner) {
        super(
            owner,
            'https://images.pokemontcg.io/base1/58_hires.png',
            'Pikachu',
            PokemonType.LIGHTNING,
            10,
            'Pikachu',
            null,
            false,
            PokemonType.FIGHTING,
            null,
            1,
            1,
            CardModifiers.BASE
        );
        this.addAttack('Thunder Jolt', 'Flip a coin. If tails, Pikachu does 10 damage to itself.', [PokemonType.LIGHTNING, PokemonType.COLORLESS], this.ThunderJolt);
    }
    async ThunderJolt(){
        // Pass attacking Pokemon type for weakness/resistance calculation
        const attackingType = this.owner.guiHook.attackingPokemonType || this.type;
        this.owner.opponent.activePokemon.damage(10, attackingType);
        if(!await this.owner.guiHook.coinFlip()){
            this.damage(10); // Self-damage without weakness/resistance calculation
            this.owner.guiHook.damageCardElement(this, 10);
        }
    }
}

class Growlithe extends Card {
    constructor(owner) {
        super(
            owner,
            'https://images.pokemontcg.io/base1/28_hires.png',
            'Growlithe',
            PokemonType.FIRE,
            60,
            'Growlithe',
            null,
            true,
            PokemonType.WATER,
            null,
            1,
            1,
            CardModifiers.BASE
        );
        this.addAttack('Flare', 'Does 20 damage.', [PokemonType.FIRE, PokemonType.COLORLESS], this.Flare);
    }
    
    async Flare(){
        // Pass attacking Pokemon type for weakness/resistance calculation
        const attackingType = this.owner.guiHook.attackingPokemonType || this.type;
        this.owner.opponent.activePokemon.damage(20, attackingType);
        this.owner.guiHook.damageCardElement(this.owner.opponent.activePokemon, 20);
    }
}

class Arcanine extends Card {
    constructor(owner) {
        super(
            owner,
            'https://images.pokemontcg.io/base1/23_hires.png',
            'Arcanine',
            PokemonType.FIRE,
            100,
            'Arcanine',
            'Growlithe',
            true,
            PokemonType.WATER,
            null,
            3,
            1,
            CardModifiers.BASE
        );
        this.addAttack('Flamethrower', 'Discard 1 Fire Energy card attached to Arcanine in order to use this attack.', [PokemonType.FIRE, PokemonType.FIRE, PokemonType.COLORLESS], this.Flamethrower);
        this.addAttack('Take Down', 'Arcanine does 30 damage to itself.', [PokemonType.FIRE, PokemonType.FIRE, PokemonType.COLORLESS, PokemonType.COLORLESS], this.TakeDown);
    }
    
    async Flamethrower(){
        // Check if Arcanine has at least one Fire Energy attached
        const attachedEnergy = this.attachedEnergy || [];
        const fireEnergy = attachedEnergy.find(energy => energy.energyType === 'fire' || energy.type === 'fire');
        
        if (!fireEnergy) {
            // This should be prevented by game rules, but add safety check
            console.log('No Fire Energy attached to discard for Flamethrower');
            return;
        }
        
        // Remove the fire energy from attached energy
        const energyIndex = attachedEnergy.indexOf(fireEnergy);
        if (energyIndex > -1) {
            attachedEnergy.splice(energyIndex, 1);
        }
        
        // Add the discarded energy to owner's discard pile
        this.owner.discardPile.push(fireEnergy);
        
        // Update visual energy display
        if (this.owner.guiHook && this.owner.guiHook.updateAttachedEnergyDisplay) {
            const pokemonElement = document.getElementById('ActivePokemon'); // Assuming this is the active Pokemon
            this.owner.guiHook.updateAttachedEnergyDisplay(pokemonElement, this);
        }
        
        // Deal 50 damage
        const attackingType = this.owner.guiHook.attackingPokemonType || this.type;
        this.owner.opponent.activePokemon.damage(50, attackingType);
        this.owner.guiHook.damageCardElement(this.owner.opponent.activePokemon, 50);
    }
    
    async TakeDown(){
        // Deal 80 damage to opponent
        const attackingType = this.owner.guiHook.attackingPokemonType || this.type;
        this.owner.opponent.activePokemon.damage(80, attackingType);
        this.owner.guiHook.damageCardElement(this.owner.opponent.activePokemon, 80);
        
        // Deal 30 self-damage
        this.damage(30); // Self-damage without weakness/resistance calculation
        this.owner.guiHook.damageCardElement(this, 30);
    }
}

// Register server callbacks immediately when module is loaded
console.log('Initializing server callbacks for abilities...');
Alakazam.registerDamageSwapAbility();
Blastoise.registerRainDanceAbility();
console.log('Server callbacks registration complete');

export default { Alakazam, Blastoise, Pikachu, Growlithe, Arcanine };
export { AbilityRegistry, ServerAbilityContext };