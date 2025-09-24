import Card from "../../../card.js";
import enums from "../../../enums.js";
import Client from "../../../client.js";
import GUIHookUtils from "../../../guiHookUtils.js";
const { PokemonType, CardModifiers, AbilityEventListeners } = enums;

class Alakazam extends Card {
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
    }
    async DamageSwap(){
        if(this.owner.bench.length === 0){
            return;
        }
        const damagedCards = [this.owner.activePokemon, ...this.owner.bench].filter(card => card.health < card.hp);
        const target = await this.owner.guiHook.selectFromCards(damagedCards);
        const cards = [this.owner.opponent.activePokemon, ...this.owner.opponent.bench].filter(card => card !== target).filter(card => card.health > 10);
        const target2 = await this.owner.guiHook.selectFromCards(cards);
        target.heal(10);
        target2.damage(10);
    }
    async ConfuseRay(){
        if( await this.owner.guiHook.coinFlip()){
            this.owner.opponent.activePokemon.addStatusCondition('confused');
        }
        this.owner.opponent.activePokemon.damage(30);
        this.owner.guiHook.damageCardElement(this.owner.opponent.activePokemon, 30);
    }
}
class Blastoise extends Card {
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
        this.addAbility('Rain Dance', 'Once during your turn (before your attack), you may attach a Water Energy card from your hand to 1 of your Water Pokémon. This power can\'t be used if Blastoise is Asleep, Confused, or Paralyzed.', AbilityEventListeners.ONABILITYUSE, this.RainDance);
        this.addAttack('Hydro Pump', 'Does 40 damage plus 10 more damage for each water energy Energy attached to Blastoise but not used to pay for this attack\'s Energy cost. Extra water energy Energy after the 2nd doesn\'t count.', [PokemonType.WATER, PokemonType.WATER, PokemonType.WATER], this.HydroPump);
    }
    async RainDance(){
        if (this.owner.bench.length === 0 || this.owner.hand.filter(nrg => nrg instanceof Energy).filter(nrg => nrg.type === PokemonType.WATER).length === 0) {
            return;
        }
        const potentialTargets = [this.owner.activePokemon, ...this.owner.bench].filter(card => card !== this).filter(card => card.type === PokemonType.WATER);
        const target = await this.owner.guiHook.selectFromCards(potentialTargets);
        const tempStore = this.owner.hasAttachedEnergyThisTurn;
        this.owner.hand.filter(nrg => nrg instanceof Energy).filter(nrg => nrg.type === PokemonType.WATER)[0].attachTo(target);
        this.owner.hasAttachedEnergyThisTurn = tempStore;
    }
    async HydroPump(){
        const energyMod = Math.max(Math.min(this.energy.filter(nrg => nrg === PokemonType.WATER).length-3, 2), 0) * 10;
        this.owner.opponent.activePokemon.damage(40 + energyMod);
    }
}
export default { Alakazam, Blastoise };