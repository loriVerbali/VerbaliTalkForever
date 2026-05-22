#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read the seed data file
const seedDataPath = path.join(
  __dirname,
  'src/utils/sentenceBuilderSeedData.ts',
);
const content = fs.readFileSync(seedDataPath, 'utf8');

// Extract all title values using regex
const titleRegex = /title:\s*['"`]([^'"`]+)['"`]/g;
const titles = [];
let match;

while ((match = titleRegex.exec(content)) !== null) {
  titles.push(match[1]);
}

// Save all 820 titles to a simple file with quotes and commas (lowercase)
const outputPath = path.join(__dirname, 'all_820_titles.txt');
const quotedTitles = titles.map(title => `'${title.toLowerCase()}',`);
fs.writeFileSync(outputPath, quotedTitles.join('\n'));

