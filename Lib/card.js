import Client from "./client.js";
import enums from "./enums.js";
const { PokemonType, CardModifiers, AbilityEventListeners } = enums;
import Pokemon from "./PokemonList.js";
class Card {
    //Global card properties
    static energy = [];
    static attachments = [];
    attacks = [];
    abilities = [];
    statusConditions = [];
    //Constructor
    constructor(owner, imgUrl, cardName, type, hp, pokemon, evolvesFrom = null, canEvolve = true, weakness = null, resistance = null, retreatCost = 0, prizeCards = 1, cardMod = CardModifiers.Base) {
        this.owner = owner;
        if (!(owner instanceof Client)) {
            throw new TypeError('owner must be an instance of Client');
        }
        this.imgUrl = imgUrl;
        this.cardName = cardName;
        if (!Object.values(PokemonType).includes(type)) {
            throw new Error(`Invalid Pokemon type: ${type}`);
        }
        this.type = type;
        if (typeof hp !== 'number' || hp < 0) {
            throw new Error(`Invalid Pokemon HP: ${hp}`);
        }
        this.hp = hp;
        this.health = hp;
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
        this.owner.guiHook.damageCardElement(this, amount);
    }
    heal(amount) {
        if (typeof amount !== 'number' || amount < 0) {
            throw new Error(`Invalid heal amount: ${amount}`);
        }
        this.health += amount;
        if (this.health > this.hp) {
            this.health = this.hp;
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
    addAbility(abilityName, abilityDesc, eventListener, abilityFunction) {
        if (typeof abilityName !== 'string') {
            throw new Error(`Invalid ability name: ${abilityName}`);
        }
        if (typeof abilityDesc !== 'string') {
            throw new Error(`Invalid ability description: ${abilityDesc}`);
        }
        if (!Object.values(AbilityEventListeners).includes(eventListener)) {
            throw new Error(`Invalid ability event listener: ${eventListener}`);
        }
        if (typeof abilityFunction !== 'function') {
            throw new Error(`Invalid ability function: ${abilityFunction}`);
        }
        this.abilities[abilityName] = { description: abilityDesc, event: eventListener, callback: abilityFunction };
    }
    addStatusCondition(status) {
        if (typeof status !== 'string') {
            throw new Error(`Invalid status condition: ${status}`);
        }
        if (this.statusConditions.includes(status)) {
            return;
        } else {
            this.statusConditions.push(status);
        }
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
        if (!Object.values(PokemonType).includes(energyType)) {
            throw new Error(`Invalid energy type: ${energyType}`);
        }
        this.energyType = energyType;
    }
    attach(pokemon) {
        super.attach(pokemon);
        this.attachedTo = pokemon;
        pokemon.energy.push(this.energyType);
        pokemon.owner.hasAttachedEnergyThisTurn = true;
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
export default { Card, Attachment, Energy };
