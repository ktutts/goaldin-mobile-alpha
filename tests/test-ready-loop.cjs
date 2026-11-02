const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

const source = fs.readFileSync(path.join(root, 'lib/nextMoveReadiness.ts'), 'utf8');
const out = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
if (out.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error)) throw new Error('typescript transpilation error');

function createHarness({pending=false, completed=true, blocker=false, approved=true, coachResult=null}={}) {
 const goal = {id:'goalA',user_id:'userA',title:'Learn guitar', status:'active', is_practice:false};
 const milestone = {id:'stageA',user_id:'userA',goal_id:'goalA',title:'Play a full song',description:'Reached when: perform a complete song',status:'active',position:0};
 const actions = completed ? [{id:'act1',goal_id:'goalA',milestone_id:'stageA',user_id:'userA',status:'completed',title:'Practice C to G transitions',position:0, completed_at:new Date().toISOString()}] : [];
 if (pending) actions.push({id:'nextExisting',goal_id:'goalA',milestone_id:'stageA',user_id:'userA',status:'pending',title:'Next action',position:1});
 const progress = blocker ? [{user_id:'userA',goal_id:'goalA',entry_type:'blocker',content:'Injured wrist',created_at:new Date().toISOString()}] : [];
 const events = [{event_type:'goal_created',object_id:'goalA',user_id:'userA',created_at:new Date().toISOString(),metadata:{when_context:{auto_prepare_routine:approved}}}];
 const calls = {invoke:0,inserts:0,prepared:0};
 function builder(table){
  let items = table==='goals'?[goal]:table==='milestones'?[milestone]:table==='actions'?actions:table==='progress_entries'?progress:events;
  const state={clauses:[],sort:null,ascending:true,limit:null};
  const filtered = () => {let result=items.filter(r=>state.clauses.every(([key,val,neg])=>neg?val.includes(r[key]):r[key]===val));if(state.sort)result=[...result].sort((a,b)=>state.ascending?(a[state.sort]>b[state.sort]?1:-1):(a[state.sort]<b[state.sort]?1:-1));return state.limit!==null?result.slice(0,state.limit):result;};
  const q={
   select(){return q}, eq(k,v){state.clauses.push([k,v,false]);return q},
   in(k,vals){state.clauses.push([k,vals,true]);return q},
   order(k,o={}){state.sort=k;state.ascending=o.ascending!==false;return q},
   limit(n){state.limit=n;return q},
   maybeSingle(){return Promise.resolve({data:filtered()[0]??null,error:null})},
   single(){return Promise.resolve({data:filtered()[0]??null,error:null})},
   then(resolve,reject){return Promise.resolve({data:filtered(),error:null}).then(resolve,reject)},
   insert(value){
     if(table==='actions') {calls.inserts++; const row={...value,id:'generated'+calls.inserts};actions.push(row);return { select(){return {single:async()=>({data:row,error:null})}}};}
     events.push(value);return {then(resolve,reject){return Promise.resolve({error:null}).then(resolve,reject)}};
   },
  };return q;
 }
 const supabase={auth:{getUser:async()=>({data:{user:{id:'userA'}},error:null})},from:builder,
 functions:{invoke:async()=>{calls.invoke++;return {data: coachResult??{
  routineReady:true, milestoneReached:false,
  proposedMove:{title:'Practice song verse, session 2',steps:['Tune guitar','Practice the first verse slowly'],minutes:15}},error:null}}}};
 const mockStorage={getItem:async(key)=>key.startsWith('goaldin-auto-prepare-') ? String(approved) : null};
 const sandbox={exports:{},require(n){if(n==='@/lib/supabase')return {supabase};if(n==='@react-native-async-storage/async-storage')return {default:mockStorage};if(n==='@/lib/workoutLaunch')return {prepareNextMoveLaunch:async()=>{calls.prepared++;return null}};throw Error('Unexpected import '+n)},console,Date,Map,Math,Number,String,Array,Promise,RegExp,setTimeout};
 vm.runInNewContext(out.outputText,sandbox,{filename:'nextMoveReadiness.ts'});
 return {ensure:sandbox.exports.ensureNextMoveReady,calls,actions,goal,milestone};
}
(async()=>{
 let h=createHarness({pending:true});let r=await h.ensure('goalA');assert.equal(r.state,'ready');assert.equal(h.calls.invoke,0);assert.equal(h.calls.inserts,0);
 h=createHarness({completed:false});r=await h.ensure('goalA');assert.equal(r.state,'no_completed_work');assert.equal(h.calls.invoke,0);
 h=createHarness({approved:false});r=await h.ensure('goalA');assert.equal(r.state,'needs_review');assert.equal(h.calls.invoke,0);
 h=createHarness({blocker:true});r=await h.ensure('goalA');assert.equal(r.state,'needs_review');assert.equal(h.calls.invoke,0);
 h=createHarness({coachResult:{routineReady:false,proposedMove:{title:'Do something',steps:['Go']}}});r=await h.ensure('goalA');assert.equal(r.state,'review_milestone');assert.equal(h.calls.inserts,0);
 h=createHarness({coachResult:{milestoneReached:true,message:'Review your milestone'}});r=await h.ensure('goalA');assert.equal(r.state,'review_milestone');assert.equal(h.calls.inserts,0);
 h=createHarness();const [r1,r2]=await Promise.all([h.ensure('goalA'),h.ensure('goalA')]);assert.equal(r1.state,'review_milestone');assert.equal(r2.state,'review_milestone');assert.equal(h.calls.inserts,0);assert.equal(h.calls.invoke,0);
 console.log('PASS: initial goal, pending action, blocker, server consent, milestone review, and review-first routine protection');
})().catch(e=>{console.error(e);process.exitCode=1});
