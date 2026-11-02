const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

const source = fs.readFileSync(path.join(root, 'lib/milestoneReview.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022} });
assert.equal(js.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length ?? 0, 0);
const sandbox = {exports: {}};
vm.runInNewContext(js.outputText, sandbox, {filename: 'milestoneReview.ts'});
const ready = sandbox.exports.isMilestoneReadyForReview;
const active = {id: 'guitar-stage', status: 'active'};
const a = (status, id = 'guitar-stage') => ({milestone_id: id, status});
assert.equal(ready(active, []), false, 'No activity is not an achieved milestone');
assert.equal(ready(active, [a('pending')]), false, 'A pending move blocks review');
assert.equal(ready(active, [a('completed'), a('pending')]), false, 'One completed move cannot finish two planned moves');
assert.equal(ready(active, [a('completed'), a('in_progress')]), false, 'An unfinished action blocks review');
assert.equal(ready(active, [a('completed'), a('completed')]), true, 'All saved actions completed invites a review');
assert.equal(ready(active, [a('completed'), a('pending', 'other-stage')]), true, 'Future stage does not block this review');
assert.equal(ready({...active, status:'completed'}, [a('completed')]), false, 'Already confirmed is not reviewable');
assert.equal(ready({...active, status:'pending'}, [a('completed')]), false, 'Future milestone is not reviewable');

const screen = fs.readFileSync(path.join(root, 'app/goal/[id].tsx'), 'utf8');
const workspace = fs.readFileSync(path.join(root, 'app/goal/milestone/[milestoneId].tsx'), 'utf8');
assert.match(screen, /const readyToReviewMilestone = milestones\.find/);
assert.match(screen, /const isReadyToConfirm = milestone\.id === readyToReviewMilestone\?\.id/);
assert.match(screen, /onPress=\{\(\) => requestMilestoneReview\(readyToReviewMilestone\)\}/);
assert.match(screen, /Not yet'[\s\S]*setReviewDeferredMilestoneId\(milestone\.id\)/);
assert.match(screen, /onPress=\{\(\) => void askCoachForContinuation\(\)\}/);
assert.match(screen, /await confirmMilestone\(milestone\.id\)/);
assert.match(screen, /MOVE COMPLETE ✓/);
assert.match(screen, /COMPLETE MOVE ✓/);
assert.doesNotMatch(screen, /git grep -n -e/);
assert.doesNotMatch(screen, /if \(!goalComplete\) void suggestNextMilestones\(\)/);
assert.match(workspace, /<Text style=\{s\.label\}>CURRENT MOVE<\/Text>/);
for (const file of ['app/goal/[id].tsx', 'app/goal/milestone/[milestoneId].tsx']) {
  const contents = fs.readFileSync(path.join(root, file), 'utf8');
  const ast = ts.createSourceFile(file, contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0, `${file} should parse as TSX`);
}
console.log('PASS: milestone review eligibility, Not yet continuation, shared review action, user confirmation, and honest Move labels');
