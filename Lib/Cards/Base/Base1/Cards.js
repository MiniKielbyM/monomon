import { Card } from "../../../card.js";
import enums from "../../../enums.js";
const { PokemonType, CardModifiers, AbilityEventListeners } = enums;

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
        this.addAbility('Damage Swap', `As often as you like during your turn (before your attack), you may move 1 damage counter from 1 of your Pokémon to another as long as you don't Knock Out that Pokémon. This power can't be used if Alakazam is Asleep, Confused, or Paralyzed.`, AbilityEventListeners.ONABILITYUSE, null);
        this.addAttack('Confuse Ray', 'Flip a coin. If heads, the Defending Pokémon is now Confused', [PokemonType.PSYCHIC, PokemonType.PSYCHIC, PokemonType.PSYCHIC], this.ConfuseRay);
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
            60,
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

export default { Alakazam, Blastoise, Pikachu };