import Card from "./card.js";
import PokemonType from "./enums.js";
class Pikachu extends Card {
    constructor() {
        super('Pikachu', PokemonType.LIGHTNING, 60, PokemonType.FIGHTING, null, [PokemonType.COLORLESS, PokemonType.COLORLESS]);
    }
}
export default Pikachu;