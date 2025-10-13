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

// Parse the Cards.js file content to extract constructor parameters
function parseCardsFile(fileContent) {
    const cardData = [];
    
    // Regular expression to match class constructors and their super() calls
    const classRegex = /class\s+(\w+)\s+extends\s+Card\s*{[\s\S]*?constructor\([^)]*\)\s*{[\s\S]*?super\(\s*([^)]+)\s*\)/gm;
    
    let match;
    while ((match = classRegex.exec(fileContent)) !== null) {
        const className = match[1];
        const superParams = match[2];
        
        try {
            const cardInfo = parseSuperParameters(superParams);
            if (cardInfo) {
                cardData.push(cardInfo);
                console.log(`Extracted data for ${className}:`, cardInfo);
            }
        } catch (error) {
            console.error(`Failed to parse ${className}:`, error.message);
        }
    }
    
    return cardData;
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