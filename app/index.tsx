import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function Index(){
  const [loading,setLoading]=useState(true); const [email,setEmail]=useState(''); const [password,setPassword]=useState('');
  useEffect(()=>{ supabase.auth.getSession().then(({data})=>{ if(data.session) router.replace('/today'); setLoading(false); });
    const {data:sub}=supabase.auth.onAuthStateChange((_e,session)=>{ if(session) router.replace('/today'); }); return()=>sub.subscription.unsubscribe(); },[]);
  async function signIn(){ if(!email.trim()||!password) return; setLoading(true); const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password}); setLoading(false); if(error) Alert.alert('Sign in failed',error.message); }
  async function signUp(){ if(!email.trim()||password.length<6){Alert.alert('Create account','Enter an email and a password of at least 6 characters.');return;} setLoading(true); const {data,error}=await supabase.auth.signUp({email:email.trim(),password}); setLoading(false); if(error) Alert.alert('Could not create account',error.message); else if(!data.session) Alert.alert('Check your email','Supabase is set to require email confirmation. Confirm your address, then sign in.'); }
  if(loading) return <View style={s.center}><ActivityIndicator color="#D8B24A"/></View>;
  return <View style={s.page}><Text style={s.brand}>GOAL'D IN</Text><Text style={s.hero}>What would make today a win?</Text><Text style={s.copy}>Your goals, actions and wins stay synced to your account.</Text>
    <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor="#666" keyboardType="email-address" autoCapitalize="none" style={s.input}/>
    <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor="#666" secureTextEntry style={s.input}/>
    <Pressable style={s.button} onPress={signIn}><Text style={s.buttonText}>SIGN IN →</Text></Pressable>
    <Pressable style={s.secondary} onPress={signUp}><Text style={s.secondaryText}>CREATE ACCOUNT</Text></Pressable>
  </View>
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#090909',padding:24,justifyContent:'center'},center:{flex:1,backgroundColor:'#090909',alignItems:'center',justifyContent:'center'},brand:{color:'#D8B24A',letterSpacing:3,fontWeight:'900',fontSize:15},hero:{color:'#fff',fontWeight:'900',fontSize:42,lineHeight:44,marginTop:14},copy:{color:'#aaa',fontSize:16,lineHeight:23,marginVertical:24},input:{backgroundColor:'#171717',borderWidth:1,borderColor:'#2b2b2b',color:'#fff',padding:16,borderRadius:14,fontSize:16,marginBottom:10},button:{backgroundColor:'#D8B24A',padding:17,borderRadius:14,alignItems:'center'},buttonText:{color:'#0a0a0a',fontWeight:'900',fontSize:16},secondary:{padding:16,borderRadius:14,alignItems:'center',borderWidth:1,borderColor:'#333',marginTop:10},secondaryText:{color:'#fff',fontWeight:'900'}});
