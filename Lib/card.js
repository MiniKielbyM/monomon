import PokemonType from "./enums.js";
import Pokemon from "./PokemonList.js";
class Card {
    constructor(cardName, type, hp, pokemon, evolvesFrom = null, canEvolve = true, weakness = null, resistance= null, retreatCost = [], prizeCards = 1) {
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
        this.resistance = resistance;
        if (!Array.isArray(retreatCost) || !retreatCost.every(cost => Object.values(PokemonType).includes(cost))) {
            throw new Error(`Invalid Pokemon retreat cost: ${retreatCost}`);
        }
        this.retreatCost = retreatCost;
        if (typeof prizeCards !== 'number' || prizeCards < 0) {
            throw new Error(`Invalid number of prize cards: ${prizeCards}`);
        }
        this.prizeCards = prizeCards;
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
export default Card;
