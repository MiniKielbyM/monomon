import { Card } from "./card.js";
import enums from "./enums.js";
const { PokemonType, CardModifiers, AbilityEventListeners } = enums;
class Pikachu extends Card {
    constructor(owner) {
        super(
            owner,
            'https://images.pokemontcg.io/base4/87_hires.png',
            'Pikachu',
            PokemonType.LIGHTNING,
            60,
            'Pikachu',
            null,
            true,
            PokemonType.FIGHTING,
            null,
            1,
            1,
            CardModifiers.BASE
        );
        this.addAttack('Spark', 'This attack also does 10 damage to 1 of your opponent\'s benched Pokémon.', [PokemonType.LIGHTNING], this.Spark);
    }
    Spark() {
        this.owner.opponent.activePokemon.damage(10);
        this.owner.guiHook.damageCardElement(this.owner.opponent.activePokemon, 10);
        const target = this.owner.guiHook.selectFromCards(this.owner.opponent.bench);
        if (target !== null) {
            target.damage(10);
        }
        this.owner.guiHook.damageCardElement(target, 10);
    }
}
export default Pikachu;