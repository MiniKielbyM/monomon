const PokemonType = {
    FIRE: 'fire',
    WATER: 'water',
    GRASS: 'grass',
    LIGHTNING: 'lightning',
    PSYCHIC: 'psychic',
    DARK: 'dark',
    FAIRY: 'fairy',
    FIGHTING: 'fighting',
    STEEL: 'steel',
    DRAGON: 'dragon',
    COLORLESS: 'colorless'
};
const CardModifiers = {
    BASE: 'base',
    BREAK: 'break',
    EX: 'ex',
    MEGAEX: 'megaex',
    GX: 'gx',
    GXTAGTEAM: 'tagteam',
    V: 'v',
    VMAX: 'vmax'
}
const AbilityEventListeners= {
    ONPLAY: 'onPlay',
    ONATTACK: 'onAttack',
    ONDAMAGE: 'onDamage',
    ONHEAL: 'onHeal',
    ONKNOCKOUT: 'onKnockout',
    ONTURNSTART: 'onTurnStart',
    ONTURNAFTERDRAW: 'onTurnAfterDraw',
    ONTURNEND: 'onTurnEnd',
    ONENERGYATTACH: 'onEnergyAttach',
    ONEVOLVE: 'onEvolve',
    ONSWITCH: 'onSwitch',
    ONDISCARD: 'onDiscard',
    ONPRIZECARDTAKE: 'onPrizeCardTake',
    ONABILITYUSE: 'onAbilityUse',
    ONATTACKUSE: 'onAttackUse',
    ONBENCHPOKEMONADDED: 'onBenchPokemonAdded',
    FROMDISCARD: 'fromDiscard',
    FROMDECK: 'fromDeck',
    FROMHAND: 'fromHand',
    FROMPRIZECARDS: 'fromPrizeCards'
}
export default { PokemonType, CardModifiers, AbilityEventListeners };