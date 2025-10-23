import enums from "./enums.js";
const { PokemonType, CardModifiers, AbilityEventListeners } = enums;
import Pokemon from "./PokemonList.js";

// Generate a UUID for unique card identification
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

class Card {
    // Check if the card has the required energy for an attack
    hasRequiredEnergy(attackName) {
        if (!this.attacks[attackName]) return false;
        const required = [...this.attacks[attackName].cost];
        // Count attached energies by type
        const attached = {};
        for (const energy of this.energy) {
            attached[energy] = (attached[energy] || 0) + 1;
        }
        // First, fulfill all non-colorless requirements
        for (let i = required.length - 1; i >= 0; i--) {
            const type = required[i];
            if (type !== PokemonType.COLORLESS) {
                if (attached[type] && attached[type] > 0) {
                    attached[type]--;
                    required.splice(i, 1);
                }
            }
        }
        // Now, fulfill colorless requirements with any remaining energy
        let totalLeft = Object.values(attached).reduce((a, b) => a + b, 0);
        const colorlessCount = required.filter(t => t === PokemonType.COLORLESS).length;
        return totalLeft >= colorlessCount;
    }
    //Global card properties
    static energy = [];
    static attachments = [];
    // attacks stored as a map: { attackName: { description, cost, callback } }
    attacks = {};
    abilities = [];
    statusConditions = [];
    // Explicit status properties for each condition
    paralyzed = 0; // 0 = not paralyzed, >0 = turns remaining
    asleep = false;
    confused = false;
    burned = false;
    poisoned = false;
    // Custom per-status properties (legacy/other uses)
    statusProperties = {};
    //Constructor
    constructor(owner, imgUrl, cardName, type, hp, pokemon, evolvesFrom = null, canEvolve = true, weakness = null, resistance = null, retreatCost = 0, prizeCards = 1, cardMod = CardModifiers.Base) {
        // Generate unique ID for this card instance
        this.id = generateUUID();
        
        this.owner = owner;
        // Owner validation removed to avoid circular dependency
        this.imgUrl = imgUrl;
        this.cardName = cardName;
        if (!Object.values(PokemonType).includes(type)) {
            throw new Error(`Invalid Pokemon type: ${type}`);
        }
        this.type = type;
        if (typeof hp !== 'number' || hp < 0) {
            throw new Error(`Invalid Pokemon HP: ${hp}`);
        }
        this.maxHp = hp;  // Store the original maximum HP
        this.hp = hp;     // Current HP (will decrease with damage)
        if (typeof pokemon !== 'string' || !Pokemon.includes(pokemon)) {
            throw new Error(`Invalid Pokemon: ${pokemon}`);
        }
        this.pokemon = pokemon;
        if (evolvesFrom !== null && (typeof evolvesFrom !== 'string' || !Pokemon.includes(evolvesFrom))) {
            throw new Error(`Invalid evolves from: ${evolvesFrom}`);
        }
        if (evolvesFrom !== null && !Pokemon.includes(evolvesFrom)) {
            throw new Error(`Evolves from Pokemon not in list: ${evolvesFrom}`);
        }
        this.evolvesFrom = evolvesFrom;
        if (typeof canEvolve !== 'boolean') {
            throw new Error(`Invalid canEvolve value: ${canEvolve}`);
        }
        this.canEvolve = canEvolve;
        if (!Object.values(PokemonType).includes(weakness) && weakness !== null) {
            throw new Error(`Invalid Pokemon weakness: ${weakness}`);
        }
        this.weakness = weakness;
        if (!Object.values(PokemonType).includes(resistance) && resistance !== null) {
            throw new Error(`Invalid Pokemon resistance: ${resistance}`);
        }
        this.resistance = resistance;
        if (typeof retreatCost !== 'number' || retreatCost < 0) {
            throw new Error(`Invalid Pokemon retreat cost: ${retreatCost}`);
        }
        this.retreatCost = retreatCost;
        if (typeof prizeCards !== 'number' || prizeCards < 0) {
            throw new Error(`Invalid number of prize cards: ${prizeCards}`);
        }
        this.prizeCards = prizeCards;
        if (!Object.values(CardModifiers).includes(cardMod)) {
            throw new Error(`Invalid card modifier: ${cardMod}`);
        }
        this.cardMod = cardMod;
        
        // Initialize energy array for tracking attached energy
        this.energy = [];
        // Initialize explicit status properties
        this.paralyzed = 0;
        this.asleep = false;
        this.confused = false;
        this.burned = false;
        this.poisoned = false;
    // Initialize custom status properties
    this.statusProperties = {};
    }
    // Utility functions, dont edit these on children classes
    damage(amount, attackingType = null) {
        if (this.isParalyzed()) {
            throw new Error(`${this.cardName} is paralyzed and cannot attack.`);
        }
        if (typeof amount !== 'number' || amount < 0) {
            throw new Error(`Invalid damage amount: ${amount}`);
        }
        
        let finalDamage = amount;
        
        // Apply weakness (double damage if attacking type matches weakness)
        if (attackingType && this.weakness === attackingType) {
            console.log(`Weakness applied: ${this.cardName} is weak to ${attackingType}, damage doubled from ${amount} to ${amount * 2}`);
            finalDamage *= 2;
        }
        
        // Apply resistance (reduce damage by 30 if attacking type matches resistance)
        if (attackingType && this.resistance === attackingType) {
            console.log(`Resistance applied: ${this.cardName} resists ${attackingType}, damage reduced by 30 from ${finalDamage} to ${Math.max(0, finalDamage - 30)}`);
            finalDamage = Math.max(0, finalDamage - 30);
        }
        
        this.hp -= finalDamage;
        if (this.hp < 0) {
            this.hp = 0;
        }
        this.owner.guiHook.damageCardElement(this, finalDamage);
        
        // Check if Pokemon was knocked out
        if (this.hp === 0) {
            // Notify the owner about the knockout so they can handle prize cards and discard
            if (this.owner.guiHook.handleKnockout) {
                this.owner.guiHook.handleKnockout(this);
            }
        }
    }
    heal(amount) {
        if (typeof amount !== 'number' || amount < 0) {
            throw new Error(`Invalid heal amount: ${amount}`);
        }
        this.hp += amount;
        if (this.hp > this.maxHp) {
            this.hp = this.maxHp;
        }
        this.owner.guiHook.healCardElement(this, amount);
    }
    listAttacks() {
        return Object.keys(this.attacks);
    }
    listAbilities() {
        return Object.keys(this.abilities);
    }
    addAttack(attackName, attackDesc, attackCost, attackFunction) {
        if (typeof attackName !== 'string') {
            throw new Error(`Invalid attack name: ${attackName}`);
        }
        if (typeof attackDesc !== 'string') {
            throw new Error(`Invalid attack description: ${attackDesc}`);
        }
        if (!Array.isArray(attackCost) || !attackCost.every(cost => Object.values(PokemonType).includes(cost))) {
            throw new Error(`Invalid attack cost: ${attackCost}`);
        }
        if (typeof attackFunction !== 'function') {
            throw new Error(`Invalid attack function: ${attackFunction}`);
        }
        this.attacks[attackName] = { description: attackDesc, cost: attackCost, callback: attackFunction };
    }
    addAbility(abilityName, abilityDesc, abilityData, effectValidator = null) {
        if (typeof abilityName !== 'string') {
            throw new Error(`Invalid ability name: ${abilityName}`);
        }
        if (typeof abilityDesc !== 'string') {
            throw new Error(`Invalid ability description: ${abilityDesc}`);
        }
        
        // Handle both old and new ability formats
        let abilityConfig;
        if (typeof abilityData === 'object' && abilityData !== null) {
            // New format: ability data is an object with event, callback, etc.
            abilityConfig = {
                name: abilityName,
                description: abilityDesc,
                ...abilityData
            };
        } else {
            // Old format: eventListener and abilityFunction as separate parameters
            const eventListener = abilityData;
            const abilityFunction = effectValidator; // In old format, this is the 4th parameter
            
            if (!Object.values(AbilityEventListeners).includes(eventListener)) {
                throw new Error(`Invalid ability event listener: ${eventListener}`);
            }
            if (typeof abilityFunction !== 'function') {
                throw new Error(`Invalid ability function: ${abilityFunction}`);
            }
            
            abilityConfig = {
                name: abilityName,
                description: abilityDesc,
                event: eventListener,
                callback: abilityFunction
            };
        }
        
        // Add effectValidator if provided
        if (effectValidator && typeof effectValidator === 'function') {
            abilityConfig.effectValidator = effectValidator;
        }
        
        if (!this.abilities) {
            this.abilities = [];
        }
        this.abilities.push(abilityConfig);
    }
    addStatusCondition(status) {
        console.log(`Adding status condition: ${status}`);
        if (typeof status !== 'string') {
            throw new Error(`Invalid status condition: ${status}`);
        }
        if (!this.statusConditions.includes(status)) {
            this.statusConditions.push(status);
        }
        // Set explicit status properties
        if (status === 'paralyzed') {
            this.paralyzed = 1;
        } else if (status === 'asleep') {
            this.asleep = true;
        } else if (status === 'confused') {
            this.confused = true;
        } else if (status === 'burned') {
            this.burned = true;
        } else if (status === 'poisoned') {
            this.poisoned = true;
        }
    }
    removeStatusCondition(status) {
        if (typeof status !== 'string') {
            throw new Error(`Invalid status condition: ${status}`);
        }
        const index = this.statusConditions.indexOf(status);
        if (index !== -1) {
            this.statusConditions.splice(index, 1);
            // Remove custom property for this status
            if (status === 'paralyzed') {
                delete this.statusProperties.paralysisTurns;
            }
        }
    }
    // Check if the card is paralyzed
    isParalyzed() {
        // Effects are only active if paralyzed > 0
        return this.paralyzed > 0;
    }

