// GOAL'D IN: additive HealthKit config. Run ONLY from your project root.
// Does not alter Android config, existing plugins, or EAS profiles.
const fs = require('fs');
const path = require('path');
const filepath = path.join(process.cwd(), 'app.json');
if (!fs.existsSync(filepath)) throw new Error('Run from the GOAL\'D IN project folder (app.json missing).');
const raw = fs.readFileSync(filepath, 'utf8');
const config = JSON.parse(raw);
if (!config.expo) throw new Error('Unexpected app.json: no expo object.');
const backup = filepath + '.before-apple-health';
if (!fs.existsSync(backup)) fs.copyFileSync(filepath, backup);
const pluginName = '@kingstinct/react-native-healthkit';
const opts = {
  NSHealthShareUsageDescription: "GOAL'D IN reads sleep, resting heart rate and heart-rate variability only when you choose, to provide personal activity context. We do not upload these readings or share them with other users.",
  NSHealthUpdateUsageDescription: false,
  background: false,
};
const current = Array.isArray(config.expo.plugins) ? config.expo.plugins : [];
config.expo.plugins = current.filter(p => (typeof p === 'string' ? p : Array.isArray(p) ? p[0] : '') !== pluginName);
config.expo.plugins.push([pluginName, opts]);
fs.writeFileSync(filepath, JSON.stringify(config, null, 2) + '\n');
console.log('Apple HealthKit plugin added. Existing plugins preserved.');
console.log('Backup: ' + backup);
