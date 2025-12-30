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

// Count duplicates
const titleCounts = {};
titles.forEach(title => {
  titleCounts[title] = (titleCounts[title] || 0) + 1;
});

// Find duplicates
const duplicates = Object.entries(titleCounts)
  .filter(([title, count]) => count > 1)
  .sort((a, b) => b[1] - a[1]); // Sort by count descending

// Remove duplicates and sort alphabetically
const uniqueTitles = [...new Set(titles)].sort();

console.log('All titles in seed data:');
console.log('========================');
console.log(`Total title occurrences: ${titles.length}`);
console.log(`Total unique titles: ${uniqueTitles.length}`);
console.log(`Duplicate titles: ${duplicates.length}`);
console.log('');

// Print all titles as a long list
uniqueTitles.forEach((title, index) => {
  console.log(`${index + 1}. ${title}`);
});

// Show duplicates if any
if (duplicates.length > 0) {
  console.log('\n\nDuplicate titles:');
  console.log('=================');
  duplicates.forEach(([title, count]) => {
    console.log(`${title} (appears ${count} times)`);
  });
}

// Create comprehensive output with all titles and their counts
const allTitlesWithCounts = Object.entries(titleCounts).sort((a, b) => {
  // Sort by count (descending), then by title (ascending)
  if (b[1] !== a[1]) return b[1] - a[1];
  return a[0].localeCompare(b[0]);
});

// Create comprehensive file content
let comprehensiveContent = `SEED DATA TITLES - COMPLETE ANALYSIS
=====================================

SUMMARY:
- Total title occurrences: ${titles.length}
- Total unique titles: ${uniqueTitles.length}
- Duplicate titles: ${duplicates.length}

ALL TITLES WITH COUNTS (sorted by frequency, then alphabetically):
================================================================

`;

allTitlesWithCounts.forEach(([title, count], index) => {
  const countIndicator = count > 1 ? ` (${count} times)` : '';
  comprehensiveContent += `${index + 1}. ${title}${countIndicator}\n`;
});

comprehensiveContent += `\n\nUNIQUE TITLES ONLY (alphabetical):
===============================

`;

uniqueTitles.forEach((title, index) => {
  comprehensiveContent += `${index + 1}. ${title}\n`;
});

if (duplicates.length > 0) {
  comprehensiveContent += `\n\nDUPLICATE TITLES ONLY (sorted by frequency):
=========================================

`;
  duplicates.forEach(([title, count], index) => {
    comprehensiveContent += `${index + 1}. ${title} (${count} times)\n`;
  });
}

// Save comprehensive file
const comprehensivePath = path.join(
  __dirname,
  'seed_data_complete_analysis.txt',
);
fs.writeFileSync(comprehensivePath, comprehensiveContent);
console.log(`\nComplete analysis saved to: ${comprehensivePath}`);
