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
| `DisplayName` | string  | Display name of the card.                | Defaults to `Pokemon` field value. |
| `Pokemon`     | string  | The Pokémon’s name, used for evolutions. | Card is invalid (required).        |
| `Evolution`   | string  | Pokémon it evolves from.                 | Treated as **Basic Pokémon**.      |
| `Type`        | enum    | Elemental type.                          | Card has no type (invalid).        |
| `HP`          | integer | Hit points.                              | Treated as `0` HP (auto-KO).       |
| `Rarity`      | enum    | Rarity classification.                   | Defaults to `"Common"`.            |

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

| Value                | Meaning                                           | Example                                                        | If omitted                            |
| -------------------- | ------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------- |
| `BeforeAttack`       | During your turn, before declaring an attack.     | Alakazam’s Damage Swap.                                        | Default.                              |
| `Active`             | Only when the Pokémon is in the Active spot.      | Blastoise’s Rain Dance must be Active.                         | Ability works regardless of position. |
| `Anytime`            | Can be used any time during your turn.            | Trainer-like abilities.                                        | Not usable.                           |
| `Bench`              | Only usable while the Pokémon is on your Bench.   | Abilities that heal or modify damage for Benched Pokémon.      | Defaults to Active rules.             |
| `Discard`            | Usable while the Pokémon is in the discard pile.  | Abilities that trigger when a Pokémon is knocked out.          | Not usable.                           |
| `Hand`               | Usable while the Pokémon is in your hand.         | Future hand-triggered abilities.                               | Defaults to Active rules.             |
| `AfterAttack`        | Triggered after the Pokémon attacks.              | Abilities that deal secondary effects after attack resolution. | Not triggered.                        |
| `OnDamageTaken`      | Triggered when the Pokémon takes damage.          | Abilities that heal or activate in response to damage.         | Not triggered.                        |
| `OnKnockOut`         | Triggered when the Pokémon is knocked out.        | GX or special knock-out effects.                               | Not triggered.                        |
| `OnDraw`             | Triggered when the card is drawn from your deck.  | Abilities like Professor Oak’s research (if Pokémon-specific). | Not triggered.                        |
| `OnEnergyAttachment` | Triggered when Energy is attached to the Pokémon. | Abilities that respond to Energy attachments.                  | Not triggered.                        |

---

## **Target (Who or what is affected?) – Expanded**

| Value          | Meaning                                         | Example                                                  | If omitted             |
| -------------- | ----------------------------------------------- | -------------------------------------------------------- | ---------------------- |
| `Self`         | Refers to this Pokémon.                         | Arcanine’s Take Down.                                    | Default.               |
| `Defending`    | Opponent’s Active Pokémon.                      | Abra’s Psyshock.                                         | Defaults to Self.      |
| `Ally`         | One friendly Pokémon.                           | Alakazam’s Damage Swap.                                  | Defaults to Self.      |
| `AllAllies`    | All friendly Pokémon (Bench + Active).          | Heal all Benched Pokémon.                                | Defaults to Self.      |
| `Opponent`     | Any opponent Pokémon (Active or Benched).       | Poison or spread damage.                                 | Defaults to Defending. |
| `AllOpponents` | All opponent Pokémon.                           | Spread damage attack.                                    | Defaults to Defending. |
| `Target`       | Uses the default target defined in the ability. | Inherits ability-defined target (Self, Ally, Defending). | Defaults to Self.      |
| `Bench`        | Only friendly Benched Pokémon.                  | Bench heal or buffs.                                     | Defaults to Self.      |
| `Discard`      | Pokémon or cards in discard pile.               | Abilities that recover Energy or trigger on KO.          | No target.             |
| `Hand`         | Pokémon in player’s hand.                       | Future hand-triggered abilities.                         | No target.             |
| `Deck`         | Pokémon or cards in deck.                       | Effects that search deck or reveal cards.                | No target.             |

---

## **Effects – Expanded**

| Type       | Fields                          | Description              | If omitted         |
| ---------- | ------------------------------- | ------------------------ | ------------------ |
| `Damage`   | `Damage`, `Target`, `Condition` | Deals damage.            | 0 damage.          |
| `Heal`     | `Damage`, `Target`, `Condition` | Removes damage counters. | No healing.        |
| `Paralyze` | `Target`, `Condition`           | Inflicts Paralyzed.      | No status applied. |
| `Confuse`  | `Target`, `Condition`           | Inflicts Confused.       | No status.         |
| `Poison`   |                                 |                          |                    |
