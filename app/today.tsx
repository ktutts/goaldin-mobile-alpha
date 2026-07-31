import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import GoalCard from '@/components/GoalCard';
import { supabase } from '@/lib/supabase';
import { Action, Goal } from '@/types/models';

export default function Today(){
 const [goals,setGoals]=useState<Goal[]>([]),[actions,setActions]=useState<Action[]>([]),[loading,setLoading]=useState(true);
 const load=useCallback(async()=>{setLoading(true); const {data:{user}}=await supabase.auth.getUser(); if(!user){router.replace('/');return;} const [g,a]=await Promise.all([supabase.from('goals').select('*').eq('user_id',user.id).order('created_at',{ascending:false}),supabase.from('actions').select('*').eq('user_id',user.id).order('sort_order')]); setGoals((g.data||[]) as Goal[]); setActions((a.data||[]) as Action[]); setLoading(false);},[]);
 useEffect(()=>{load()},[load]);
 async function done(a:Action){await supabase.from('actions').update({status:'done',completed_at:new Date().toISOString()}).eq('id',a.id); await supabase.from('events').insert({user_id:a.user_id,event_type:'action_completed',object_id:a.id,metadata:{goal_id:a.goal_id}}); const remaining=actions.filter(x=>x.goal_id===a.goal_id&&x.status==='todo'&&x.id!==a.id); if(remaining.length===0){const goal=goals.find(g=>g.id===a.goal_id); if(goal){await supabase.from('goals').update({status:'completed'}).eq('id',goal.id); await supabase.from('wins').insert({user_id:a.user_id,goal_id:goal.id,title:goal.title,summary:'Completed in GOAL\'D IN'});}} await load();}
 if(loading)return <View style={s.center}><ActivityIndicator color="#D8B24A"/></View>;
 const completed=actions.filter(a=>a.status==='done').length;
 return <View style={s.page}><ScrollView contentContainerStyle={s.scroll}><Text style={s.brand}>GOAL'D IN</Text><Text style={s.h1}>Today</Text><Text style={s.sub}>{completed} moves completed</Text>
 <Pressable style={s.primary} onPress={()=>router.push('/goal-it')}><Text style={s.primaryText}>+ WHAT'S YOUR MOVE?</Text></Pressable>
 {goals.filter(g=>g.status==='active').map(g=><GoalCard key={g.id} goal={g} actions={actions.filter(a=>a.goal_id===g.id)} onDone={done}/>)}
 {!goals.some(g=>g.status==='active')&&<View style={s.empty}><Text style={s.emptyTitle}>No active goals.</Text><Text style={s.emptyCopy}>Pick something worth getting done.</Text></View>}
 </ScrollView><Nav/></View>
}
function Nav(){return <View style={s.nav}><Pressable onPress={()=>router.replace('/today')}><Text style={s.navOn}>TODAY</Text></Pressable><Pressable onPress={()=>router.push('/discover')}><Text style={s.navOff}>DISCOVER</Text></Pressable><Pressable onPress={()=>router.push('/wins')}><Text style={s.navOff}>WINS</Text></Pressable><Pressable onPress={()=>router.push('/you')}><Text style={s.navOff}>YOU</Text></Pressable></View>}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#090909'},scroll:{padding:22,paddingTop:60,paddingBottom:110},brand:{color:'#D8B24A',letterSpacing:3,fontWeight:'900'},h1:{color:'#fff',fontSize:42,fontWeight:'900',marginTop:8},sub:{color:'#888',marginBottom:20},primary:{backgroundColor:'#D8B24A',padding:16,borderRadius:16,alignItems:'center',marginBottom:20},primaryText:{fontWeight:'900',color:'#090909'},empty:{padding:22,backgroundColor:'#151515',borderRadius:18},emptyTitle:{color:'#fff',fontWeight:'800',fontSize:20},emptyCopy:{color:'#999',marginTop:6},nav:{position:'absolute',left:0,right:0,bottom:0,height:82,backgroundColor:'#111',borderTopWidth:1,borderTopColor:'#222',flexDirection:'row',alignItems:'center',justifyContent:'space-around',paddingBottom:12},navOn:{color:'#D8B24A',fontWeight:'900',fontSize:12},navOff:{color:'#777',fontWeight:'800',fontSize:12},center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#090909'}});
