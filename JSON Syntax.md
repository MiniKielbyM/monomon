# Pokémon Card Data Framework Syntax (Expanded)

This document describes the JSON-based data framework for storing Pokémon card sets, including generations, expansions, and Pokémon card attributes. Only Pokémon cards are covered here; Trainer and Energy cards are not included.

---

## **Top-Level Structure**

```json
{
  "Gens": {
    "Base": {
      "Base Set": {
        "Meta": {  },
        "Cards": {  }
      }
    }
  }
}
```

### **Keys**

* **`Gens`** → Container for generations.
* **`Base`** → Example generation (name is arbitrary).
* **`Base Set`** → Expansion within the generation.
* **`Meta`** → Metadata about the expansion.
* **`Cards`** → The card list for the expansion.

---

## **Expansion Metadata (`Meta`)**

```json
"Meta": {
  "Name": "Base Set"
}
```

* **`Name`** *(string)* → Name of the expansion.
* **If omitted** → Expansion has no display name.

---

## **Cards**

Cards are grouped by type (`Pokemon` in this example).

```json
"Cards": {
  "Pokemon": {
    "Abra": {  },
    "Alakazam": {  }
  }
}
```

---

## **Card Schema**

### **Base Fields**

| Field         | Type    | Description                              | If omitted                         |
| ------------- | ------- | ---------------------------------------- | ---------------------------------- |
| `DisplayName` | string  | Display name of the card.                | Card is invalid (required).        |
| `Pokemon`     | string  | The Pokémon’s name, used for evolutions. | Card won't be checked as evolvable.|
| `Evolution`   | string  | Pokémon it evolves from.                 | Treated as **Basic Pokémon**.      |
| `Type`        | enum    | Elemental type.                          | Card has no type (invalid).        |
| `HP`          | integer | Hit points.                              | Treated as `0` HP (auto-KO).       |
| `Rarity`      | enum    | Rarity classification.                   | Defaults to `"Common"`.            |
| `PrizeCards`  | integer | Prize cards drawn on defeat              | Defaults to 1                      |
---

## **Accepted Values**

### **Type**

* `Colorless`, `Fire`, `Water`, `Grass`, `Electric`, `Psychic`, `Fighting`, `Darkness`, `Metal`, `Dragon`, `Fairy`
* **If omitted** → Pokémon has no type; considered invalid.

### **Rarity**

* `Common`, `Uncommon`, `Rare`, `Rare Holo`, `Promo`
* **If omitted** → Defaults to `Common`.

---

### **Weakness / Resistance**

```json
"Weakness": { "Type": "Psychic", "Multiplier": 2 },
"Resistance": { "Type": "Fighting", "Difference": 30 }
```

* **Weakness** → Type and multiplier; **If omitted** → no weakness.
* **Resistance** → Type and difference; **If omitted** → no resistance.

---

### **RetreatCost**

* List of **Energy types** required to retreat.
* Allowed values: same as Type list.
* **If omitted** → Retreat is free.

---

## **Attacks**

### **Attack Fields**

| Field                   | Type        | Description                       | If omitted         |
| ----------------------- | ----------- | --------------------------------- | ------------------ |
| `Name`                  | string      | Attack name.                      | Attack invalid.    |
| `Cost`                  | list\[enum] | Required energies.                | Costs nothing.     |
| `Damage`                | integer     | Base damage.                      | 0 damage.          |
| `DamageDisplayOverride` | string      | Display override (e.g., `"30X"`). | Base damage shown. |
| `Description`           | string      | Attack rules text.                | Empty.             |
| `Effects`               | list        | Extra mechanics.                  | No effects.        |


---

## **Abilities**

### **Ability Fields**

| Field              | Type        | Description                                                  | If omitted                  |
| ------------------ | ----------- | ------------------------------------------------------------ | --------------------------- |
| `Name`             | string      | Ability name.                                                | Invalid.                    |
| `Description`      | string      | Ability effect text.                                         | Empty string.               |
| `PlayableTiming`   | list\[enum] | When ability can be used.                                    | Defaults to `BeforeAttack`. |
| `Target`           | enum        | Who is affected; uses default target defined in the ability. | Defaults to `Self`.         |
| `Effects`          | list        | Effects triggered.                                           | Nothing happens.            |
| `TargetConditions` | list        | Conditions to filter eligible targets.                       | No filtering applied.       |

---

## **PlayableTiming (When can an ability be used?)**

