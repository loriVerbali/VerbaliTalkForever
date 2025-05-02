const fetch = require('node-fetch'); // Only if using Node.js

let fetch_url = `https://docs.google.com/document/d/e/2PACX-1vQGUck9HIFCyezsrBSnmENk5ieJuYwpt7YHYEzeNJkIb9OSDdx-ov2nRNReKQyey-cwJOoEKUhLmN9z/pub`;

const getDoc = async fetch_url => {
  let folder_fetch_options = {method: 'GET'};
  const response = await fetch(fetch_url, folder_fetch_options);
  const text = await response.text();

  // Extract the first table
  const a = text.indexOf('<table');
  const b = text.indexOf('</table>', a);
  if (a === -1 || b === -1) {
    console.log('No table found.');
    return [];
  }
  const tableHtml = text.substring(a, b + 8);
  // Extract rows and cells using regex
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;

  let y = 0;
  const result = [];
  let rowMatch;
  const rowTexts = [];
  let isHeader = true;
  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    if (isHeader) {
      isHeader = false;
      continue; // Skip the first row (header)
    }
    const rowHtml = rowMatch[1];
    let rowText = '';
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      const spanMatch = cellMatch[1].match(/<span[^>]*>(.*?)<\/span>/);
      let char = spanMatch ? spanMatch[1].trim() : '';
      rowText += char;
    }
    rowTexts.push(rowText);
  }
  drawGrid(rowTexts);
};

function drawGrid(rowTexts) {
  // Parse all (x, char, y) from each rowText
  const points = [];
  for (const rowText of rowTexts) {
    // Expecting rowText to be a string like '0█0' or '0█1'
    // We'll use a regex to extract x, char, y
    const match = rowText.match(/^(\d+)(.)(\d+)$/);
    if (match) {
      const x = parseInt(match[1], 10);
      const char = match[2];
      const y = parseInt(match[3], 10);
      points.push({x, y, char});
    }
  }

  // Find max x and y to determine grid size
  let maxX = 0,
    maxY = 0;
  for (const {x, y} of points) {
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  // Initialize 2D array with spaces
  const arr = Array.from({length: maxY + 1}, () => Array(maxX + 1).fill(' '));

  // Place each char in its position
  for (const {x, y, char} of points) {
    arr[y][x] = char;
  }

  // Print the grid reversed (from bottom to top)
  for (let i = arr.length - 1; i >= 0; i--) {
    console.log(arr[i].join(' '));
  }
}

getDoc(fetch_url);
