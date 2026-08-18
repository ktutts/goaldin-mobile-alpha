import {useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Alert,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {router,useLocalSearchParams} from 'expo-router';
import {supabase} from '@/lib/supabase';
import {buildPlan,evaluatePlan,optimizeBudget,SupportPlan} from '@/lib/smartPlan';

const G='#D8B24A',BG='#080808',C='#151515',T='#F4F1E8',M='#9C9A92';

export default function NutritionPlanV2(){
 const {goalId}=useLocalSearchParams<{goalId?:string}>(), linked=typeof goalId==='string'?goalId:null;
 const [plan,setPlan]=useState<SupportPlan>(buildPlan()),[planId,setPlanId]=useState<string|null>(null);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[tab,setTab]=useState<'today'|'plan'|'shop'|'prep'>('today'),[day,setDay]=useState(1),[open,setOpen]=useState<string|null>(null);

 useEffect(()=>{void load()},[linked]);
 async function load(){setLoading(true);try{
  const {data:{user}}=await supabase.auth.getUser(); if(!user)throw new Error('Please sign in again.');
  let q=supabase.from('goal_support_plans_v2').select('id,data').eq('user_id',user.id).eq('kind','nutrition').order('updated_at',{ascending:false}).limit(1);
  if(linked)q=q.eq('goal_id',linked); const {data,error}=await q;if(error)throw error;
  if(data?.[0]){setPlanId(data[0].id);setPlan(data[0].data)}
 }catch(e:any){Alert.alert('Plan setup',e?.message||'Could not load plan.')}finally{setLoading(false)}}
 async function save(next = plan) {
  setSaving(true);

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!user) throw new Error('Please sign in again.');

    const payload = {
      user_id: user.id,
      goal_id: linked,
      kind: 'nutrition',
      title: 'Nutrition + Shopping',
      data: next,
      updated_at: new Date().toISOString(),
    };

    console.log('Saving nutrition plan...', {
      planId,
      userId: user.id,
      linkedGoal: linked,
    });

    const saveRequest = planId
      ? supabase
          .from('goal_support_plans_v2')
          .update(payload)
          .eq('id', planId)
          .eq('user_id', user.id)
          .select('id')
          .single()
      : supabase
          .from('goal_support_plans_v2')
          .insert(payload)
          .select('id')
          .single();

    const timeout = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('Supabase save timed out after 10 seconds.')),
        10000
      )
    );

    const result: any = await Promise.race([saveRequest, timeout]);

    if (result?.error) throw result.error;

    if (!planId && result?.data?.id) {
      setPlanId(result.data.id);
    }

    console.log('Nutrition plan saved:', result?.data);

    Alert.alert(
      'Plan saved',
      'Meals, shopping progress and budget have been saved.'
    );
  } catch (e: any) {
    console.error('Nutrition save failed:', e);

    Alert.alert(
      'Could not save',
      e?.message || 'Something prevented the plan from saving.'
    );
  } finally {
    setSaving(false);
  }
}
 const intel=useMemo(()=>evaluatePlan(plan,day),[plan,day]), meals=plan.meals.filter(m=>m.day===day), current=plan.meals.find(m=>m.id===open)||null;
 const toggleMeal=(id:string)=>setPlan(p=>({...p,meals:p.meals.map(m=>m.id===id?{...m,done:!m.done}:m)}));
 const toggleItem=(id:string)=>setPlan(p=>({...p,shopping:p.shopping.map(x=>x.id===id?{...x,bought:!x.bought}:x)}));

 if(loading)return <View style={s.center}><ActivityIndicator color={G}/></View>;
 return <View style={s.page}><ScrollView contentContainerStyle={s.scroll}>
  <View style={s.top}><Pressable onPress={()=>router.back()}><Text style={s.back}>‹ BACK</Text></Pressable><Text style={s.brand}>GOAL'D IN</Text></View>
  <Text style={s.kicker}>PLAN · SHOP · PREPARE · ACHIEVE</Text><Text style={s.h1}>Nutrition that knows the next move.</Text>

  {tab==='today'&&<>
   <Card accent><View style={s.hero}><Ring value={intel.adherence}/><View style={{flex:1,marginLeft:18}}><Text style={s.goldmini}>TODAY</Text><Text style={s.big}>Stay on the plan without thinking about the whole day.</Text><Text style={s.muted}>Workout {plan.preferences.workout} · Work {plan.preferences.work}</Text></View></View></Card>
   {intel.next&&<Card><Text style={s.goldmini}>NEXT MOVE · {intel.next.time}</Text><Text style={s.title}>{intel.next.title}</Text><Text style={s.muted}>{intel.next.subtitle}</Text><View style={s.macros}><Macro l="PROTEIN" v={intel.next.protein}/><Macro l="CARB" v={intel.next.carb}/><Macro l="FAT" v={intel.next.fat}/></View><Text style={s.cost}>EST. ${intel.next.cost.toFixed(2)}</Text><Pressable style={s.primary} onPress={()=>setOpen(intel.next!.id)}><Text style={s.primaryText}>VIEW NEXT MOVE</Text></Pressable></Card>}
   {intel.blocked&&<Card><Text style={s.goldmini}>FRICTION FOUND</Text><Text style={s.big}>{intel.blocked}</Text><Pressable style={s.secondary} onPress={()=>setTab('shop')}><Text style={s.secondaryText}>OPEN SHOPPING LIST</Text></Pressable></Card>}
   <Text style={s.section}>TODAY'S PLAN</Text>{meals.map(m=><Meal key={m.id} m={m} open={()=>setOpen(m.id)} toggle={()=>toggleMeal(m.id)}/>)}
  </>}

  {tab==='plan'&&<><Text style={s.section}>7-DAY PLAN</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={s.days}>{[1,2,3,4,5,6,7].map(d=><Pressable key={d} onPress={()=>setDay(d)} style={[s.day,d===day&&s.dayOn]}><Text style={[s.dayText,d===day&&s.dayTextOn]}>D{d}</Text></Pressable>)}</View></ScrollView>{meals.map(m=><Meal key={m.id} m={m} open={()=>setOpen(m.id)} toggle={()=>toggleMeal(m.id)}/>)}</>}

  {tab==='shop'&&<>
   <Card accent><Text style={s.goldmini}>WEEKLY BUDGET</Text><View style={s.budget}><Text style={s.dollar}>$</Text><TextInput value={String(plan.budget)} keyboardType="decimal-pad" onChangeText={v=>setPlan(p=>({...p,budget:Number(v.replace(/[^0-9.]/g,''))||0}))} style={s.budgetInput}/></View>
   <View style={s.totals}><View><Text style={s.mini}>ESTIMATED</Text><Text style={s.total}>${intel.total.toFixed(2)}</Text></View><View style={{alignItems:'flex-end'}}><Text style={s.mini}>{intel.over?'OVER':'REMAINING'}</Text><Text style={[s.total,{color:intel.over?'#FF8F80':'#78CE8A'}]}>${Math.abs(intel.remaining).toFixed(2)}</Text></View></View>
   {intel.over&&<Pressable style={s.primary} onPress={()=>{const n=optimizeBudget(plan);setPlan(n);void save(n)}}><Text style={s.primaryText}>OPTIMIZE TO BUDGET</Text></Pressable>}</Card>
   {intel.savings.length>0&&<><Text style={s.section}>SMART SAVINGS</Text>{intel.savings.map(x=><Card key={x.id}><Text style={s.big}>{x.label}</Text><Text style={s.save}>SAVE ${x.save.toFixed(2)}</Text></Card>)}</>}
   <Text style={s.section}>GROCERY LIST · {intel.bought}/{plan.shopping.length}</Text>{plan.shopping.map(x=><Card key={x.id}><View style={s.row}><Pressable onPress={()=>toggleItem(x.id)} style={[s.check,x.bought&&s.checkOn]}><Text>{x.bought?'✓':''}</Text></Pressable><View style={{flex:1,marginLeft:12}}><Text style={s.big}>{x.name}</Text><Text style={s.muted}>{x.qty} · {x.cat}</Text></View><Text style={s.price}>${x.price.toFixed(2)}</Text></View></Card>)}
  </>}

  {tab==='prep'&&<><Text style={s.section}>MEAL PREP</Text><Card><Text style={s.title}>Prep once. Remove decisions all week.</Text>{['Roast potatoes and sweet potatoes.','Cook chicken thighs.','Brown ground beef.','Slow-cook pork shoulder or chuck roast.','Roast vegetables.','Boil eggs.','Portion work meals the night before.'].map((x,i)=><Text key={x} style={s.prep}>0{i+1}  {x}</Text>)}</Card><Text style={s.section}>PREFERENCES</Text><Card><Pref a="Carbs" b="Grain-free"/><Pref a="Protein" b="Whole-food animal protein"/><Pref a="Fats" b="EVOO, avocado, natural animal fats"/><Pref a="Main meal protein" b="30–35 g"/><Pref a="Workout" b={plan.preferences.workout}/><Pref a="Work" b={plan.preferences.work}/></Card></>}

  <View style={s.nav}>{[['today','TODAY'],['plan','PLAN'],['shop','SHOP'],['prep','PREP']].map(([k,l])=><Pressable key={k} onPress={()=>setTab(k as any)} style={s.navItem}><View style={[s.dot,tab===k&&s.dotOn]}/><Text style={[s.navText,tab===k&&s.navOn]}>{l}</Text></Pressable>)}</View>
  <Pressable style={s.secondary} onPress={()=>void save()}><Text style={s.secondaryText}>{saving?'SAVING…':'SAVE CHANGES'}</Text></Pressable>
  <Text style={s.disclaimer}>GOAL'D IN organizes the plan you choose and does not override clinician instructions.</Text>
 </ScrollView>
 {current&&<View style={s.overlay}><Pressable style={{flex:1}} onPress={()=>setOpen(null)}/><View style={s.sheet}><View style={s.handle}/><Text style={s.goldmini}>{current.time} · MEAL DETAILS</Text><Text style={s.sheetTitle}>{current.title}</Text><View style={s.macros}><Macro l="PROTEIN" v={current.protein}/><Macro l="CARB" v={current.carb}/><Macro l="FAT" v={current.fat}/></View><Text style={s.section}>YOU NEED</Text>{current.ingredients.map(x=><Text key={x} style={s.line}>✓  {x}</Text>)}<Text style={s.section}>PREP</Text>{current.prep.map((x,i)=><Text key={i} style={s.line}>{i+1}. {x}</Text>)}<Pressable style={s.primary} onPress={()=>{toggleMeal(current.id);setOpen(null)}}><Text style={s.primaryText}>MARK MEAL COMPLETE</Text></Pressable></View></View>}
 </View>
}
function Card({children,accent=false}:{children:any,accent?:boolean}){return <View style={[s.card,accent&&s.cardAccent]}>{children}</View>}
function Ring({value}:{value:number}){return <View style={s.ring}><Text style={s.ringVal}>{value}%</Text><Text style={s.ringLab}>GOAL'D IN</Text></View>}
function Macro({l,v}:{l:string,v:string}){return <View style={s.macro}><Text style={s.macroVal}>{v}</Text><Text style={s.macroLab}>{l}</Text></View>}
function Meal({m,open,toggle}:any){return <Pressable onPress={open}><Card><View style={s.row}><View style={{flex:1}}><Text style={s.goldmini}>{m.time}</Text><Text style={s.big}>{m.title}</Text><Text style={s.muted}>{m.subtitle}</Text></View><Pressable onPress={toggle} style={[s.check,m.done&&s.checkOn]}><Text>{m.done?'✓':''}</Text></Pressable></View></Card></Pressable>}
function Pref({a,b}:{a:string,b:string}){return <View style={s.pref}><Text style={s.muted}>{a}</Text><Text style={s.prefVal}>{b}</Text></View>}
const s=StyleSheet.create({
 page:{flex:1,backgroundColor:BG},center:{flex:1,backgroundColor:BG,alignItems:'center',justifyContent:'center'},scroll:{padding:20,paddingBottom:60},top:{flexDirection:'row',justifyContent:'space-between',marginTop:8},back:{color:M,fontWeight:'900'},brand:{color:G,fontWeight:'900',letterSpacing:2},kicker:{color:G,fontSize:11,fontWeight:'900',letterSpacing:1.4,marginTop:28},h1:{color:T,fontSize:31,lineHeight:36,fontWeight:'900',marginTop:8,marginBottom:8},card:{backgroundColor:C,borderWidth:1,borderColor:'#292929',borderRadius:22,padding:18,marginTop:10},cardAccent:{backgroundColor:'#121009',borderColor:'#705A20'},hero:{flexDirection:'row',alignItems:'center'},ring:{width:104,height:104,borderRadius:52,borderWidth:9,borderColor:G,alignItems:'center',justifyContent:'center'},ringVal:{color:T,fontSize:25,fontWeight:'900'},ringLab:{color:G,fontSize:8,fontWeight:'900',letterSpacing:1},goldmini:{color:G,fontSize:10,fontWeight:'900',letterSpacing:1.1},title:{color:T,fontSize:23,fontWeight:'900',marginTop:5},big:{color:T,fontSize:16,fontWeight:'900',marginTop:4},muted:{color:M,fontSize:13,lineHeight:19,marginTop:4},macros:{flexDirection:'row',gap:8,marginTop:14},macro:{flex:1,backgroundColor:'#1D1D1D',borderRadius:13,padding:10,alignItems:'center'},macroVal:{color:T,fontSize:11,fontWeight:'900',textAlign:'center'},macroLab:{color:M,fontSize:8,fontWeight:'900',marginTop:4},cost:{color:G,fontWeight:'900',marginTop:14},primary:{backgroundColor:G,borderRadius:15,paddingVertical:14,alignItems:'center',marginTop:15},primaryText:{color:'#080808',fontWeight:'900',fontSize:11,letterSpacing:1},secondary:{borderWidth:1,borderColor:'#4B4122',borderRadius:15,paddingVertical:13,alignItems:'center',marginTop:13},secondaryText:{color:G,fontWeight:'900',fontSize:10,letterSpacing:1},section:{color:T,fontSize:14,fontWeight:'900',letterSpacing:1,marginTop:24,marginBottom:10},row:{flexDirection:'row',alignItems:'flex-start'},check:{width:31,height:31,borderRadius:10,borderWidth:1,borderColor:'#555',alignItems:'center',justifyContent:'center'},checkOn:{backgroundColor:'#78CE8A',borderColor:'#78CE8A'},days:{flexDirection:'row',gap:8,marginBottom:10},day:{width:48,height:42,borderRadius:14,borderWidth:1,borderColor:'#333',alignItems:'center',justifyContent:'center'},dayOn:{backgroundColor:G,borderColor:G},dayText:{color:M,fontWeight:'900'},dayTextOn:{color:'#080808'},budget:{flexDirection:'row',alignItems:'center'},dollar:{color:G,fontSize:28,fontWeight:'900'},budgetInput:{flex:1,color:T,fontSize:29,fontWeight:'900',borderBottomWidth:1,borderBottomColor:'#4B4122'},totals:{flexDirection:'row',justifyContent:'space-between',marginTop:18},mini:{color:M,fontSize:9,fontWeight:'900'},total:{color:G,fontSize:25,fontWeight:'900',marginTop:3},save:{color:'#78CE8A',fontWeight:'900',marginTop:8},price:{color:G,fontWeight:'900'},prep:{color:T,fontSize:14,lineHeight:22,marginTop:10},pref:{flexDirection:'row',justifyContent:'space-between',paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#252525'},prefVal:{color:T,fontSize:12,fontWeight:'800',maxWidth:'62%',textAlign:'right'},nav:{flexDirection:'row',backgroundColor:'#111',borderRadius:18,borderWidth:1,borderColor:'#292929',marginTop:22,padding:8},navItem:{flex:1,alignItems:'center',paddingVertical:7},dot:{width:6,height:6,borderRadius:3,backgroundColor:'#444',marginBottom:5},dotOn:{backgroundColor:G},navText:{color:M,fontSize:9,fontWeight:'900'},navOn:{color:G},disclaimer:{color:'#666',fontSize:10,lineHeight:15,textAlign:'center',marginTop:14},overlay:{...StyleSheet.absoluteFillObject,justifyContent:'flex-end',backgroundColor:'rgba(0,0,0,.72)'},sheet:{backgroundColor:'#111',borderTopLeftRadius:28,borderTopRightRadius:28,borderWidth:1,borderColor:'#333',padding:22,paddingBottom:34,maxHeight:'84%'},handle:{width:48,height:5,borderRadius:3,backgroundColor:'#444',alignSelf:'center',marginBottom:18},sheetTitle:{color:T,fontSize:26,fontWeight:'900',marginTop:5},line:{color:T,fontSize:13,lineHeight:22}
});