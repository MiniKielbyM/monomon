# Card Data Framework Syntax

This document describes the JSON-based data framework for storing card sets, including generations, expansions, cards, and card attributes.  

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
- **If omitted** → Expansion has no display name.  

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
| Field          | Type       | Description | If omitted |
|----------------|-----------|-------------|------------|
| `DisplayName`  | string    | Display name of the card. | Defaults to `Pokemon` field value. |
| `Pokemon`      | string    | The Pokémon’s name, used for evolutions. | Card is invalid (required). |
| `Evolution`    | string    | Pokémon it evolves from. | Card is treated as a **Basic Pokémon**. |
| `Type`         | enum      | The Pokémon’s elemental type. | Card has no type (invalid for play). |
| `HP`           | integer   | Hit points. | Treated as `0` HP (auto-KO). |
| `Rarity`       | enum      | Rarity classification. | Defaults to `"Common"`. |

---

## **Accepted Values**

### **Type**
Elemental types follow TCG conventions:  

- `Colorless`, `Fire`, `Water`, `Grass`, `Electric`, `Psychic`, `Fighting`, `Darkness`, `Metal`, `Dragon`, `Fairy`  

**If omitted** → Pokémon has no type; considered invalid.  

---

### **Rarity**
- `Common`, `Uncommon`, `Rare`, `Rare Holo`, `Promo`  

**If omitted** → Defaults to `Common`.  

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
  - **If omitted** → Pokémon has **no weakness**.  

- **Resistance**
  - `Type`: *(enum, same as Pokémon type list)*  
  - `Difference`: integer (e.g., `30`)  
  - **If omitted** → Pokémon has **no resistance**.  

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
- **If omitted** → Retreat is free.  

---

## **Attacks**

```json
"Attacks": [
  {
    "Name": "Psyshock",
    "Cost": ["Psychic"],
    "Damage": 10,
    "Description": "...",
    "DamageDisplayOverride": "30X", 
    "Effects": [  ]
  }
]
```

### **Attack Fields**
| Field                   | Type        | Description | If omitted |
|--------------------------|------------|-------------|------------|
| `Name`                  | string     | Attack name. | Attack is invalid. |
| `Cost`                  | list[enum] | Required energies. | Attack costs nothing. |
| `Damage`                | integer    | Base damage. | Attack does 0 damage. |
| `DamageDisplayOverride` | string     | Display override (e.g., `"30X"`). | Base `Damage` shown instead. |
| `Description`           | string     | Attack rules text. | No description displayed. |
| `Effects`               | list       | Extra mechanics. | Attack has no effects. |

---

## **Abilities**

```json
"Abilities": [
  {
    "Name": "Damage Swap",
    "Description": "...",
    "PlayableTiming": ["BeforeAttack", "Active"],
    "Target": "Ally",
    "Effects": [  ]
  }
]
```

### **Ability Fields**
| Field           | Type        | Description | If omitted |
|-----------------|------------|-------------|------------|
| `Name`          | string     | Ability name. | Ability is invalid. |
| `Description`   | string     | Ability effect text. | Defaults to empty string. |
| `PlayableTiming`| list[enum] | When ability can be used. | Defaults to `BeforeAttack`. |
| `Target`        | enum       | Who is affected. | Defaults to `Self`. |
| `Effects`       | list       | Effects triggered. | Ability does nothing. |

---

## **PlayableTiming (When can an ability be used?)**

| Value         | Meaning | Example | If omitted |
|---------------|---------|---------|------------|
| **`BeforeAttack`** | During your turn, before attacking. | Alakazam’s *Damage Swap*. | Becomes the default. |
| **`Active`** | Only when Pokémon is Active. | Alakazam must be Active. | Ability works regardless of position. |

---

## **Target (Who or what is affected?)**

| Value        | Meaning | Example | If omitted |
|--------------|---------|---------|------------|
| **`Self`**   | Refers to this Pokémon. | Arcanine’s *Take Down*. | Becomes the default. |
| **`Defending`** | Opponent’s Active Pokémon. | Abra’s *Psyshock*. | Defaults to `Self`. |
| **`Ally`**   | Your own Pokémon. | Alakazam’s *Damage Swap*. | Defaults to `Self`. |
| **`Target`** | Player chooses a Pokémon. | Choose a Benched Pokémon. | Defaults to `Self`. |

---

## **Effects**

```json
{
  "Type": "Damage",
  "Target": "Defending",
  "Condition": { "CoinFlip": "Heads" },
  "Damage": 30
}
```

### **Effect Types**
| Type      | Fields | Description | If omitted |
|-----------|--------|-------------|------------|
| `Damage`  | `Damage`, `Target`, `Condition` | Deals damage. | No damage dealt. |
| `Heal`    | `Damage`, `Target`, `Condition` | Removes damage counters. | No healing occurs. |
| `Paralyze`| `Target`, `Condition` | Inflicts Paralyzed. | No status applied. |
| `Effect`  | `Effect`, `Target`, `Condition` | Inflicts Confuse/Poison/etc. | Nothing happens. |
| `Discard` | `Card`, `Target`, `Amount` | Discards card(s). | Nothing discarded. |

---

## **Conditions**

### **Coin Flip**
```json
"Condition": { "CoinFlip": "Heads" }
```
- Accepted: `"Heads"`, `"Tails"`  
- **If omitted** → Condition always succeeds.  

### **Status**
```json
"Status": ["Asleep", "Confused", "Paralyzed"]
```
- Accepted: `Asleep`, `Confused`, `Paralyzed`, `Poisoned`  
- **If omitted** → Status not checked.  

### **Health**
```json
"Health": { "Value": 10, "Comparison": "GreaterThan" }
```
- Accepted comparisons: `Equal`, `GreaterThan`, `LessThan`, `GreaterThanOrEqual`, `LessThanOrEqual`  
- **If omitted** → Health not checked.  

### **Negation**
```json
{ "Not": true, "Status": ["Paralyzed"] }
```
- Inverts the condition.  
- **If omitted** → Condition behaves normally.  
