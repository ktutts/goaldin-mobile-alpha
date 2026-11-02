import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import {
  DietStyle, DietaryRule, DietGuide, DIET_GUIDES, Ingredient, Meal, STYLE_LABEL, RULE_LABEL, RULE_NOTE, SupportPlan, availableRecipeCount, ingredientMatchesRules, mealMatchesRules, dietaryPrepNotes,
  buildPlan, dateKey, dayLabel, dayOfPlan, evaluatePlan, fmt12, mealCalories, mealCost,
  mealsForDay, normalizePlan, affordableMealOptions, mealSwapOptions, replacePlannedMeal, replaceShoppingIngredient, MealSwapMode, shoppingList, stepTime, toMin, uid,
} from '@/lib/smartPlan';

const G = '#D8B24A', BG = '#080808', C = '#151515', T = '#F4F1E8', M = '#9C9A92';
const TABLE = 'goal_support_plans_v2';
type Tab = 'today' | 'plan' | 'shop' | 'prep';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function NutritionPlanV2() {
  const { goalId } = useLocalSearchParams<{ goalId?: string }>();
  const linked = typeof goalId === 'string' ? goalId : null;

  const [plan, setPlan] = useState<SupportPlan>(() => buildPlan());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('today');
  const [day, setDay] = useState(1); // day being viewed/edited in the Plan tab
  const [openId, setOpenId] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveState>('idle');
  const [now, setNow] = useState(new Date());
  const [newTask, setNewTask] = useState('');
  const [dietOpen, setDietOpen] = useState(false);
  const [swapMealId, setSwapMealId] = useState<string | null>(null);
  const [swapMode, setSwapMode] = useState<MealSwapMode>('different');
  const [shopSwapKey, setShopSwapKey] = useState<string | null>(null);
  const [undoPlan, setUndoPlan] = useState<SupportPlan | null>(null);

  const planRef = useRef(plan);
  const planIdRef = useRef<string | null>(null);
  const linkedRef = useRef(linked);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  linkedRef.current = linked;

  /* ---------- clock ---------- */
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayKey = dateKey(now);
  const todayDay = dayOfPlan(plan.startDate, todayKey);

  /* ---------- load ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Please sign in again.');
        let q = supabase.from(TABLE).select('id,data').eq('user_id', user.id).eq('kind', 'nutrition').order('updated_at', { ascending: false }).limit(1);
        q = linked ? q.eq('goal_id', linked) : q.is('goal_id', null);
        const { data, error } = await q;
        if (error) throw error;
        if (cancelled) return;
        planIdRef.current = data?.[0]?.id ?? null;
        const next = data?.[0] ? normalizePlan(data[0].data) : buildPlan();
        planRef.current = next;
        dirtyRef.current = false;
        setPlan(next);
        setDay(dayOfPlan(next.startDate, dateKey(new Date())));
        setTab(next.meals.length ? 'today' : 'plan');
        setStatus('idle');
      } catch (e: any) {
        if (!cancelled) Alert.alert('Plan setup', e?.message || 'Could not load plan.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [linked]);

  /* ---------- save (autosave, one request at a time) ---------- */
  const flush = useCallback(async () => {
    if (savingRef.current) { pendingRef.current = true; return; }
    if (!dirtyRef.current) return;
    savingRef.current = true;
    dirtyRef.current = false;
    setStatus('saving');
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error('Please sign in again.');
      const payload = {
        user_id: user.id,
        goal_id: linkedRef.current,
        kind: 'nutrition',
        title: 'Nutrition + Shopping',
        data: planRef.current,
        updated_at: new Date().toISOString(),
      };
      const req = planIdRef.current
        ? supabase.from(TABLE).update(payload).eq('id', planIdRef.current).eq('user_id', user.id).select('id').single()
        : supabase.from(TABLE).insert(payload).select('id').single();
      const { data, error } = await req;
      if (error) throw error;
      if (data?.id) planIdRef.current = data.id;
      setStatus(dirtyRef.current ? 'saving' : 'saved');
    } catch (e) {
      dirtyRef.current = true; // keep the changes; user can retry
      setStatus('error');
    } finally {
      savingRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        if (dirtyRef.current) void flush();
      }
    }
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (dirtyRef.current) void flush();
  }, [flush]);

  /** Every change goes through here: update state, mark dirty, autosave after a short pause. */
  const edit = useCallback((fn: (p: SupportPlan) => SupportPlan) => {
    const next = fn(planRef.current);
    planRef.current = next;
    setPlan(next);
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flush(), 1200);
  }, [flush]);

  async function goBack() {
    if (timerRef.current) clearTimeout(timerRef.current);
    await flush();
    router.back();
  }

  /* ---------- derived ---------- */
  const intel = evaluatePlan(plan, todayDay, todayKey, nowMin);
  const todayLog = plan.log[todayKey] || {};
  const viewMeals = mealsForDay(plan, day);
  const viewProtein = viewMeals.reduce(
  (total, meal) => total + Number(meal.protein || 0),
  0
);

