// Adds camera/image picker permission config without replacing the user's app.json.
// Run in the GOAL'D IN project root: node scripts/setup-photo-plugin.cjs
const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'app.json');
if (!fs.existsSync(file)) throw new Error('Run from the app project root (app.json missing).');
const json = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!json.expo || !Array.isArray(json.expo.plugins)) {
  throw new Error('Unexpected Expo config. No files changed; please review app.json.');
}
const plugins = json.expo.plugins;
const entry = ['expo-image-picker', {
  cameraPermission: "Allow GOAL'D IN to capture photos you choose for your progress and YOU page.",
  photosPermission: "Allow GOAL'D IN to select a photo for your YOU page or private progress records.",
  microphonePermission: false,
}];
const index = plugins.findIndex((plugin) =>
  plugin === 'expo-image-picker' || (Array.isArray(plugin) && plugin[0] === 'expo-image-picker')
);
if (index < 0) plugins.push(entry);
else plugins[index] = entry;
const backup = `${file}.before-you-camera`;
if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
console.log('Photo plugin configured. Existing Health Connect and other plugins preserved.');
console.log('Backup:', backup);