    // Call this after decrementing paralyzed each turn
    updateParalysisStatus() {
        if (this.paralyzed <= 0) {
            this.paralyzed = 0;
            // Remove 'paralyzed' from statusConditions if present
            const idx = this.statusConditions.indexOf('paralyzed');
            if (idx !== -1) this.statusConditions.splice(idx, 1);
        } else {
            // Ensure 'paralyzed' is present if paralyzed > 0
            if (!this.statusConditions.includes('paralyzed')) {
                this.statusConditions.push('paralyzed');
            }
        }
    }

    // Apply paralysis to the card (sets status and turn counter)
    applyParalysis() {
        this.addStatusCondition('paralyzed');
    }

    // Remove paralysis from the card (removes status and counter)
    removeParalysis() {
        this.removeStatusCondition('paralyzed');
    }

    // Override retreat logic to prevent retreating if paralyzed
    retreat() {
        if (this.isParalyzed()) {
            throw new Error(`${this.cardName} is paralyzed and cannot retreat.`);
        }
        // ...existing code...
    }
}
Object.freeze(Card.damage);
Object.freeze(Card.heal);
Object.freeze(Card.listAttacks);
Object.freeze(Card.listAbilities);
Object.freeze(Card.addAbility);
Object.freeze(Card.addAttack);

class Attachment {
    constructor() { }
    attach(pokemon) {
        if (!(pokemon instanceof Card)) {
            throw new Error(`Can only attach to a Card instance`);
        }
        // Add attachment logic in child classes
    }
    detach() {
        // Add detach logic in child classes
    }

}
class Energy extends Attachment {
    constructor(energyType) {
        super();
        // Generate unique ID for this energy instance
        this.id = generateUUID();
        
        if (!Object.values(PokemonType).includes(energyType)) {
            throw new Error(`Invalid energy type: ${energyType}`);
        }
        this.energyType = energyType;
    }
    attach(pokemon) {
        super.attach(pokemon);
        this.attachedTo = pokemon;
        pokemon.energy.push(this.energyType);
        pokemon.owner.attachedEnergyThisTurn = true;
        pokemon.owner.guiHook.attachCardElement(pokemon, this);
    }
    detach() {
        if (this.attached && Array.isArray(this.attachedTo.energy)) {
            const index = this.attachedTo.energy.indexOf(this.energyType);
            if (index !== -1) {
                this.attachedTo.energy.splice(index, 1);
            }
            this.attachedTo = null;
        }
    }
}
export { Card, Attachment, Energy };
