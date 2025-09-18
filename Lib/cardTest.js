import Card from "./card.js";
import enums from "./enums.js";
const { PokemonType, CardModifiers } = enums;
class Pikachu extends Card {
    constructor(owner) {
        super(
            owner,
            'New Card',
            PokemonType.LIGHTNING,
            60,
            'Pikachu',
            null,
            true,
            null,
            null,
            0,
            1,
            CardModifiers.BASE
        );
    }
}
export default Pikachu;