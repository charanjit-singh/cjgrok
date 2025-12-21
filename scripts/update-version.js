const fs = require('fs');
const path = require('path');

// Get version from command line argument or package.json
const rootDir = path.join(__dirname, '..');
const packagePath = path.join(rootDir, 'package.json');
const newVersion = process.argv[2] || require(packagePath).version;

// Update package.json
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
packageJson.version = newVersion;
fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, '\t') + '\n');

// Update manifest.json
const manifestPath = path.join(rootDir, 'public', 'manifest.json');
const manifestJson = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifestJson.version = newVersion;
fs.writeFileSync(manifestPath, JSON.stringify(manifestJson, null, 4) + '\n');

console.log(`Version updated to ${newVersion}`);
