# Card Data Framework Syntax

This document describes the JSON-based data framework for storing card sets, including generations, expansions, cards, and card attributes.  

---

## **Top-Level Structure**

```json
{
  "Gens": {
    "Base": {
      "Base Set": {
        "Meta": { ... },
        "Cards": { ... }
      }
    }
  }
}
```

### **Keys**
- **`Gens`** → Container for generations.  
- **`Base`** → Example of a generation (name is arbitrary, one per generation).  
- **`Base Set`** → Expansion within the generation.  
- **`Meta`** → Metadata about the expansion.  
- **`Cards`** → The card list for the expansion.  

---

## **Expansion Metadata (`Meta`)**

```json
"Meta": {
  "Name": "Base Set"
}
```

- **`Name`** *(string)* → Name of the expansion.

---

## **Cards**

Cards are grouped by type (`Pokemon` in this example).  

```json
"Cards": {
  "Pokemon": {
    "Abra": { ... },
    "Alakazam": { ... }
  }
}
```

Each card has the following structure:

---

## **Card Schema**

### **Base Fields**
| Field          | Type       | Description |
|----------------|-----------|-------------|
| `DisplayName`  | string    | Display name of the card. |
| `Pokemon`      | string    | The Pokémon’s name, used for evolutions. |
| `Evolution`    | string    | *(optional)* The Pokémon it evolves from. |
| `Type`         | enum      | The Pokémon’s elemental type. |
| `HP`           | integer   | Hit points. |
| `Rarity`       | enum      | Rarity classification of the card. |

---

## **Accepted Values**

### **Type**
Elemental types follow the TCG conventions:  

- `Colorless`  
- `Fire`  
- `Water`  
- `Grass`  
- `Electric`  
- `Psychic`  
- `Fighting`  
- `Darkness`  
- `Metal`  
- `Dragon`  
- `Fairy`  

---

### **Rarity**
- `Common`  
- `Uncommon`  
- `Rare`  
- `Rare Holo`  
- `Promo`  

---

### **Weakness / Resistance**

```json
"Weakness": {
  "Type": "Psychic",
  "Multiplier": 2
},
"Resistance": {
  "Type": "Fighting",
  "Difference": 30
}
```

- **Weakness**
  - `Type`: *(enum, same as Pokémon type list)*
  - `Multiplier`: integer (usually `2`)  

- **Resistance**
  - `Type`: *(enum, same as Pokémon type list)*
  - `Difference`: integer (e.g., `30`)  

---

### **RetreatCost**

```json
"RetreatCost": [
  "Colorless",
  "Colorless"
]
```

- List of **Energy types** required to retreat the Pokémon.  
- Allowed values: *(same as Type list above)*  

---

## **Attacks**

```json
"Attacks": [
  {
    "Name": "Psyshock",
    "Cost": ["Psychic"],
    "Damage": 10,
    "Description": "Flip a coin. If heads, ...",
    "DamageDisplayOverride": "30X", // optional
    "Effects": [ ... ]
  }
]
```

### **Attack Fields**
| Field                   | Type        | Description |
|--------------------------|------------|-------------|
| `Name`                  | string     | Attack name. |
| `Cost`                  | list[enum] | Required energies (see Type list). |
| `Damage`                | integer    | Base damage value. |
| `DamageDisplayOverride` | string     | *(optional)* Override for display text (e.g., `"30X"`). |
| `Description`           | string     | Description of attack mechanics. |
| `Effects`               | list       | Special effects applied. |

---

## **Abilities**

```json
"Abilities": [
  {
    "Name": "Damage Swap",
    "Description": "...",
    "PlayableTiming": ["BeforeAttack", "Active"],
    "Target": "Ally",
    "Effects": [ ... ]
  }
]
```

### **Ability Fields**
| Field           | Type        | Description |
|-----------------|------------|-------------|
| `Name`          | string     | Ability name. |
| `Description`   | string     | Effect description. |
| `PlayableTiming`| list[enum] | When the ability can be used. |
| `Target`        | enum       | Who the ability targets. |
| `Effects`       | list       | Effects triggered. |

---

## **PlayableTiming & Target**

### **PlayableTiming (When can an ability be used?)**

| Value         | Meaning | Example |
|---------------|---------|---------|
| **`BeforeAttack`** | Usable during your turn, **before declaring an attack**. | Alakazam’s *Damage Swap* can only be used in your main phase before attacking. |
| **`Active`** | The ability works **only if the Pokémon is in the Active Spot**. | Alakazam must be Active to use *Damage Swap*. |

---

### **Target (Who or what is affected?)**

| Value        | Meaning | Example |
|--------------|---------|---------|
| **`Self`**   | Refers to the **card itself**. | Arcanine’s *Take Down* damages Arcanine itself. |
| **`Defending`** | The **opponent’s Active Pokémon**. | Abra’s *Psyshock* can Paralyze the Defending Pokémon. |
| **`Ally`**   | Another **friendly Pokémon** (usually on your Bench). | Alakazam’s *Damage Swap* moves damage counters between your own Pokémon. |
| **`Target`** | A **player-chosen Pokémon**, used for generic targeting. | (Future example) “Choose 1 of your opponent’s Benched Pokémon and deal 20 damage to it.” |

---

## **Effects**

Effects are structured objects describing mechanical changes.  

### **General Format**
```json
{
  "Type": "Damage",
  "Target": "Defending",
  "Condition": { "CoinFlip": "Heads" },
  "Damage": 30
}
```

### **Effect Types**
| Type      | Fields | Description |
|-----------|--------|-------------|
| `Damage`  | `Damage`, `Target`, `Condition` | Deals damage. |
| `Heal`    | `Damage`, `Target`, `Condition` | Removes damage counters. |
| `Paralyze`| `Target`, `Condition` | Inflicts Paralyzed status. |
| `Effect`  | `Effect`, `Target`, `Condition` | Generic status (e.g., Poison, Confuse). |
| `Discard` | `Card`, `Target`, `Amount` | Discards card(s) (often Energy). |

---

### **Conditions**

Conditions control when effects apply.  

#### **Coin Flip**
```json
"Condition": { "CoinFlip": "Heads" }
```
- Accepted values: `"Heads"`, `"Tails"`

#### **Status**
```json
"Status": ["Asleep", "Confused", "Paralyzed"]
```
- Accepted values:  
  - `Asleep`  
  - `Confused`  
  - `Paralyzed`  
  - `Poisoned`  

#### **Health**
```json
"Health": {
  "Value": 10,
  "Comparison": "GreaterThan"
}
```

- **Comparison** accepted values:  
  - `Equal`  
  - `GreaterThan`  
  - `LessThan`  
  - `GreaterThanOrEqual`  
  - `LessThanOrEqual`  

#### **Negation**
```json
{ "Not": true, "Status": ["Paralyzed"] }
```
- Wraps another condition to invert it.  

---

## **Example Snippet**

```json
"Abra": {
  "DisplayName": "Abra",
  "Pokemon": "Abra",
  "Type": "Psychic",
  "HP": 30,
  "Attacks": [
    {
      "Name": "Psyshock",
      "Cost": ["Psychic"],
      "Damage": 10,
      "Description": "Flip a coin. If heads, the Defending Pokémon is now Paralyzed.",
      "Effects": [
        {
          "Type": "Paralyze",
          "Target": "Defending",
          "Condition": { "CoinFlip": "Heads" }
        }
      ]
    }
  ],
  "Weakness": { "Type": "Psychic", "Multiplier": 2 },
  "Rarity": "Common"
}
```
