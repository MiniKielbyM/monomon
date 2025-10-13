#!/usr/bin/env node
// Build script to generate cardData.js from Cards.js classes

import { writeFileSync } from 'fs';
import { generateCardDataFile } from './generateCardData.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
    console.log('Generating cardData.js from Cards.js classes...');
    
    const cardDataContent = generateCardDataFile();
    const outputPath = path.join(__dirname, 'cardData.js');
    
    writeFileSync(outputPath, cardDataContent, 'utf8');
    
    console.log(`✅ Successfully generated cardData.js at ${outputPath}`);
    console.log('Card data has been extracted and is ready for use!');
    
} catch (error) {
    console.error('❌ Failed to generate cardData.js:', error.message);
    console.error(error.stack);
    process.exit(1);
}