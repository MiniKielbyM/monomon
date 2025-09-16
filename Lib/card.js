import enums from "./enums.js";
const { PokemonType, CardModifiers } = enums;
import Pokemon from "./PokemonList.js";
class Card {
    //Global card properties
    static energy = [];
    static attachments = [];
    //Constructor
    constructor(cardName, type, hp, pokemon, evolvesFrom = null, canEvolve = true, weakness = null, resistance= null, retreatCost = 0, prizeCards = 1, cardMod = CardModifiers.Base) {
        this.cardName = cardName;
        if (!Object.values(PokemonType).includes(type)) {
            throw new Error(`Invalid Pokemon type: ${type}`);
        }
        this.type = type;
        if (typeof hp !== 'number' || hp < 0) {
            throw new Error(`Invalid Pokemon HP: ${hp}`);
        }
        this.hp = hp;
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
        this.resistance = parseInt(resistance);
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
    }
    // Utility functions, dont edit these on children classes
    damage(amount) {
        if (typeof amount !== 'number' || amount < 0) {
            throw new Error(`Invalid damage amount: ${amount}`);
        }
        this.health -= amount;
        if (this.health < 0) {
            this.health = 0;
        }
    }
    heal(amount) {
        if (typeof amount !== 'number' || amount < 0) {
            throw new Error(`Invalid heal amount: ${amount}`);
        }
        this.health += amount;
        if (this.health > this.hp) {
            this.health = this.hp;
        }
    }
    
}
Object.freeze(Card.damage);
Object.freeze(Card.heal);
class Attachment {
    constructor() {}
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
        if (!Object.values(PokemonType).includes(energyType)) {
            throw new Error(`Invalid energy type: ${energyType}`);
        }
        this.energyType = energyType;
    }
    attach(pokemon) {
        super.attach(pokemon);
        this.attachedTo = pokemon;
        pokemon.energy.push(this.energyType);
    }
    detach() {
        if (this.attached && Array.isArray(this.attachedTo.energy)) {
            const idx = this.attachedTo.energy.indexOf(this.energyType);
            if (idx !== -1) {
                this.attachedTo.energy.splice(idx, 1);
            }
            this.attachedTo = null;
        }
    }
}
export default Card;
