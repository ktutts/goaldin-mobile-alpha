import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Goal, Action } from '@/types/models';

export default function GoalCard({ goal, actions, onDone }: { goal: Goal; actions: Action[]; onDone: (a: Action) => void }) {
  const completed = actions.filter((a) => a.status === 'completed').length;
  const total = actions.length || 1;
  const next = actions.find((a) => a.status === 'pending');
  const progress = Math.round((completed / total) * 100);

  return (
    <View style={s.card}>
      <Pressable onPress={() => router.push(`/goal/${goal.id}`)}>
        <View style={s.row}>
          <Text style={s.title}>{goal.title}</Text>
          <Text style={s.progress}>{progress}%</Text>
        </View>
        <View style={s.track}>
          <View style={[s.fill, { width: `${progress}%` }]} />
        </View>
        {next ? (
          <>
            <Text style={s.label}>NEXT MOVE</Text>
            <Text style={s.next}>{next.title}{next.estimated_minutes ? ` · ${next.estimated_minutes} min` : ''}</Text>
          </>
        ) : (
          <Text style={s.complete}>GOAL'D IN ✓</Text>
        )}
      </Pressable>
      {next ? (
        <Pressable style={s.button} onPress={(event) => {
          event.stopPropagation();
          onDone(next);
        }}>
          <Text style={s.buttonText}>DONE ✓</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card:{backgroundColor:'#171717',borderRadius:20,padding:18,marginBottom:14,borderWidth:1,borderColor:'#262626'},
  row:{flexDirection:'row',justifyContent:'space-between',gap:12}, title:{color:'#fff',fontSize:20,fontWeight:'800',flex:1},
  progress:{color:'#D8B24A',fontWeight:'900'}, track:{height:7,backgroundColor:'#333',borderRadius:99,marginVertical:14,overflow:'hidden'},
  fill:{height:'100%',backgroundColor:'#D8B24A'}, label:{fontSize:11,letterSpacing:1.5,color:'#888',fontWeight:'800'}, next:{color:'#fff',fontSize:16,marginTop:6,marginBottom:14},
  button:{backgroundColor:'#D8B24A',padding:14,borderRadius:14,alignItems:'center',marginTop:4}, buttonText:{fontWeight:'900',color:'#0a0a0a'}, complete:{color:'#D8B24A',fontSize:18,fontWeight:'900'}
});
