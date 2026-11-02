const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const today=fs.readFileSync('app/today.tsx','utf8');
const resources=fs.readFileSync('components/GoalSmartResources.tsx','utf8');
const readiness=fs.readFileSync('lib/nextMoveReadiness.ts','utf8');
assert.match(today,/CHOOSE A NEXT MOVE/);
assert.match(today,/setShowGoalPicker\(true\)/);
assert.match(today,/YOUR GOALS ·/);
assert.match(today,/const otherGoals = goalData;/);
assert.match(today,/OPEN JOURNEY ↗/);
assert.match(today,/ADD TO TODAY \+/);
assert.doesNotMatch(today,/ensureNextMoveReady/);
assert.match(resources,/SAVED TO THIS GOAL/);
assert.match(resources,/AsyncStorage\.setItem/);
assert.match(resources,/manufacturer service manual procedure/);
assert.match(resources,/YOUTUBE MUSIC/);
assert.match(readiness,/Review this milestone before preparing another Move/);
for(const file of ['app/today.tsx','components/GoalSmartResources.tsx','lib/nextMoveReadiness.ts']) {
 const src=fs.readFileSync(file,'utf8');const ast=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 assert.equal(ast.parseDiagnostics.length,0,`${file} parse`);
}
console.log('PASS: TODAY picker, active goals, resource saving, and milestone review-first protection');
