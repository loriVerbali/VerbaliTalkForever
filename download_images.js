const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Configuration
const CSV_FILE_PATH =
  '/Users/lori/Downloads/square-shape-32197364_production_neondb_2025-09-28_02-17-49.csv';
const OUTPUT_DIR = path.join(__dirname, 'assets', 'classic');

// Create output directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, {recursive: true});
  console.log(`Created directory: ${OUTPUT_DIR}`);
}

// Function to download a file
function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;

    const file = fs.createWriteStream(filepath);

    protocol
      .get(url, response => {
        if (response.statusCode === 200) {
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        } else {
          file.close();
          fs.unlink(filepath, () => {}); // Delete the file on error
          reject(
            new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`),
          );
        }
      })
      .on('error', err => {
        file.close();
        fs.unlink(filepath, () => {}); // Delete the file on error
        reject(err);
      });
  });
}

// Function to get file extension from URL
function getFileExtension(url) {
  const pathname = new URL(url).pathname;
  const extension = path.extname(pathname);
  return extension || '.jpg'; // Default to .jpg if no extension found
}

// Function to sanitize filename
function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9\s-_]/g, '') // Remove special characters except spaces, hyphens, underscores
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .toLowerCase();
}

// Main function
async function downloadImages() {
  try {
    console.log('Reading CSV file...');
    const csvContent = fs.readFileSync(CSV_FILE_PATH, 'utf8');
    const lines = csvContent.split('\n');

    // Skip header row
    const dataLines = lines.slice(1).filter(line => line.trim());

    console.log(`Found ${dataLines.length} entries to process`);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i];

      // Parse CSV line (simple parsing for quoted fields)
      const matches = line.match(/"([^"]*)"/g);
      if (!matches || matches.length < 2) {
        console.log(`Skipping malformed line ${i + 2}: ${line}`);
        errorCount++;
        continue;
      }

      const word = matches[0].replace(/"/g, '');
      const imageUrl = matches[1].replace(/"/g, '');

      if (!word || !imageUrl) {
        console.log(`Skipping line ${i + 2}: missing word or URL`);
        errorCount++;
        continue;
      }

      try {
        // Get file extension from URL
        const extension = getFileExtension(imageUrl);

        // Create filename using the word name
        const sanitizedWord = sanitizeFilename(word);
        const filename = `${sanitizedWord}${extension}`;
        const filepath = path.join(OUTPUT_DIR, filename);

        // Skip if file already exists
        if (fs.existsSync(filepath)) {
          console.log(`Skipping ${word} - file already exists: ${filename}`);
          continue;
        }

        console.log(`Downloading ${word}... (${i + 1}/${dataLines.length})`);
        await downloadFile(imageUrl, filepath);
        console.log(`✓ Downloaded: ${filename}`);
        successCount++;

        // Add a small delay to be respectful to the server
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.log(`✗ Failed to download ${word}: ${error.message}`);
        errorCount++;
      }
    }

    console.log('\n=== Download Summary ===');
    console.log(`Successfully downloaded: ${successCount} images`);
    console.log(`Failed downloads: ${errorCount} images`);
    console.log(`Images saved to: ${OUTPUT_DIR}`);
  } catch (error) {
    console.error('Error reading CSV file:', error.message);
  }
}

// Run the script
downloadImages().catch(console.error);
