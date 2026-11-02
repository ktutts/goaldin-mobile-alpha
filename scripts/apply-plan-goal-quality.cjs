/* Optional: apply only to matching local plan-goal source, never to live dashboard. */
const fs = require('node:fs');
const path = require('node:path');
const target = path.join(process.cwd(), 'supabase', 'functions', 'plan-goal', 'index.ts');
if (!fs.existsSync(target)) throw new Error('plan-goal source was not found. No change made.');
const original = fs.readFileSync(target, 'utf8');
if (original.includes('GOALDIN-REAL-MILESTONES-V1')) {
  console.log('plan-goal quality rules already present.'); process.exit(0);
}
const needle='- Every milestone MUST contain a nextMove.';
const count=original.split(needle).length-1;
if (count!==1) throw new Error(`Expected one milestone-rule anchor; found ${count}. No change made.`);
let s=original.replace(needle, `GOALDIN-REAL-MILESTONES-V1:
- Milestones are EARNED CAPABILITIES or tangible accomplishments, not week numbers, a checklist count or one session.
- Every milestone description starts with "Reached when:" followed by a safe, observable achievement. Do not require literal absence of every symptom to acknowledge progress.
- A multiweek goal should preserve realistic progression between its starting ability and final outcome. For Couch-to-5K, model gradual run/walk training and rest, not Week 1 followed by the final race.
- The nextMove within each milestone is the FIRST practical session or decision inside it, NOT the entire milestone or a vague task to plan the week.
- Goal creation should schedule only the person's chosen WHEN commitments. Subsequent routine sessions are prepared as previous sessions complete, without adding dates, reminders or new milestones on their behalf.
- Where experience, safety or available days materially affects feasibility, ask ONE useful question or offer a conservative initial assessment rather than inventing readiness.
- The user confirms milestone achievement and separately confirms the actual final outcome.
${needle}`);
const example='"description": "What completing this stage accomplishes"';
if (s.includes(example)) s=s.replace(example, '"description": "Reached when: the user has demonstrated a concrete, safe, observable achievement."');
const backup=target+'.before-real-milestones';
fs.writeFileSync(backup, original, {flag:'wx'});
fs.writeFileSync(target, s);
console.log('Updated local plan-goal prompt. Review diff and test before deploying the live function.');
console.log(`Backup: ${backup}`);