const viewCals = viewMeals.reduce(
  (total, meal) =>
    total +
    Number(meal.protein || 0) * 4 +
    Number(meal.carb || 0) * 4 +
    Number(meal.fat || 0) * 9,
  0
);
  const current = plan.meals.find((m) => m.id === openId) || null;
  const list = shoppingList(plan);
  const affordable = affordableMealOptions(plan).slice(0, 5);
  const categories = [...new Set(list.map((i) => i.cat))];
  const prefs = plan.preferences;

  /* ---------- actions ---------- */
  const setPref = (patch: Partial<SupportPlan['preferences']>) =>
    edit((p) => ({ ...p, preferences: { ...p.preferences, ...patch } }));

  const toggleEaten = (id: string) =>
    edit((p) => {
      const today = { ...(p.log[todayKey] || {}) };
      if (today[id]) delete today[id]; else today[id] = true;
      return { ...p, log: { ...p.log, [todayKey]: today } };
    });

  const toggleOnHand = (key: string) =>
    edit((p) => ({ ...p, onHand: { ...(p.onHand || {}), [key]: !p.onHand?.[key] } }));

  const toggleBought = (key: string) =>
    edit((p) => ({ ...p, bought: { ...p.bought, [key]: !p.bought[key] } }));

  const updateMeal = (id: string, patch: Partial<Meal>) =>
    edit((p) => ({ ...p, meals: p.meals.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));

  const updateIngredient = (mealId: string, ingId: string, patch: Partial<Ingredient>) =>
    edit((p) => ({
      ...p,
      meals: p.meals.map((m) =>
        m.id === mealId ? { ...m, ingredients: m.ingredients.map((i) => (i.id === ingId ? { ...i, ...patch } : i)) } : m
      ),
    }));

  function applyMealSwap(id: string, replacement: Meal) {
    if (!mealMatchesRules(replacement, planRef.current.preferences.rules)) { Alert.alert('Not compatible', 'This meal conflicts with your dietary requirements.'); return; }
    const previous = planRef.current;
    setUndoPlan(previous);
    edit(p => replacePlannedMeal(p, id, replacement));
    setSwapMealId(null);
    setOpenId(null);
  }

  function applyIngredientSwap(name: string, alternative: { name: string; price: number }) {
    if (!ingredientMatchesRules(alternative.name, planRef.current.preferences.rules)) {
      Alert.alert('Does not match your requirements', 'This ingredient alternative conflicts with a selected dietary restriction.'); return;
    }
    Alert.alert('Review preparation', `Replace ${name} with ${alternative.name} in all planned meals?\n\nCooking instructions and nutrition values may no longer be accurate. Review each affected meal before preparing.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Replace & review', onPress: () => {
        setUndoPlan(planRef.current);
        edit(p => replaceShoppingIngredient(p, name, alternative));
        setShopSwapKey(null);
        setTab('prep');
      } },
    ]);
  }

  function addMeal() {
    const dayMeals = mealsForDay(plan, day);
    const last = dayMeals[dayMeals.length - 1];
    const time = last ? stepTime(last.time, 120) : prefs.firstMeal;
    const meal: Meal = { id: uid(), day, time, title: 'New meal', subtitle: '', protein: 0, carb: 0, fat: 0, ingredients: [], prep: [] };
    edit((p) => ({ ...p, meals: [...p.meals, meal] }));
    setOpenId(meal.id);
  }

  function deleteMeal(id: string) {
    Alert.alert('Delete meal', 'Remove this meal from the plan?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { setOpenId(null); edit((p) => ({ ...p, meals: p.meals.filter((m) => m.id !== id) })); } },
    ]);
  }

  function closeEditor() {
    if (current && current.ingredients.some((i) => !i.name.trim())) {
      updateMeal(current.id, { ingredients: current.ingredients.filter((i) => i.name.trim()) });
    }
    setOpenId(null);
  }

  function copyDayToAll() {
    Alert.alert('Copy this day', `Replace every other day with ${dayLabel(plan.startDate, day)}'s meals and times?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Copy',
        onPress: () =>
          edit((p) => {
            const src = mealsForDay(p, day);
            const others = p.meals.filter((m) => m.day === day);
            const copies = [1, 2, 3, 4, 5, 6, 7].filter((d) => d !== day).flatMap((d) =>
              src.map((m) => ({ ...m, id: uid(), day: d, ingredients: m.ingredients.map((i) => ({ ...i, id: uid() })), prep: [...m.prep] }))
            );
            return { ...p, meals: [...others, ...copies] };
          }),
      },
    ]);
  }

  function rebuildWeek() {
    const candidate = buildPlan(plan.preferences, plan);
    if (candidate.meals.length < plan.preferences.mealsPerDay * 7) {
      Alert.alert('Not enough matching recipes', 'Your selected requirements do not have enough matching breakfast, main and snack recipes yet. Your current meals are unchanged. Try another combination or edit meals manually.');
      return;
    }
    Alert.alert('Build my week', 'This replaces upcoming planned meals. Your previous activity log stays, but earlier meal IDs may no longer match. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Build', onPress: () => edit((p) => buildPlan(p.preferences, p)) },
    ]);
  }

  const addTask = () => {
    const text = newTask.trim();
    if (!text) return;
    edit((p) => ({ ...p, prepTasks: [...p.prepTasks, { id: uid(), text, done: false }] }));
    setNewTask('');
  };

  /* ---------- render ---------- */
  if (loading) return <View style={s.center}><ActivityIndicator color={G} /></View>;

  const statusText = status === 'saving' ? 'SAVING…' : status === 'saved' ? 'ALL CHANGES SAVED' : status === 'error' ? 'COULD NOT SAVE · TAP TO RETRY' : 'CHANGES SAVE AUTOMATICALLY';

  return (
    <View style={s.page}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.top}>
          <Pressable onPress={goBack}><Text style={s.back}>‹ BACK</Text></Pressable>
          <Text style={s.brand}>GOAL'D IN</Text>
        </View>
        <Text style={s.kicker}>PLAN · SHOP · PREPARE · ACHIEVE</Text>
        <Text style={s.h1}>Nutrition, your way.</Text>

        <View style={[s.nav, s.navTop]}>
          {([['today', 'TODAY'], ['plan', 'PLAN'], ['shop', 'SHOP'], ['prep', 'PREP']] as [Tab, string][]).map(([k, l]) => (
            <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} onPress={() => { if (k === 'plan') setDay(todayDay); setTab(k); }} style={[s.navItem, tab === k && s.navSelected]}>
              <Text style={[s.navText, tab === k && s.navOn]}>{l}</Text>
            </Pressable>
          ))}
        </View>

        {/* ================= TODAY ================= */}
        {tab === 'today' && (
          <>
            <Card accent>
              <View style={s.hero}>
                <Ring value={intel.adherence} />
                <View style={{ flex: 1, marginLeft: 18 }}>
                  <Text style={s.goldmini}>TODAY · {dayLabel(plan.startDate, todayDay)}</Text>
                  <Text style={s.big}>
                    {intel.meals.length === 0
                      ? 'No meals planned for today yet.'
                      : `${intel.doneCount} of ${intel.meals.length} meals done`}
                  </Text>
                  {intel.meals.length > 0 && (
                    <View>
                      <Text style={s.muted}>Protein · {intel.proteinEaten} / {prefs.proteinTarget} g</Text>
                      <Text style={s.muted}>Calories · {intel.caloriesLogged} / {prefs.calorieTarget} cal</Text>
                      <Text style={s.muted}>Based on meals marked complete · estimates</Text>
                    </View>
                  )}
                  {(prefs.workout || prefs.work) ? (
                    <Text style={s.muted}>{prefs.workout ? `Workout ${prefs.workout}` : ''}{prefs.workout && prefs.work ? ' · ' : ''}{prefs.work ? `Work ${prefs.work}` : ''}</Text>
                  ) : null}
                </View>
              </View>
            </Card>

            {intel.meals.length === 0 && (
              <Card>
                <Text style={s.title}>Build your day</Text>
                <Text style={s.muted}>Choose your meals and the exact times you eat them.</Text>
                <Pressable style={s.primary} onPress={() => { setDay(todayDay); setTab('plan'); }}><Text style={s.primaryText}>OPEN MY PLAN</Text></Pressable>
              </Card>
            )}

            {intel.next && (
              <Card>
                <Text style={s.goldmini}>NEXT MOVE · {fmt12(intel.next.time)}{intel.late ? ' · RUNNING LATE' : ''}</Text>
                <Text style={s.title}>{intel.next.title}</Text>
                {!!intel.next.subtitle && <Text style={s.muted}>{intel.next.subtitle}</Text>}
                <View style={s.macros}>
                  <Macro l="PROTEIN" v={`${intel.next.protein} g`} />
                  <Macro l="CARB" v={`${intel.next.carb} g`} />
                  <Macro l="FAT" v={`${intel.next.fat} g`} />
                </View>
                <Text style={s.cost}>{mealCalories(intel.next)} CAL · EST. ${mealCost(intel.next).toFixed(2)}</Text>
                <Pressable style={s.primary} onPress={() => setOpenId(intel.next!.id)}><Text style={s.primaryText}>VIEW NEXT MOVE</Text></Pressable>
                <Pressable style={s.secondary} onPress={() => toggleEaten(intel.next!.id)}><Text style={s.secondaryText}>MARK DONE</Text></Pressable>
              </Card>
            )}

            {intel.allDone && (
              <Card accent>
                <Text style={s.goldmini}>DONE FOR TODAY</Text>
                <Text style={s.big}>Every meal on today's plan is complete.</Text>
              </Card>
            )}

            {!!intel.blocked && (
              <Card>
                <Text style={s.goldmini}>INGREDIENT CHECK</Text>
                <Text style={s.big}>{intel.blocked}</Text>
                <Pressable style={s.secondary} onPress={() => setTab('shop')}><Text style={s.secondaryText}>OPEN SHOPPING LIST</Text></Pressable>
              </Card>
            )}

            {intel.meals.length > 0 && (
              <>
                <Text style={s.section}>TODAY'S PLAN</Text>
                {intel.meals.map((m) => (
                  <MealCard key={m.id} m={m} done={!!todayLog[m.id]} onOpen={() => setOpenId(m.id)} onToggle={() => toggleEaten(m.id)} />
                ))}
              </>
            )}
          </>
        )}

        {/* ================= PLAN ================= */}
        {tab === 'plan' && (
          <>
                         <Text style={s.section}>YOUR EATING STYLE</Text>
             <Card accent>
               <View style={[s.row, { alignItems: 'center', justifyContent: 'space-between' }]}>
                 <View style={{ flex: 1 }}>
                   <Text style={s.goldmini}>PERSONALIZED TO YOU</Text>
                   <Text style={s.big}>{STYLE_LABEL[prefs.style]}</Text>
                   <Text style={s.muted}>{prefs.rules.length ? prefs.rules.map(r => RULE_LABEL[r]).join(' · ') : 'No additional requirements selected'}</Text>
                 </View>
                 <Pressable style={s.editDiet} onPress={() => setDietOpen(v => !v)}><Text style={s.editDietText}>{dietOpen ? 'CLOSE' : 'EDIT MY DIET'}</Text></Pressable>
               </View>
               {dietOpen && <>
                 <Text style={[s.goldmini, { marginTop: 18 }]}>EATING STYLE</Text>
                 <View style={s.chips}>
                   {(Object.keys(STYLE_LABEL) as DietStyle[]).map(k => (
                     <Pressable key={k} onPress={() => setPref({ style: k })} style={[s.chip, prefs.style === k && s.chipOn]}>
                       <Text style={[s.chipText, prefs.style === k && s.chipTextOn]}>{STYLE_LABEL[k]}</Text>
                     </Pressable>
                   ))}
                 </View>
                 <Text style={[s.goldmini, { marginTop: 14 }]}>ADDITIONAL REQUIREMENTS</Text>
                 <View style={s.chips}>
                   {(Object.keys(RULE_LABEL) as DietaryRule[]).map(k => (
                     <Pressable key={k} onPress={() => setPref({ rules: prefs.rules.includes(k) ? prefs.rules.filter(x => x !== k) : [...prefs.rules, k] })} style={[s.chip, prefs.rules.includes(k) && s.chipOn]}>
                       <Text style={[s.chipText, prefs.rules.includes(k) && s.chipTextOn]}>{RULE_LABEL[k]}</Text>
                     </Pressable>
                   ))}
                 </View>
                 <Text style={s.muted}>{RULE_NOTE}</Text>
                 <Text style={s.muted}>Changes to your preferences do not replace existing meals until you choose BUILD MY WEEK.</Text>
               </>}
               <Text style={[s.goldmini, { marginTop: 14 }]}>YOUR DAILY TARGETS</Text>
               <Stepper label="Meals per day" value={String(prefs.mealsPerDay)} onMinus={() => setPref({ mealsPerDay: Math.max(1, prefs.mealsPerDay - 1) })} onPlus={() => setPref({ mealsPerDay: Math.min(6, prefs.mealsPerDay + 1) })} />
               <Stepper label="First meal" value={fmt12(prefs.firstMeal)} onMinus={() => setPref({ firstMeal: stepTime(prefs.firstMeal, -15) })} onPlus={() => setPref({ firstMeal: stepTime(prefs.firstMeal, 15) })} />
               <Stepper label="Last meal" value={fmt12(prefs.lastMeal)} onMinus={() => setPref({ lastMeal: stepTime(prefs.lastMeal, -15) })} onPlus={() => setPref({ lastMeal: stepTime(prefs.lastMeal, 15) })} />
               <Stepper label="Daily protein" value={`${prefs.proteinTarget} g`} onMinus={() => setPref({ proteinTarget: Math.max(40, prefs.proteinTarget - 10) })} onPlus={() => setPref({ proteinTarget: Math.min(400, prefs.proteinTarget + 10) })} />
               <Stepper label="Daily calories" value={`${prefs.calorieTarget} cal`} onMinus={() => setPref({ calorieTarget: Math.max(500, prefs.calorieTarget - 100) })} onPlus={() => setPref({ calorieTarget: Math.min(10000, prefs.calorieTarget + 100) })} />
               <Text style={s.muted}>{availableRecipeCount(prefs)} matching starter recipes. Nutrition values are estimates; generated meals may not meet your daily targets exactly.</Text>
               <Pressable style={s.primary} onPress={rebuildWeek}><Text style={s.primaryText}>BUILD MY WEEK</Text></Pressable>
             </Card>

<Text style={s.section}>7-DAY PLAN</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={s.days}>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <Pressable key={d} onPress={() => setDay(d)} style={[s.day, d === day && s.dayOn]}>
                    <Text style={[s.dayText, d === day && s.dayTextOn]}>{dayLabel(plan.startDate, d)}</Text>
                    {d === todayDay && <View style={[s.todayDot, d === day && { backgroundColor: '#080808' }]} />}
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Card>
              <View style={s.totals}>
                <View><Text style={s.mini}>PROTEIN</Text><Text style={s.total}>{viewProtein} g</Text></View>
                <View style={{ alignItems: 'flex-end' }}><Text style={s.mini}>CALORIES</Text><Text style={s.total}>{viewCals}</Text></View>
              </View>
              <Text style={s.muted}>{viewCals} / {prefs.calorieTarget} planned calories · estimate</Text>
              {viewProtein < prefs.proteinTarget ? (
                <Text style={s.muted}>{prefs.proteinTarget - viewProtein} g short of your {prefs.proteinTarget} g target. Edit a meal or add one.</Text>
              ) : (
                <Text style={[s.muted, { color: '#78CE8A' }]}>Protein target met.</Text>
              )}
            </Card>

            {viewMeals.map((m) => (
              <View key={m.id}>
                <MealCard m={m} onOpen={() => setOpenId(m.id)} />
                <Pressable style={s.secondary} onPress={() => { setSwapMealId(m.id); setSwapMode('different'); }}><Text style={s.secondaryText}>↔ SWAP MEAL</Text></Pressable>
              </View>
            ))}
            <Pressable style={s.primary} onPress={addMeal}><Text style={s.primaryText}>+ ADD MEAL TO THIS DAY</Text></Pressable>
            {viewMeals.length > 0 && (
              <Pressable style={s.secondary} onPress={copyDayToAll}><Text style={s.secondaryText}>COPY THIS DAY TO ALL DAYS</Text></Pressable>
            )}
          </>
        )}

        {/* ================= SHOP ================= */}
        {tab === 'shop' && (
          <>
            <Card accent>
              <Text style={s.goldmini}>WEEKLY BUDGET</Text>
              <View style={s.budget}>
                <Text style={s.dollar}>$</Text>
                <NumField decimal value={plan.budget} onChange={(v) => edit((p) => ({ ...p, budget: v }))} style={s.budgetInput} />
              </View>
              <Text style={s.muted}>Meal ingredient portion estimates, not a checkout price. Actual package costs may differ.</Text>
              <View style={s.totals}>
                <View><Text style={s.mini}>ESTIMATED</Text><Text style={s.total}>${intel.total.toFixed(2)}</Text></View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.mini}>{intel.over ? 'OVER' : 'REMAINING'}</Text>
                  <Text style={[s.total, { color: intel.over ? '#FF8F80' : '#78CE8A' }]}>${Math.abs(intel.remaining).toFixed(2)}</Text>
                </View>
              </View>
              {intel.over && <Text style={s.muted}>Over your ingredient estimate budget. Review compatible lower-cost meals below; changes require your approval.</Text>}
            </Card>

            <Text style={s.section}>MAKE MY PLAN MORE AFFORDABLE</Text>
            <Text style={s.muted}>Optional alternatives matched to your selected eating style and ingredient filters. Costs and nutrition are estimates. Verify labels and religious requirements.</Text>
            {affordable.length === 0 && <Card><Text style={s.muted}>No lower-cost compatible starter meals found. You can still edit ingredient costs and portions in a meal.</Text></Card>}
            {affordable.map((x) => (
              <Card key={x.mealId}>
                <Text style={s.goldmini}>{dayLabel(plan.startDate, x.day)} · EST. SAVE ${x.difference.toFixed(2)} PER MEAL</Text>
                <Text style={s.big}>{x.original} → {x.replacement.title}</Text>
                <Text style={s.muted}>${x.oldCost.toFixed(2)} → ${x.newCost.toFixed(2)} · Protein {x.replacement.protein}g · {mealCalories(x.replacement)} cal</Text>
                <Pressable style={s.secondary} onPress={() => Alert.alert('Replace this meal?', `${x.original} → ${x.replacement.title}\nEstimated difference: $${x.difference.toFixed(2)}. Nutrition and ingredients will change. Check dietary labels and preparation requirements.`, [
                  { text: 'Keep current', style: 'cancel' },
                  { text: 'Replace meal', onPress: () => edit(p => ({ ...p, bought: {}, meals: p.meals.map(m => m.id === x.mealId ? x.replacement : m) })) },
                ])}><Text style={s.secondaryText}>REVIEW & REPLACE</Text></Pressable>
              </Card>
            ))}
            <Card>
              <Text style={s.goldmini}>HOME COOKING VS. EATING OUT</Text>
              <Text style={s.big}>What does your usual takeout meal cost?</Text>
              <View style={s.budget}><Text style={s.dollar}>$</Text><NumField decimal value={plan.diningOutCost || 0} onChange={(v) => edit(p => ({ ...p, diningOutCost: v }))} style={s.budgetInput} /></View>
              <Text style={s.muted}>Enter your own typical price. This comparison is not a record of money saved.</Text>
              {plan.diningOutCost ? <Text style={s.save}>A ${plan.diningOutCost.toFixed(2)} takeout meal vs. a ${((plan.meals.reduce((sum, m) => sum + mealCost(m), 0)) / Math.max(1, plan.meals.length)).toFixed(2)} average home meal (ingredient portion estimate).</Text> : null}
            </Card>

            <Card accent>
              <Text style={s.goldmini}>WHAT DO YOU ALREADY HAVE?</Text>
              <Text style={s.big}>Check your kitchen before shopping</Text>
              <Text style={s.muted}>Tap HAVE beside an ingredient only when you have enough for the whole week's recipes. Shopping checkmarks below are separate.</Text>
              <View style={s.totals}>
                <View><Text style={s.mini}>EST. STILL TO BUY</Text><Text style={s.total}>${intel.estimatedToBuy.toFixed(2)}</Text></View>
                <View style={{ alignItems: 'flex-end' }}><Text style={s.mini}>EST. ON HAND</Text><Text style={s.total}>${intel.estimatedAlreadyHave.toFixed(2)}</Text></View>
              </View>
              <Text style={s.muted}>Based on ingredient portion estimates, not package prices or verified savings. For partial quantities, leave HAVE off and adjust your list manually.</Text>
            </Card>
            <Text style={s.section}>GROCERY LIST · {intel.bought}/{intel.listCount}</Text>
            {list.length === 0 && <Card><Text style={s.muted}>Your list builds itself from the ingredients in your meals.</Text></Card>}
            {categories.map((cat) => (
              <View key={cat}>
                <Text style={s.goldmini}>{cat.toUpperCase()}</Text>
                {list.filter((i) => i.cat === cat).map((x) => (
                  <Card key={x.id}>
                    <View style={s.row}>
                      <Pressable onPress={() => toggleBought(x.id)} style={[s.check, !!plan.bought[x.id] && s.checkOn]}><Text>{plan.bought[x.id] ? '✓' : ''}</Text></Pressable>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[s.big, !!plan.bought[x.id] && s.struck]}>{x.name}</Text>
                        <Text style={s.muted}>{x.qty ? `${x.qty} · ` : ''}used in {x.uses} meal{x.uses === 1 ? '' : 's'}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 7 }}>
                        <Pressable onPress={() => toggleOnHand(x.id)} style={[s.check, !!plan.onHand?.[x.id] && s.checkOn, { width: 64, height: 30, alignItems: 'center', justifyContent: 'center' }]}>
                          <Text style={{ color: plan.onHand?.[x.id] ? '#101010' : G, fontSize: 11, fontWeight: '800' }}>{plan.onHand?.[x.id] ? 'HAVE ✓' : 'HAVE?'}</Text>
                        </Pressable>
                        <Text style={s.price}>{plan.onHand?.[x.id] ? 'ON HAND' : `$${x.price.toFixed(2)}`}</Text>
                        <Pressable onPress={() => setShopSwapKey(shopSwapKey === x.id ? null : x.id)}><Text style={s.goldmini}>↔ SWAP</Text></Pressable>
                      </View>
                    </View>
                    {shopSwapKey === x.id && <View style={{ marginTop: 12 }}>
                      <Text style={s.muted}>Available ingredient alternatives from your recipes. Prices are per portion, not package totals.</Text>
                      {plan.meals.flatMap(m => m.ingredients).filter(i => i.name.trim().toLowerCase() === x.id && !!i.alt && i.alt.price < i.price).slice(0, 1).map(i => (
                        <Pressable key={i.id} style={s.secondary} onPress={() => applyIngredientSwap(x.name, i.alt!)}>
                          <Text style={s.secondaryText}>{i.alt!.name} · est. ${i.alt!.price.toFixed(2)} / portion</Text>
                        </Pressable>
                      ))}
                      {!plan.meals.some(m => m.ingredients.some(i => i.name.trim().toLowerCase() === x.id && !!i.alt && i.alt.price < i.price)) && <Text style={s.muted}>No verified recipe-compatible alternative available. Open a meal to edit ingredients manually.</Text>}
                    </View>}
                  </Card>
                ))}
              </View>
            ))}
            {list.length > 0 && (
              <Pressable style={s.secondary} onPress={() => edit((p) => ({ ...p, bought: {} }))}><Text style={s.secondaryText}>START A NEW SHOPPING TRIP</Text></Pressable>
            )}
          </>
        )}

        {/* ================= PREP ================= */}
        {tab === 'prep' && (
          <>
            <Text style={s.section}>MEAL PREP</Text>
            {dietaryPrepNotes(prefs.rules).length > 0 && <Card accent>
              <Text style={s.goldmini}>YOUR PREPARATION REQUIREMENTS</Text>
              {dietaryPrepNotes(prefs.rules).map(note => <Text key={note} style={s.muted}>• {note}</Text>)}
              <Text style={s.muted}>{RULE_NOTE}</Text>
            </Card>}
            <Card>
              <Text style={s.title}>Prep once. Remove decisions all week.</Text>
              {plan.prepTasks.map((t, i) => (
                <View key={t.id} style={[s.row, { marginTop: 12, alignItems: 'center' }]}>
                  <Pressable onPress={() => edit((p) => ({ ...p, prepTasks: p.prepTasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) }))} style={[s.check, t.done && s.checkOn]}><Text>{t.done ? '✓' : ''}</Text></Pressable>
                  <Text style={[s.prep, { flex: 1, marginTop: 0, marginLeft: 12 }, t.done && s.struck]}>{i + 1}. {t.text}</Text>
                  <Pressable onPress={() => edit((p) => ({ ...p, prepTasks: p.prepTasks.filter((x) => x.id !== t.id) }))} hitSlop={10}><Text style={s.x}>✕</Text></Pressable>
                </View>
              ))}
              <View style={[s.row, { marginTop: 16, alignItems: 'center' }]}>
                <TextInput value={newTask} onChangeText={setNewTask} onSubmitEditing={addTask} placeholder="Add a prep task" placeholderTextColor={M} style={[s.input, { flex: 1 }]} returnKeyType="done" />
                <Pressable onPress={addTask} style={s.addBtn}><Text style={s.addBtnText}>ADD</Text></Pressable>
              </View>
              <Pressable style={s.secondary} onPress={() => edit((p) => ({ ...p, prepTasks: p.prepTasks.map((x) => ({ ...x, done: false })) }))}><Text style={s.secondaryText}>RESET FOR A NEW WEEK</Text></Pressable>
            </Card>

            <Text style={s.section}>PREPARE YOUR MEALS</Text>
            <Text style={s.muted}>Swap an entire recipe to update ingredients and cooking steps together. Ingredient-only changes need a manual cooking and nutrition review.</Text>
            {mealsForDay(plan, todayDay).map(m => <View key={m.id}>
              <MealCard m={m} onOpen={() => setOpenId(m.id)} />
              <Pressable style={s.secondary} onPress={() => { setSwapMealId(m.id); setSwapMode('different'); }}><Text style={s.secondaryText}>↔ SWAP BEFORE PREP</Text></Pressable>
            </View>)}
            <Text style={s.section}>YOUR SCHEDULE</Text>
            <Card>
              <Text style={s.muted}>Shown on your Today screen so meals fit your day.</Text>
              <Text style={[s.goldmini, { marginTop: 14 }]}>WORKOUT TIME</Text>
              <TextInput value={prefs.workout} onChangeText={(v) => setPref({ workout: v })} placeholder="e.g. 5:30 PM" placeholderTextColor={M} style={s.input} />
              <Text style={[s.goldmini, { marginTop: 14 }]}>WORK HOURS</Text>
              <TextInput value={prefs.work} onChangeText={(v) => setPref({ work: v })} placeholder="e.g. 8 AM – 4 PM" placeholderTextColor={M} style={s.input} />
            </Card>

            <Text style={s.section}>YOUR DIET</Text>
            <Card>
              <Pref a="Style" b={STYLE_LABEL[prefs.style]} />
              <Pref a="Meals per day" b={String(prefs.mealsPerDay)} />
              <Pref a="Eating window" b={`${fmt12(prefs.firstMeal)} – ${fmt12(prefs.lastMeal)}`} />
              <Pref a="Protein target" b={`${prefs.proteinTarget} g / day`} />
              <Pref a="Calorie target" b={`${prefs.calorieTarget} cal / day`} />
            </Card>
          </>
        )}

        {undoPlan && <Pressable style={s.secondary} onPress={() => { const old = undoPlan; setUndoPlan(null); edit(() => old); }}><Text style={s.secondaryText}>↶ UNDO LAST SWAP</Text></Pressable>}
        <Pressable style={s.secondary} onPress={() => { dirtyRef.current = true; void flush(); }} disabled={status === 'saving'}>
          <Text style={[s.secondaryText, status === 'error' && { color: '#FF8F80' }]}>{statusText}</Text>
        </Pressable>
        <Text style={s.disclaimer}>GOAL'D IN organizes the plan you choose and does not override clinician instructions.</Text>
      </ScrollView>

      {/* ================= SHARED MEAL SWAP ================= */}
      {swapMealId && (() => {
        const target = plan.meals.find(m => m.id === swapMealId);
        if (!target) return null;
        const options = mealSwapOptions(plan, target, swapMode);
        return <View style={s.overlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setSwapMealId(null)} />
          <View style={s.sheet}><View style={s.handle} /><ScrollView>
            <Text style={s.goldmini}>SWAP · {target.title}</Text>
            <Text style={s.title}>Find a better fit</Text>
            <View style={s.chips}>{([['cheaper','💰 CHEAPER'], ['nutrition','🥗 NUTRITION'], ['different','🍽 DIFFERENT']] as [MealSwapMode,string][]).map(([mode,label]) =>
              <Pressable key={mode} style={[s.chip, swapMode === mode && s.chipOn]} onPress={() => setSwapMode(mode)}><Text style={[s.chipText, swapMode === mode && s.chipTextOn]}>{label}</Text></Pressable>
            )}</View>
            <Text style={s.muted}>Only recipes matching your selected style and basic ingredient filters appear. Verify labels, allergies, kosher and halal requirements yourself.</Text>
            {!options.length && <Text style={s.muted}>No matching options in the current recipe library.</Text>}
            {options.map((m, i) => <Card key={`${m.title}-${i}`}>
              <Text style={s.big}>{m.title}</Text>
              <Text style={s.muted}>${mealCost(m).toFixed(2)} / meal · {m.protein}g protein · {mealCalories(m)} cal</Text>
              <Text style={s.muted}>{m.ingredients.map(x => x.name).join(', ')}</Text>
              <Pressable style={s.secondary} onPress={() => applyMealSwap(target.id, m)}><Text style={s.secondaryText}>USE THIS MEAL</Text></Pressable>
            </Card>)}
            <Pressable style={s.secondary} onPress={() => setSwapMealId(null)}><Text style={s.secondaryText}>CANCEL</Text></Pressable>
          </ScrollView></View>
        </View>;
      })()}
      {/* ================= MEAL EDITOR ================= */}
      {current && (
        <View style={s.overlay}>
          <Pressable style={{ flex: 1 }} onPress={closeEditor} />
          <View style={s.sheet}>
            <View style={s.handle} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={s.goldmini}>{fmt12(current.time)} · {dayLabel(plan.startDate, current.day)} · MEAL DETAILS</Text>
              <TextInput value={current.title} onChangeText={(v) => updateMeal(current.id, { title: v })} placeholder="Meal name" placeholderTextColor={M} style={s.sheetTitleInput} />
              <TextInput value={current.subtitle} onChangeText={(v) => updateMeal(current.id, { subtitle: v })} placeholder="Short note (optional)" placeholderTextColor={M} style={s.input} />

              <Stepper label="Time" value={fmt12(current.time)} onMinus={() => updateMeal(current.id, { time: stepTime(current.time, -15) })} onPlus={() => updateMeal(current.id, { time: stepTime(current.time, 15) })} />

              <View style={s.macros}>
                <MacroInput l="PROTEIN g" v={current.protein} onChange={(v) => updateMeal(current.id, { protein: v })} />
                <MacroInput l="CARB g" v={current.carb} onChange={(v) => updateMeal(current.id, { carb: v })} />
                <MacroInput l="FAT g" v={current.fat} onChange={(v) => updateMeal(current.id, { fat: v })} />
              </View>
              <Text style={s.cost}>{mealCalories(current)} CAL · EST. ${mealCost(current).toFixed(2)} PER MEAL</Text>
              {(plan.diningOutCost || 0) > 0 && <Text style={s.muted}>Vs. your usual ${plan.diningOutCost?.toFixed(2)} takeout meal: ${Math.max(0, (plan.diningOutCost || 0) - mealCost(current)).toFixed(2)} potential difference, not confirmed savings.</Text>}

              <Pressable style={s.secondary} onPress={() => { setOpenId(null); setSwapMealId(current.id); setSwapMode('different'); }}><Text style={s.secondaryText}>↔ SWAP THIS MEAL</Text></Pressable>
              <Text style={s.section}>YOU NEED</Text>
              {current.ingredients.map((i) => (
                <View key={i.id} style={s.ingBox}>
                  <View style={s.row}>
                    <TextInput value={i.name} onChangeText={(v) => updateIngredient(current.id, i.id, { name: v })} placeholder="Ingredient" placeholderTextColor={M} style={[s.inputSm, { flex: 2 }]} />
                    <TextInput value={i.qty} onChangeText={(v) => updateIngredient(current.id, i.id, { qty: v })} placeholder="Qty" placeholderTextColor={M} style={[s.inputSm, { flex: 1, marginLeft: 6 }]} />
                    <NumField decimal value={i.price} onChange={(v) => updateIngredient(current.id, i.id, { price: v })} style={[s.inputSm, { width: 64, marginLeft: 6 }]} />
                    <Pressable hitSlop={10} onPress={() => updateMeal(current.id, { ingredients: current.ingredients.filter((x) => x.id !== i.id) })}><Text style={[s.x, { marginLeft: 10, marginTop: 10 }]}>✕</Text></Pressable>
                  </View>
                  <View style={[s.row, { marginTop: 6 }]}>
                    <TextInput value={i.alt?.name || ''} onChangeText={(v) => updateIngredient(current.id, i.id, { alt: v ? { name: v, price: i.alt?.price || 0 } : undefined })} placeholder="Cheaper swap (optional)" placeholderTextColor={M} style={[s.inputSm, { flex: 1 }]} />
                    {!!i.alt && <NumField decimal value={i.alt.price} onChange={(v) => updateIngredient(current.id, i.id, { alt: { name: i.alt!.name, price: v } })} style={[s.inputSm, { width: 64, marginLeft: 6 }]} />}
                  </View>
                </View>
              ))}
              <Pressable style={s.secondary} onPress={() => updateMeal(current.id, { ingredients: [...current.ingredients, { id: uid(), name: '', qty: '', price: 0, cat: 'Other' }] })}><Text style={s.secondaryText}>+ ADD INGREDIENT</Text></Pressable>

              <Text style={s.section}>PREP · ONE STEP PER LINE</Text>
              <TextInput value={current.prep.join('\n')} onChangeText={(v) => updateMeal(current.id, { prep: v.split('\n') })} multiline placeholder="How to make it" placeholderTextColor={M} style={[s.input, { minHeight: 90, textAlignVertical: 'top' }]} />

              {current.day === todayDay && (
                <Pressable style={s.primary} onPress={() => { toggleEaten(current.id); closeEditor(); }}>
                  <Text style={s.primaryText}>{todayLog[current.id] ? 'UNDO COMPLETE' : 'MARK MEAL COMPLETE'}</Text>
                </Pressable>
              )}
              <Pressable style={s.secondary} onPress={closeEditor}><Text style={s.secondaryText}>DONE</Text></Pressable>
              <Pressable style={{ alignItems: 'center', marginTop: 16 }} onPress={() => deleteMeal(current.id)}><Text style={[s.secondaryText, { color: '#FF8F80' }]}>DELETE MEAL</Text></Pressable>
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

/* ---------- small components ---------- */

function Card({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return <View style={[s.card, accent && s.cardAccent]}>{children}</View>;
}
function Ring({ value }: { value: number }) {
  return <View style={s.ring}><Text style={s.ringVal}>{value}%</Text><Text style={s.ringLab}>GOAL'D IN</Text></View>;
}
function Macro({ l, v }: { l: string; v: string }) {
  return <View style={s.macro}><Text style={s.macroVal}>{v}</Text><Text style={s.macroLab}>{l}</Text></View>;
}
function MacroInput({ l, v, onChange }: { l: string; v: number; onChange: (n: number) => void }) {
  return (
    <View style={s.macro}>
      <NumField value={v} onChange={onChange} style={s.macroInput} />
      <Text style={s.macroLab}>{l}</Text>
    </View>
  );
}
function Pref({ a, b }: { a: string; b: string }) {
  return <View style={s.pref}><Text style={s.muted}>{a}</Text><Text style={s.prefVal}>{b}</Text></View>;
}
function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={s.stepRow}>
      <Text style={s.muted}>{label}</Text>
      <View style={s.stepCtl}>
        <Pressable style={s.stepBtn} onPress={onMinus} hitSlop={6}><Text style={s.stepBtnText}>−</Text></Pressable>
        <Text style={s.stepVal}>{value}</Text>
        <Pressable style={s.stepBtn} onPress={onPlus} hitSlop={6}><Text style={s.stepBtnText}>+</Text></Pressable>
      </View>
    </View>
  );
}
function MealCard({ m, done, onOpen, onToggle }: { m: Meal; done?: boolean; onOpen: () => void; onToggle?: () => void }) {
  return (
    <Pressable onPress={onOpen}>
      <Card>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.goldmini}>{fmt12(m.time)}</Text>
            <Text style={[s.big, !!done && s.struck]}>{m.title}</Text>
            <Text style={s.muted}>P {m.protein} · C {m.carb} · F {m.fat} · {mealCalories(m)} cal · ${mealCost(m).toFixed(2)}</Text>
          </View>
          {onToggle && (
            <Pressable onPress={onToggle} hitSlop={8} style={[s.check, !!done && s.checkOn]}><Text>{done ? '✓' : ''}</Text></Pressable>
          )}
        </View>
      </Card>
    </Pressable>
  );
}
/** Numeric input that keeps what the user typed (so "12." and an empty field work) and reports a number. */
function NumField({ value, onChange, style, decimal = false }: { value: number; onChange: (n: number) => void; style?: any; decimal?: boolean }) {
  const [t, setT] = useState(value ? String(value) : '');
  useEffect(() => {
    if (Number(t) !== value) setT(value ? String(value) : '');
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <TextInput
      value={t}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      placeholder="0"
      placeholderTextColor={M}
      onChangeText={(v) => {
        const c = v.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '');
        setT(c);
        onChange(Number(c) || 0);
      }}
      style={style}
    />
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: BG },
  center: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 60 },
  top: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 32 },
  back: { color: M, fontWeight: '900' },
  brand: { color: G, fontWeight: '900', letterSpacing: 2 },
  kicker: { color: G, fontSize: 11, fontWeight: '900', letterSpacing: 1.4, marginTop: 28 },
  h1: { color: T, fontSize: 30, lineHeight: 36, fontWeight: '900', marginTop: 8, marginBottom: 3 },
  card: { backgroundColor: C, borderWidth: 1, borderColor: '#292929', borderRadius: 22, padding: 18, marginTop: 10 },
  cardAccent: { backgroundColor: '#121009', borderColor: '#705A20' },
  hero: { flexDirection: 'row', alignItems: 'center' },
  ring: { width: 104, height: 104, borderRadius: 52, borderWidth: 9, borderColor: G, alignItems: 'center', justifyContent: 'center' },
  ringVal: { color: T, fontSize: 25, fontWeight: '900' },
  ringLab: { color: G, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  goldmini: { color: G, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: T, fontSize: 23, fontWeight: '900', marginTop: 5 },
  big: { color: T, fontSize: 16, fontWeight: '900', marginTop: 4 },
  muted: { color: M, fontSize: 13, lineHeight: 19, marginTop: 4 },
  macros: { flexDirection: 'row', gap: 8, marginTop: 14 },
  macro: { flex: 1, backgroundColor: '#1D1D1D', borderRadius: 13, padding: 10, alignItems: 'center' },
  macroVal: { color: T, fontSize: 11, fontWeight: '900', textAlign: 'center' },
  macroInput: { color: T, fontSize: 16, fontWeight: '900', textAlign: 'center', minWidth: 50, padding: 0 },
  macroLab: { color: M, fontSize: 8, fontWeight: '900', marginTop: 4 },
  cost: { color: G, fontWeight: '900', marginTop: 14 },
  primary: { backgroundColor: G, borderRadius: 15, paddingVertical: 14, alignItems: 'center', marginTop: 15 },
  primaryText: { color: '#080808', fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  secondary: { borderWidth: 1, borderColor: '#4B4122', borderRadius: 15, paddingVertical: 13, alignItems: 'center', marginTop: 13 },
  secondaryText: { color: G, fontWeight: '900', fontSize: 10, letterSpacing: 1 },
  section: { color: T, fontSize: 14, fontWeight: '900', letterSpacing: 1, marginTop: 24, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  check: { width: 31, height: 31, borderRadius: 10, borderWidth: 1, borderColor: '#555', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: '#78CE8A', borderColor: '#78CE8A' },
  struck: { textDecorationLine: 'line-through', opacity: 0.55 },
  days: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  day: { width: 54, height: 46, borderRadius: 14, borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: G, borderColor: G },
  dayText: { color: M, fontWeight: '900', fontSize: 12 },
  dayTextOn: { color: '#080808' },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: G, marginTop: 4 },
  budget: { flexDirection: 'row', alignItems: 'center' },
  dollar: { color: G, fontSize: 28, fontWeight: '900' },
  budgetInput: { flex: 1, color: T, fontSize: 29, fontWeight: '900', borderBottomWidth: 1, borderBottomColor: '#4B4122' },
  totals: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  mini: { color: M, fontSize: 9, fontWeight: '900' },
  total: { color: G, fontSize: 25, fontWeight: '900', marginTop: 3 },
  save: { color: '#78CE8A', fontWeight: '900', marginTop: 8 },
  price: { color: G, fontWeight: '900' },
  prep: { color: T, fontSize: 14, lineHeight: 22, marginTop: 10 },
  pref: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#252525' },
  prefVal: { color: T, fontSize: 12, fontWeight: '800', maxWidth: '62%', textAlign: 'right' },
  nav: { flexDirection: 'row', backgroundColor: '#111', borderRadius: 16, borderWidth: 1, borderColor: '#343025', padding: 5 },
  navTop: { marginTop: 20, marginBottom: 14 },
  navSelected: { backgroundColor: '#352C14', borderRadius: 11 },
  editDiet: { borderColor: G, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 12, marginLeft: 8 },
  editDietText: { color: G, fontWeight: '900', fontSize: 9 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#444', marginBottom: 5 },
  dotOn: { backgroundColor: G },
  navText: { color: M, fontSize: 11, fontWeight: '900' },
  navOn: { color: G },
  disclaimer: { color: '#666', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 14 },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.72)' },
  sheet: { backgroundColor: '#111', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: '#333', padding: 22, paddingBottom: 34, maxHeight: '88%' },
  handle: { width: 48, height: 5, borderRadius: 3, backgroundColor: '#444', alignSelf: 'center', marginBottom: 18 },
  sheetTitleInput: { color: T, fontSize: 24, fontWeight: '900', marginTop: 5, marginBottom: 8, padding: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 6 },
  chip: { borderWidth: 1, borderColor: '#4B4122', borderRadius: 14, paddingVertical: 9, paddingHorizontal: 12 },
  chipOn: { backgroundColor: G, borderColor: G },
  chipText: { color: G, fontSize: 11, fontWeight: '900' },
  chipTextOn: { color: '#080808' },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  stepCtl: { flexDirection: 'row', alignItems: 'center' },
  stepBtn: { width: 34, height: 34, borderRadius: 11, borderWidth: 1, borderColor: '#4B4122', alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { color: G, fontSize: 18, fontWeight: '900' },
  stepVal: { color: T, fontWeight: '900', fontSize: 13, minWidth: 82, textAlign: 'center' },
  input: { color: T, fontSize: 14, borderBottomWidth: 1, borderBottomColor: '#333', paddingVertical: 8, marginTop: 4 },
  inputSm: { color: T, fontSize: 13, backgroundColor: '#1D1D1D', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10 },
  ingBox: { marginBottom: 10 },
  x: { color: M, fontSize: 14, fontWeight: '900' },
  addBtn: { marginLeft: 10, backgroundColor: G, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  addBtnText: { color: '#080808', fontWeight: '900', fontSize: 10, letterSpacing: 1 },
});
