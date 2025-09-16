import Card from "./card.js";
import enums from "./enums.js";
const { PokemonType, CardModifiers } = enums;
class Pikachu extends Card {
    constructor() {
        super(
            'New Card',
            PokemonType.GRASS,
            60,
            'Abomasnow',
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