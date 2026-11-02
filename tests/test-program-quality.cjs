const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const file = path.join(__dirname, '../supabase/functions/goal-coach/index.ts');
const source = fs.readFileSync(file, 'utf8');
const section = source.slice(source.indexOf('function programQualityIssues('), source.indexOf('const PROGRAM_PROMPT ='));
const output = ts.transpileModule(section + '\nexports.programQualityIssues = programQualityIssues;', {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
}).outputText;
const moduleObj = {exports: {}};
vm.runInNewContext(output, {module:moduleObj,exports:moduleObj.exports});
const issues = moduleObj.exports.programQualityIssues;
const oldPlan = {phases: [
  {title:'Begin Week 1 of Couch to 5K',description:'Kick off run/walk sessions.',moves:[{title:'Complete training session 1',steps:['Run 1 min'],minutes:30}]},
  {title:'Complete Week 1 and Assess Progress',description:'Evaluate results.',moves:[{title:'Complete training session 2',steps:['Run 1 min'],minutes:30}]},
  {title:'Begin Week 2',description:'Run again.',moves:[{title:'Complete training session 3',steps:['Run 1 min'],minutes:30}]},
  {title:'Complete my first 5K',description:'Finish 5K.',moves:[{title:'Run 5K when ready',steps:['Attempt when ready'],minutes:null}]},
]};
assert.ok(issues(oldPlan,'finite','run my first 5k').length >= 3, 'rejects administrative Week 1/2 milestones');
const strongPlan = {phases:[
 {title:'Build a comfortable run/walk foundation',description:'Reached when: the runner can complete consistent introductory sessions without concerning pain.',moves:[{title:'Complete run/walk session 1',steps:['Warm up 5 min','Run/walk 20 min','Cool down 5 min'],minutes:30}]},
 {title:'Run continuously with confidence',description:'Reached when: the runner can complete an appropriate sustained run with good recovery.',moves:[{title:'Start sustained running progression',steps:['Only when ready, start an appropriate session'],minutes:null}]},
 {title:'Build readiness for the full distance',description:'Reached when: the runner demonstrates comfortable endurance near their chosen 5K target.',moves:[{title:'Complete a readiness workout',steps:['Complete only if prepared'],minutes:null}]},
 {title:'Complete my first 5K',description:'Actual outcome, user confirmed.',moves:[{title:'Run an appropriate 5K when ready',steps:['Confirm outcome separately'],minutes:null}]},
]};
assert.equal(issues(strongPlan, 'finite','run my first 5k').length, 0);
console.log('PASS: rejects fake Week 1/2 milestone structure, accepts measurable journey and conditional 5K outcome');
