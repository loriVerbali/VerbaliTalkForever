#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read the seed data file
const seedDataPath = path.join(
  __dirname,
  'src/utils/sentenceBuilderSeedData.ts',
);
const content = fs.readFileSync(seedDataPath, 'utf8');

// Parse the TypeScript array to extract entries with welcome.png
const entries = [];
let currentEntry = {};
let insideEntry = false;

// Split content into lines for processing
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();

  // Start of a new entry
  if (line === '{') {
    insideEntry = true;
    currentEntry = {};
    continue;
  }

  // End of current entry
  if (line === '},' || line === '}') {
    if (
      insideEntry &&
      currentEntry.imageUri &&
      currentEntry.imageUri.includes('welcome.png')
    ) {
      entries.push({...currentEntry});
    }
    insideEntry = false;
    currentEntry = {};
    continue;
  }

  // Parse properties inside entry
  if (insideEntry) {
    // Parse parentId
    if (line.startsWith('parentId:')) {
      const match = line.match(
        /parentId:\s*(?:'([^']*)'|"([^"]*)"|null|([^,]+))/,
      );
      if (match) {
        currentEntry.parentId = match[1] || match[2] || match[3] || null;
        if (currentEntry.parentId === 'null') currentEntry.parentId = null;
      }
    }

    // Parse title
    if (line.startsWith('title:')) {
      const match = line.match(/title:\s*['"`]([^'"`]+)['"`]/);
      if (match) {
        currentEntry.title = match[1];
      }
    }

    // Parse type
    if (line.startsWith('type:')) {
      const match = line.match(/type:\s*['"`]([^'"`]+)['"`]/);
      if (match) {
        currentEntry.type = match[1];
      }
    }

    // Parse kind
    if (line.startsWith('kind:')) {
      const match = line.match(/kind:\s*['"`]([^'"`]+)['"`]/);
      if (match) {
        currentEntry.kind = match[1];
      }
    }

    // Parse imageUri
    if (line.startsWith('imageUri:')) {
      const match = line.match(/imageUri:\s*['"`]([^'"`]+)['"`]/);
      if (match) {
        currentEntry.imageUri = match[1];
      }
    }
  }
}

// Now we need to build a map of parentId to title for folder lookups
const folderMap = {};

// First pass: collect all folder entries
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();

  if (line === '{') {
    insideEntry = true;
    currentEntry = {};
    continue;
  }

  if (line === '},' || line === '}') {
    if (insideEntry && currentEntry.kind === 'folder' && currentEntry.title) {
      // Create an ID based on the title for folder mapping
      const folderId =
        'folder_' + currentEntry.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
      folderMap[folderId] = currentEntry.title;

      // Also try some common patterns
      folderMap[
        'folder_' + currentEntry.title.toLowerCase().replace(/\s+/g, '_')
      ] = currentEntry.title;
      folderMap[
        'folder_' + currentEntry.title.toLowerCase().replace(/\s+/g, '')
      ] = currentEntry.title;
    }
    insideEntry = false;
    currentEntry = {};
    continue;
  }

  if (insideEntry) {
    if (line.startsWith('title:')) {
      const match = line.match(/title:\s*['"`]([^'"`]+)['"`]/);
      if (match) {
        currentEntry.title = match[1];
      }
    }

    if (line.startsWith('kind:')) {
      const match = line.match(/kind:\s*['"`]([^'"`]+)['"`]/);
      if (match) {
        currentEntry.kind = match[1];
      }
    }
  }
}

console.log('Found folder mappings:');
console.log(folderMap);
console.log('');

// Create CSV content
let csvContent = 'Title,Type,Kind,ParentFolder\n';

entries.forEach(entry => {
  const title = entry.title || '';
  const type = entry.type || '';
  const kind = entry.kind || '';

  let parentFolder = 'MainBoard'; // Default for null parentId

  if (entry.parentId && entry.parentId !== 'null' && entry.parentId !== null) {
    // Try to find the parent folder name
    if (folderMap[entry.parentId]) {
      parentFolder = folderMap[entry.parentId];
    } else {
      // If we can't find it in our map, use the parentId as-is
      parentFolder = entry.parentId;
    }
  }

  // Escape CSV values that contain commas or quotes
  const escapeCsvValue = value => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  csvContent += `${escapeCsvValue(title)},${escapeCsvValue(
    type,
  )},${escapeCsvValue(kind)},${escapeCsvValue(parentFolder)}\n`;
});

// Save to file
const outputPath = path.join(__dirname, 'welcome_png_titles.csv');
fs.writeFileSync(outputPath, csvContent);

console.log(`Found ${entries.length} entries with welcome.png`);
console.log(`CSV saved to: ${outputPath}`);
console.log('\nFirst 10 entries:');
console.log('================');

entries.slice(0, 10).forEach((entry, index) => {
  const parentFolder = entry.parentId
    ? folderMap[entry.parentId] || entry.parentId
    : 'MainBoard';
  console.log(
    `${index + 1}. ${entry.title} (${entry.kind}) - Parent: ${parentFolder}`,
  );
});

