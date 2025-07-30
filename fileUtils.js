const fs = require('fs');
const path = require('path');

/**
 * Ensures the given directory exists; creates it if it doesn't
 * @param {string} dirPath - The path to check/create
 */
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    console.log(`📁 Creating directory: ${dirPath}`);
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

/**
 * Ensures a JSON file exists with default content if it doesn't
 * @param {string} filePath - Path to the JSON file
 * @param {Object} defaultContent - Default content if file doesn't exist
 * @returns {Object} The content of the file
 */
const ensureJsonFileExists = (filePath, defaultContent = {}) => {
  ensureDirectoryExists(path.dirname(filePath));
  
  if (!fs.existsSync(filePath)) {
    console.log(`📄 Creating file: ${filePath}`);
    fs.writeFileSync(filePath, JSON.stringify(defaultContent, null, 2));
    return defaultContent;
  }
  
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`❌ Error reading JSON file ${filePath}:`, err);
    fs.writeFileSync(filePath, JSON.stringify(defaultContent, null, 2));
    return defaultContent;
  }
};

module.exports = {
  ensureDirectoryExists,
  ensureJsonFileExists
};