| Value                | Meaning                                | Example                          | If omitted                    |
| -------------------- | -------------------------------------- | -------------------------------- | ----------------------------- |
| `BeforeAttack`       | During your turn, before attacking.    | Alakazam’s Damage Swap.          | Default.                      |
| `Active`             | Only when Pokémon is Active.           | Blastoise’s Rain Dance.          | Works regardless of position. |
| `Anytime`            | Can be used any time during your turn. | Misc. abilities.                 | Not usable.                   |
| `Bench`              | Only usable on the Bench.              | Heal Benched Pokémon.            | Defaults to Active rules.     |
| `Discard`            | Usable from discard pile.              | Recover Energy from discard.     | Not usable.                   |
| `Hand`               | Usable from hand.                      | Hand-triggered abilities.        | Defaults to Active rules.     |
| `AfterAttack`        | Triggered after attack.                | Secondary effects after attack.  | Not triggered.                |
| `OnDamageTaken`      | Triggered on taking damage.            | Heal or trigger effects.         | Not triggered.                |
| `OnKnockOut`         | Triggered when knocked out.            | GX or special knock-out effects. | Not triggered.                |
| `OnDraw`             | Triggered when drawn from deck.        | Effects when card drawn.         | Not triggered.                |
| `OnEnergyAttachment` | Triggered when Energy is attached.     | Attach-response abilities.       | Not triggered.                |

---

## **Target (Who or what is affected?) – Expanded**

| Value          | Meaning                                         | Example                          |
| -------------- | ----------------------------------------------- | -------------------------------- |
| `Self`         | Refers to this Pokémon.                         | Arcanine’s Take Down.            |
| `Defending`    | Opponent’s Active Pokémon.                      | Abra’s Psyshock.                 |
| `Ally`         | One friendly Pokémon.                           | Alakazam’s Damage Swap.          |
| `AllAllies`    | All friendly Pokémon.                           | Heal all Benched Pokémon.        |
| `Opponent`     | Any opponent Pokémon.                           | Poison or spread damage.         |
| `AllOpponents` | All opponent Pokémon.                           | Spread damage attack.            |
| `Target`       | Uses the default target defined in the ability. | Inherits ability-defined target. |
| `Bench`        | Only friendly Benched Pokémon.                  | Bench heal or buffs.             |
| `Discard`      | Pokémon or cards in discard pile.               | Recover Energy or trigger on KO. |
| `Hand`         | Pokémon in hand.                                | Hand-triggered effects.          |
| `Deck`         | Pokémon or cards in deck.                       | Search or reveal cards.          |

---

## **Effects – Expanded**

| Type         | Fields                                              | Description                            | If omitted            |
| ------------ | --------------------------------------------------- | -------------------------------------- | ----------------------|
| `Damage`     | `Damage`, `Target`, `Condition`                     | Deals damage.                          | 0 damage.             |
| `Heal`       | `Damage`, `Target`, `Condition`                     | Removes damage counters.               | No healing.           |
| `Affect`     | `Target`, `Status`, `Condition`                     | Inflicts a status.                     | No status applied.    |
| `Discard`    | `Card`, `Target`, `Amount`                          | Discards cards.                        | Nothing discarded.    |
| `Attach`     | `Card`, `EnergyType`, `From`, `Target`, `Condition` | Attaches Energy cards.                 | No attachment.        |
| `Draw`       | `Amount`, `Target`, `Condition`                     | Player draws cards.                    | No cards drawn.       |
| `Defend`     | `Target`, `Length`, `Damage`, `Condition`           | Prevents target from taking a certain amount of damage     | Damage taken normally |
| `MaxDefend`  | `Target`, `Length`, `Condition`                     | Prevents target from taking any damage     | Damage taken normally |
| `EnergyConvert` | `Target`, `Length`, `Conversion`, `Amount`, `Condition` | Allows the user to convert a certain number of energy to a different type | No energy converted |
| `FullEnergyConvert` | `Target`, `Length`, `Conversion`, `Condition` | Allows the user to convert all energy to a different type | No energy converted |
| `Copy` | `Target`, `RequireEnergy` | Allows user to copy one of the targets attacks | No attacks copied |


---

## **Conditions – Expanded**

| Type             | Description                                         | Accepted Values                                                                          | If omitted                             |
| ---------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------- |
| `CoinFlip`       | Requires coin flip result.                          | `Heads`, `Tails`                                                                         | Always true.                           |
| `Status`         | Checks Pokémon status.                              | `Asleep`, `Confused`, `Paralyzed`, `Poisoned`                                            | Status not checked.                    |
| `Health`         | Compares HP or damage counters.                     | Comparisons: `Equal`, `GreaterThan`, `LessThan`, `GreaterThanOrEqual`, `LessThanOrEqual` | Health not checked.                    |
| `EnergyAttached` | Checks attached Energy type/amount.                 | `Type`, `Value`, `Comparison`                                                            | Condition not checked.                 |
| `InPlay`         | Checks if Pokémon is Active or Benched.             | `Active`, `Bench`                                                                        | Condition not checked.                 |
| `InDiscard`      | Checks if card is in discard pile.                  | true/false                                                                               | Condition not checked.                 |
| `Not`            | Negates other condition.                            | true                                                                                     | Condition behaves normally if omitted. |
| `Player`         | Checks player-specific state (hand, deck, discard). | `Hand`, `Deck`, `Discard`                                                                | Condition not checked.                 |
| `Turn`           | Checks turn state.                                  | `CurrentPlayer`, `Opponent`                                                              | Not checked.                           |
