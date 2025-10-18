// Card data extractor - parses Cards.js file to extract constructor data
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to parse Cards.js file and extract card data
function extractCardData() {
    const pokemonCards = [];
    const energyCards = [
        {
            name: 'Fire Energy',
            type: 'energy',
            energyType: 'fire',
            imgUrl: 'https://images.pokemontcg.io/base1/98_hires.png'
        },
        {
            name: 'Water Energy',
            type: 'energy',
            energyType: 'water',
            imgUrl: 'https://images.pokemontcg.io/base1/102_hires.png'
        },
        {
            name: 'Lightning Energy',
            type: 'energy',
            energyType: 'lightning',
            imgUrl: 'https://images.pokemontcg.io/base1/100_hires.png'
        },
        {
            name: 'Grass Energy',
            type: 'energy',
            energyType: 'grass',
            imgUrl: 'https://images.pokemontcg.io/base1/99_hires.png'
        },
        {
            name: 'Psychic Energy',
            type: 'energy',
            energyType: 'psychic',
            imgUrl: 'https://images.pokemontcg.io/base1/101_hires.png'
        },
        {
            name: 'Fighting Energy',
            type: 'energy',
            energyType: 'fighting',
            imgUrl: 'https://images.pokemontcg.io/base1/97_hires.png'
        }
    ];

    try {
        // Read the Cards.js file
        const cardsFilePath = path.join(__dirname, '../Lib/Cards/Base/Base1/Cards.js');
        const cardsFileContent = readFileSync(cardsFilePath, 'utf8');
        
        // Parse the file to extract card data
        const cardData = parseCardsFile(cardsFileContent);
        pokemonCards.push(...cardData);
        
    } catch (error) {
        console.error('Error reading Cards.js file:', error.message);
    }

    return { pokemonCards, energyCards };
}

// (Old parseCardsFile function removed - replaced with enhanced version below)

// Parse the Cards.js file content to extract constructor parameters AND abilities/attacks
function parseCardsFile(fileContent) {
    const cardData = [];
    
    // Split the file by class declarations and process each
    const classSections = fileContent.split(/(?=class\s+\w+\s+extends\s+Card)/);
    
    for (const section of classSections) {
        if (!section.trim() || !section.includes('extends Card')) continue;
        
        const classNameMatch = section.match(/class\s+(\w+)\s+extends\s+Card/);
        if (!classNameMatch) continue;
        
        const className = classNameMatch[1];
        
        try {
            const cardInfo = parseCardClass(className, section);
            if (cardInfo) {
                cardData.push(cardInfo);
                console.log(`Extracted data for ${className}: ${cardInfo.name} (${cardInfo.attacks.length} attacks, ${cardInfo.abilities.length} abilities)`);
            }
        } catch (error) {
            console.error(`Failed to parse ${className}:`, error.message);
        }
    }
    return cardData;
}

// Parse a complete card class to extract all relevant data
function parseCardClass(className, classBody) {
    // Extract super() parameters
    const superMatch = classBody.match(/super\(\s*([^)]+)\s*\)/);
    if (!superMatch) return null;
    
    const superParams = superMatch[1];
    const basicInfo = parseSuperParameters(superParams);
    if (!basicInfo) return null;
    
    // Extract abilities
    const abilities = extractAbilities(classBody);
    
    // Extract attacks
    const attacks = extractAttacks(classBody);
    
    return {
        ...basicInfo,
        abilities: abilities,
        attacks: attacks
    };
}

// Extract abilities from class body
function extractAbilities(classBody) {
    const abilities = [];
    
    // More comprehensive approach: find all addAbility calls and extract content between quotes
    const abilityCallRegex = /this\.addAbility\(/g;
    let match;
    
    while ((match = abilityCallRegex.exec(classBody)) !== null) {
        const startPos = match.index;
        let pos = startPos + match[0].length;
        let parenCount = 1;
        let callContent = '';
        
        // Find the complete function call by counting parentheses
        while (pos < classBody.length && parenCount > 0) {
            const char = classBody[pos];
            if (char === '(') parenCount++;
            else if (char === ')') parenCount--;
            
            if (parenCount > 0) {
                callContent += char;
            }
            pos++;
        }
        
        // Extract name and description from the complete call
        const nameMatch = callContent.match(/^\s*(['"`])([^'"`]+)\1/);
        const descMatch = callContent.match(/,\s*(['"`])((?:(?!\1)[^\\]|\\.)*)?\1/);
        
        if (nameMatch && descMatch) {
            abilities.push({
                name: nameMatch[2],
                description: descMatch[2] || ''
            });
        }
    }
    
    return abilities;
}

// Extract attacks from class body
function extractAttacks(classBody) {
    const attacks = [];
    const attackRegex = /this\.addAttack\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]*)['"`]\s*,\s*\[([^\]]+)\]/g;
    
    let match;
    while ((match = attackRegex.exec(classBody)) !== null) {
        const energyCost = parseEnergyCost(match[3]);
        attacks.push({
            name: match[1],
            description: match[2],
            energyCost: energyCost
        });
    }
    
    return attacks;
}

// Parse energy cost array
function parseEnergyCost(energyString) {
    const energyCost = [];
    const energyMatches = energyString.match(/PokemonType\.(\w+)/g);
    
    if (energyMatches) {
        energyMatches.forEach(match => {
            const type = match.replace('PokemonType.', '').toLowerCase();
            energyCost.push(type);
        });
    }
    
    return energyCost;
}

// Parse the super() parameters to extract card information
function parseSuperParameters(superParams) {
    // Split parameters and clean them up
    const params = superParams.split(',').map(p => p.trim());
    
    if (params.length < 5) {
        return null;
    }
    
    // Extract the key parameters we need:
    // super(owner, imgUrl, cardName, type, hp, ...)
    const imgUrl = params[1]?.replace(/['"`]/g, '');
    const cardName = params[2]?.replace(/['"`]/g, '');
    const type = convertTypeToString(params[3]);
    const hp = parseInt(params[4]) || 0;
    
    return {
        name: cardName,
        type: type,
        hp: hp,
        imgUrl: imgUrl
    };
}

// Convert PokemonType enum references to strings
function convertTypeToString(typeParam) {
    const typeMap = {
        'PokemonType.GRASS': 'grass',
        'PokemonType.FIRE': 'fire',
        'PokemonType.WATER': 'water',
        'PokemonType.LIGHTNING': 'lightning',
        'PokemonType.PSYCHIC': 'psychic',
        'PokemonType.FIGHTING': 'fighting',
        'PokemonType.COLORLESS': 'colorless'
    };
    
    return typeMap[typeParam?.trim()] || 'unknown';
}

// Generate the cardData.js file content
function generateCardDataFile() {
    const { pokemonCards, energyCards } = extractCardData();
    
    const fileContent = `// Auto-generated card data from Cards.js classes
// Generated on ${new Date().toISOString()}

export const pokemonCards = ${JSON.stringify(pokemonCards, null, 4)};

export const energyCards = ${JSON.stringify(energyCards, null, 4)};
`;

    return fileContent;
}

export { extractCardData, generateCardDataFile };