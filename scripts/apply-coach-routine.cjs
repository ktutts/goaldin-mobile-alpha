/* Targeted GOAL'D IN Coach patch. No live deploy and no router changes. */
const fs = require('node:fs');
const path = require('node:path');
const target = path.join(process.cwd(),'supabase','functions','goal-coach','index.ts');
if (!fs.existsSync(target)) throw new Error('Missing goal-coach/index.ts. No change made.');
const original = fs.readFileSync(target,'utf8');
if (original.includes('routineReady: request.routineApproved === true')) {
  console.log('Routine Coach handoff is already installed.');process.exit(0);
}
function replaceOnce(s, oldText, newText) {
  const count = s.split(oldText).length - 1;
  if(count !== 1) throw Error(`No changes made: expected one matching Coach section, found ${count}.`);
  return s.replace(oldText,newText);
}
try {
 let s = original;
 s = replaceOnce(s,
  'The user must approve the action. Heart-rate connection and timer/recording start require explicit user action.',
  `\${request.routineApproved === true ? 'This person has opted into automatic preparation of routine Next Moves WITHIN their already approved, active milestone. Suggest a safe, straightforward next session only; never advance a milestone, change schedule, start an activity, purchase equipment, make a consequential decision, or bypass unresolved symptoms. Return milestoneReached:true for achievement evidence instead of inventing filler. Anything beyond that scope needs personal review.' : 'The user must approve the action.'} Heart-rate connection and timer/recording start require explicit user action.`
 );
 s = replaceOnce(s,
  "proposedMove: {title, steps, minutes}}), {status: 200, headers: {'Content-Type': 'application/json'}});",
  "proposedMove: {title, steps, minutes}, routineReady: request.routineApproved === true}), {status: 200, headers: {'Content-Type': 'application/json'}});"
 );
 const backup = target+'.before-ready-loop';
 fs.writeFileSync(backup,original,{flag:'wx'});
 fs.writeFileSync(target,s);
 console.log('Updated local goal-coach continuation mode only. Recent program-quality fixes and diagnostics preserved.');
 console.log('Before deploying, run TypeScript and review the diff. Backup:', backup);
} catch (e) { console.error(e.message);process.exitCode=1; }
