// Run from the project root: node tests/test-workout-preparation.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const file = path.join(__dirname, '../lib/workoutPreparation.ts');
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
}).outputText;
const moduleObj = {exports: {}};
vm.runInNewContext(compiled, {module: moduleObj, exports: moduleObj.exports});
const {prepareWorkout, toSmartToolTimerStages} = moduleObj.exports;
const intro = prepareWorkout([
  'Warm up for 5 minutes with brisk walking',
  'Run for 1 minute, walk for 1.5 minutes, repeat for 20 minutes',
  'Cool down with 5 minutes of walking',
]);
assert.equal(intro.totalSeconds, 1800);
assert.equal(intro.stages.length, 18);
assert.equal(intro.stages[1].durationSeconds, 60);
assert.equal(intro.stages[2].durationSeconds, 90);
assert.equal(toSmartToolTimerStages(intro)[17].seconds, 300);
assert.equal(intro.startsRecordingAutomatically, false);
assert.equal(prepareWorkout(['Walk for a while', 'Run if you want']), null);
assert.equal(prepareWorkout([
  'Warm up for 5 minutes', 'Run for 1 minute, walk for 1.5 minutes, repeat for 19 minutes', 'Cool down for 5 minutes',
]), null);
console.log('PASS: 30-minute interval plan, staged timing, safe reject, user-controlled recording');
const alternate = prepareWorkout([
  'Warm up with an easy 5-minute walk',
  'Run 1 minute, walk 90 seconds; repeat 8 times',
  'Cool down with another 5-minute walk',
  'Record how you felt during the session',
]);
assert.ok(alternate, 'alternate phrasing should be supported without guessing');
assert.equal(alternate.totalSeconds, 1800);
assert.equal(alternate.stages.length, 18);
assert.equal(prepareWorkout([
  'Warm up with a 5-minute walk',
  'Run 1 minute, walk 90 seconds; repeat until tired',
  'Cool down with a 5-minute walk',
]), null, 'no open-ended repeated workout');
console.log('PASS: alternate 5K coach wording and ambiguous repetitions');
