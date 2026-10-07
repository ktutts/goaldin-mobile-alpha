// lib/smartPlan.ts
// Data model + logic for the Nutrition / Shopping support plan.
// No React in here, so it is easy to test.

export type DietStyle = 'wholefood' | 'balanced' | 'highprotein';

export const STYLE_LABEL: Record<DietStyle, string> = {
  wholefood: 'Whole-food, grain-free',
  balanced: 'Balanced',
  highprotein: 'High protein',
};

export type Ingredient = {
  id: string;
  name: string;
  qty: string;
  price: number; // estimated cost of this portion
  cat: string;
  alt?: { name: string; price: number }; // optional cheaper swap
};

export type Meal = {
  id: string;
  day: number; // 1..7 (day 1 = plan start date)
  time: string; // 24h "HH:MM"
  title: string;
  subtitle: string;
  protein: number; // grams
  carb: number;
  fat: number;
  ingredients: Ingredient[];
  prep: string[];
};

export type PrepTask = { id: string; text: string; done: boolean };

export type Preferences = {
  style: DietStyle;
  mealsPerDay: number;
  firstMeal: string;
  lastMeal: string;
  proteinTarget: number;
  workout: string;
  work: string;
};

export type SupportPlan = {
  version: 2;
  startDate: string; // YYYY-MM-DD, local
  budget: number;
  preferences: Preferences;
  meals: Meal[];
  prepTasks: PrepTask[];
  log: Record<string, Record<string, boolean>>; // date -> mealId -> eaten
  bought: Record<string, boolean>; // ingredient key -> bought this trip
};

/* ---------- small helpers ---------- */

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const pad = (n: number) => String(n).padStart(2, '0');

export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const parseKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
};

/** Which plan day (1..7) a calendar date falls on. */
export function dayOfPlan(startDate: string, key: string) {
  const diff = Math.round((parseKey(key).getTime() - parseKey(startDate).getTime()) / 864e5);
  return (((diff % 7) + 7) % 7) + 1;
}

const WK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export function dayLabel(startDate: string, day: number) {
  const s = parseKey(startDate);
  return WK[new Date(s.getFullYear(), s.getMonth(), s.getDate() + day - 1).getDay()];
}

export const toMin = (t: string) => {
  const [h, m] = (t || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
export const fromMin = (n: number) => {
  const c = Math.max(0, Math.min(1425, Math.round(n / 15) * 15));
  return `${pad(Math.floor(c / 60))}:${pad(c % 60)}`;
};
export const stepTime = (t: string, delta: number) => fromMin(toMin(t) + delta);
export const fmt12 = (t: string) => {
  const m = toMin(t);
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${pad(m % 60)} ${h < 12 ? 'AM' : 'PM'}`;
};

export const mealCalories = (m: Pick<Meal, 'protein' | 'carb' | 'fat'>) =>
  Math.round(m.protein * 4 + m.carb * 4 + m.fat * 9);
export const mealCost = (m: Meal) => m.ingredients.reduce((a, i) => a + (i.price || 0), 0);
export const ingKey = (name: string) => name.trim().toLowerCase();
export const mealsForDay = (p: SupportPlan, day: number) =>
  p.meals.filter((m) => m.day === day).sort((a, b) => toMin(a.time) - toMin(b.time));

/* ---------- starter recipes ---------- */

type Kind = 'breakfast' | 'main' | 'snack';
// [name, qty, price, category, swapName?, swapPrice?]
type Ing = [string, string, number, string, string?, number?];
type Recipe = {
  kind: Kind;
  styles: DietStyle[];
  title: string;
  subtitle: string;
  p: number;
  c: number;
  f: number;
  ing: Ing[];
  prep: string[];
};

const RECIPES: Recipe[] = [
  {
    kind: 'breakfast', styles: ['wholefood', 'balanced'],
    title: 'Eggs, avocado & sweet potato', subtitle: 'Fast, filling, no grains',
    p: 28, c: 30, f: 30,
    ing: [['Eggs', '4', 1.6, 'Protein'], ['Avocado', '1', 1.25, 'Produce'], ['Sweet potato', '1 medium', 0.8, 'Produce'], ['Olive oil', '1 tbsp', 0.2, 'Fats']],
    prep: ['Bake or microwave the sweet potato.', 'Cook eggs in olive oil.', 'Slice the avocado and plate.'],
  },
  {
    kind: 'breakfast', styles: ['balanced', 'highprotein'],
    title: 'Greek yogurt bowl', subtitle: 'Five minutes, high protein',
    p: 35, c: 35, f: 8,
    ing: [['Greek yogurt', '1 cup', 1.4, 'Dairy'], ['Berries', '1 cup', 1.5, 'Produce', 'Frozen berries', 1.0], ['Oats', '1/2 cup', 0.3, 'Pantry']],
    prep: ['Spoon yogurt into a bowl.', 'Top with berries and oats.'],
  },
  {
    kind: 'breakfast', styles: ['highprotein'],
    title: 'Egg-white scramble', subtitle: 'Lean and quick',
    p: 38, c: 12, f: 10,
    ing: [['Egg whites', '1 cup', 1.2, 'Protein'], ['Spinach', '2 cups', 0.8, 'Produce'], ['Turkey sausage', '2 links', 1.5, 'Protein']],
    prep: ['Wilt the spinach in a pan.', 'Add egg whites and scramble.', 'Serve with the sausage.'],
  },
  {
    kind: 'main', styles: ['wholefood', 'balanced', 'highprotein'],
    title: 'Chicken thighs, potatoes & vegetables', subtitle: 'Batch-cook friendly',
    p: 38, c: 40, f: 22,
    ing: [['Chicken thighs', '8 oz', 2.2, 'Protein', 'Chicken drumsticks', 1.6], ['Potatoes', '1 large', 0.7, 'Produce'], ['Mixed vegetables', '1.5 cups', 1.2, 'Produce', 'Frozen vegetables', 0.8], ['Olive oil', '1 tbsp', 0.2, 'Fats']],
    prep: ['Roast chicken, potatoes and vegetables at 425°F for 35 min.', 'Portion into containers.'],
  },
  {
    kind: 'main', styles: ['wholefood', 'balanced'],
    title: 'Ground beef & sweet potato hash', subtitle: 'One pan',
    p: 34, c: 35, f: 24,
    ing: [['Ground beef', '6 oz', 2.5, 'Protein', 'Ground turkey', 2.0], ['Sweet potato', '1 medium', 0.8, 'Produce'], ['Onion', '1/2', 0.3, 'Produce'], ['Olive oil', '1 tbsp', 0.2, 'Fats']],
    prep: ['Dice the sweet potato and onion.', 'Brown the beef, then add the potato and onion.', 'Cook until the potato is tender.'],
  },
  {
    kind: 'main', styles: ['wholefood'],
    title: 'Slow-cooked pork or chuck roast bowl', subtitle: 'Cook once, eat for days',
    p: 36, c: 25, f: 26,
    ing: [['Pork shoulder', '6 oz', 2.0, 'Protein', 'Chuck roast', 2.4], ['Roasted vegetables', '1.5 cups', 1.2, 'Produce', 'Frozen vegetables', 0.8], ['Potatoes', '1 small', 0.5, 'Produce']],
    prep: ['Slow-cook the roast 6–8 hours on low.', 'Shred and portion with roasted vegetables.'],
  },
  {
    kind: 'main', styles: ['balanced', 'highprotein'],
    title: 'Chicken, rice & broccoli', subtitle: 'Classic high-protein plate',
    p: 45, c: 55, f: 8,
    ing: [['Chicken breast', '8 oz', 2.4, 'Protein'], ['Rice', '1 cup cooked', 0.4, 'Pantry'], ['Broccoli', '1.5 cups', 1.0, 'Produce', 'Frozen broccoli', 0.7]],
    prep: ['Cook and slice the chicken.', 'Steam the broccoli.', 'Plate over rice.'],
  },
  {
    kind: 'main', styles: ['balanced', 'highprotein'],
    title: 'Turkey & vegetable bowl', subtitle: 'Light, high protein',
    p: 40, c: 30, f: 14,
    ing: [['Ground turkey', '7 oz', 2.2, 'Protein'], ['Mixed vegetables', '2 cups', 1.4, 'Produce', 'Frozen vegetables', 0.9], ['Potatoes', '1 small', 0.5, 'Produce']],
    prep: ['Brown the turkey.', 'Add vegetables and cook through.', 'Serve with potato.'],
  },
  {
    kind: 'snack', styles: ['wholefood', 'balanced', 'highprotein'],
    title: 'Hard-boiled eggs & fruit', subtitle: 'Grab and go',
    p: 14, c: 20, f: 10,
    ing: [['Eggs', '2', 0.8, 'Protein'], ['Apple', '1', 0.7, 'Produce']],
    prep: ['Boil eggs ahead of time and keep them in the fridge.'],
  },
  {
    kind: 'snack', styles: ['wholefood', 'balanced'],
    title: 'Jerky & almonds', subtitle: 'Shelf-stable',
    p: 16, c: 8, f: 14,
    ing: [['Beef jerky', '2 oz', 3.0, 'Protein'], ['Almonds', '1 oz', 0.7, 'Pantry']],
    prep: ['Portion into bags.'],
  },
  {
    kind: 'snack', styles: ['balanced', 'highprotein'],
    title: 'Protein shake & banana', subtitle: 'Post-workout friendly',
    p: 30, c: 30, f: 3,
    ing: [['Whey protein', '1 scoop', 1.0, 'Pantry'], ['Banana', '1', 0.3, 'Produce'], ['Milk', '1 cup', 0.4, 'Dairy']],
    prep: ['Blend everything with ice.'],
  },
];

/* ---------- plan generation ---------- */

export const DEFAULT_PREFS: Preferences = {
  style: 'wholefood',
  mealsPerDay: 4,
  firstMeal: '07:00',
  lastMeal: '19:30',
  proteinTarget: 160,
  workout: '',
  work: '',
};

function slotKinds(n: number): Kind[] {
  switch (n) {
    case 1: return ['main'];
    case 2: return ['main', 'main'];
    case 3: return ['breakfast', 'main', 'main'];
    case 4: return ['breakfast', 'main', 'snack', 'main'];
    case 5: return ['breakfast', 'snack', 'main', 'snack', 'main'];
    default: return ['breakfast', 'snack', 'main', 'snack', 'main', 'snack'];
  }
}

export function generateMeals(p: Preferences): Meal[] {
  const kinds = slotKinds(p.mealsPerDay);
  const a = toMin(p.firstMeal);
  const b = Math.max(a, toMin(p.lastMeal));
  const out: Meal[] = [];
  for (let day = 1; day <= 7; day++) {
    kinds.forEach((kind, i) => {
      const pool = RECIPES.filter((r) => r.kind === kind && r.styles.includes(p.style));
      const list = pool.length ? pool : RECIPES.filter((r) => r.kind === kind);
      const r = list[(day - 1 + i) % list.length];
      out.push({
        id: uid(),
        day,
        time: kinds.length === 1 ? p.firstMeal : fromMin(a + ((b - a) * i) / (kinds.length - 1)),
        title: r.title,
        subtitle: r.subtitle,
        protein: r.p,
        carb: r.c,
        fat: r.f,
        ingredients: r.ing.map(([name, qty, price, cat, an, ap]) => ({
          id: uid(), name, qty, price, cat,
          ...(an ? { alt: { name: an, price: ap || 0 } } : {}),
        })),
        prep: [...r.prep],
      });
    });
  }
  return out;
}

export function prepTasksFor(meals: Meal[]): PrepTask[] {
  const names = meals.flatMap((m) => m.ingredients.map((i) => i.name.toLowerCase())).join('|');
  const t: string[] = [];
  if (/potato/.test(names)) t.push('Roast potatoes and sweet potatoes.');
  if (/chicken/.test(names)) t.push('Cook chicken for the week.');
  if (/ground (beef|turkey)/.test(names)) t.push('Brown ground beef or turkey.');
  if (/pork|chuck/.test(names)) t.push('Slow-cook pork shoulder or chuck roast.');
  if (/rice/.test(names)) t.push('Cook a batch of rice.');
  if (/egg/.test(names)) t.push('Boil eggs.');
  if (/vegetable|broccoli|spinach|onion/.test(names)) t.push('Wash, chop and roast vegetables.');
  t.push('Portion meals into containers.');
  return t.map((text) => ({ id: uid(), text, done: false }));
}

export function buildPlan(prefs: Preferences = DEFAULT_PREFS, keep?: Partial<SupportPlan>): SupportPlan {
  const meals = generateMeals(prefs);
  return {
    version: 2,
    startDate: keep?.startDate || dateKey(new Date()),
    budget: keep?.budget ?? 100,
    preferences: prefs,
    meals,
    prepTasks: prepTasksFor(meals),
    log: keep?.log || {},
    bought: {},
  };
}

/** Accepts anything stored in the database (including the old v1 shape) and returns a safe plan. */
export function normalizePlan(raw: any): SupportPlan {
  const base = buildPlan();
  if (!raw || typeof raw !== 'object') return base;
  // Reads "35", "35 g", "30–35 g" (a range becomes its average) without gluing digits together.
  // Also repairs values an earlier bug already saved as glued numbers (3035 -> 30 and 35 -> 33).
  const num = (v: any) => {
    if (typeof v === 'number') {
      if (!Number.isFinite(v) || v < 0) return 0;
      if (Number.isInteger(v) && v >= 1000 && v <= 9999) {
        const a = Math.floor(v / 100), b = v % 100;
        if (a >= 5 && b >= 5 && a <= b + 40 && b <= a + 40) return Math.round((a + b) / 2);
      }
      return Math.min(v, 400); // no single meal has more than 400 g of a macro
    }
    const found = String(v ?? '').match(/\d+(?:\.\d+)?/g);
    if (!found) return 0;
    const n = found.slice(0, 2).map(Number);
    return Math.round(n.length === 2 ? (n[0] + n[1]) / 2 : n[0]);
  };
  // Accepts "07:00", "7:00", "7:00 AM", "7 pm". Returns '' when it can't tell.
  const parseTime = (v: any) => {
    const m = String(v ?? '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (!m) return '';
    let h = Number(m[1]);
    const min = Number(m[2] || 0);
    const ap = (m[3] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h > 23 || min > 59) return '';
    return `${pad(h)}:${pad(min)}`;
  };
  const prefs: Preferences = { ...DEFAULT_PREFS, ...(raw.preferences || {}) };
  const hasMeals = Array.isArray(raw.meals);
  const parsed: Meal[] = hasMeals
    ? raw.meals.map((m: any): Meal => ({
        id: String(m.id || uid()),
        day: Math.min(7, Math.max(1, Number(m.day) || 1)),
        time: parseTime(m.time),
        title: String(m.title || 'Meal'),
        subtitle: String(m.subtitle || ''),
        protein: num(m.protein),
        carb: num(m.carb),
        fat: num(m.fat),
        ingredients: (Array.isArray(m.ingredients) ? m.ingredients : []).map((i: any): Ingredient =>
          typeof i === 'string'
            ? { id: uid(), name: i, qty: '', price: 0, cat: 'Other' }
            : { id: String(i.id || uid()), name: String(i.name || ''), qty: String(i.qty || ''), price: Number(i.price) || 0, cat: String(i.cat || 'Other'), ...(i.alt?.name ? { alt: { name: String(i.alt.name), price: Number(i.alt.price) || 0 } } : {}) }
        ),
        prep: Array.isArray(m.prep) ? m.prep.map(String) : [],
      }))
    : base.meals;
  // Any meal with no usable time is spread across the eating window, in saved order, per day.
  const meals: Meal[] = [...parsed];
  for (let d = 1; d <= 7; d++) {
    const idx = meals.map((m, i) => (m.day === d ? i : -1)).filter((i) => i >= 0);
    if (!idx.some((i) => !meals[i].time)) continue;
    const a = toMin(prefs.firstMeal);
    const b = Math.max(a, toMin(prefs.lastMeal));
    idx.forEach((mi, k) => {
      if (!meals[mi].time) meals[mi] = { ...meals[mi], time: idx.length === 1 ? prefs.firstMeal : fromMin(a + ((b - a) * k) / (idx.length - 1)) };
    });
  }
  return {
    version: 2,
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(raw.startDate) ? raw.startDate : base.startDate,
    budget: Number(raw.budget) || base.budget,
    preferences: prefs,
    meals,
    prepTasks: Array.isArray(raw.prepTasks) ? raw.prepTasks : prepTasksFor(meals),
    log: raw.log && typeof raw.log === 'object' ? raw.log : {},
    bought: raw.bought && typeof raw.bought === 'object' ? raw.bought : {},
  };
}

/* ---------- shopping ---------- */

export type ShopItem = { id: string; name: string; qty: string; cat: string; price: number; uses: number };

export function shoppingList(plan: SupportPlan): ShopItem[] {
  const map = new Map<string, ShopItem & { qtys: string[] }>();
  plan.meals.forEach((m) =>
    m.ingredients.forEach((i) => {
      if (!i.name.trim()) return;
      const k = ingKey(i.name);
      const cur = map.get(k) || { id: k, name: i.name.trim(), qty: '', cat: i.cat || 'Other', price: 0, uses: 0, qtys: [] };
      cur.price += i.price || 0;
      cur.uses += 1;
      if (i.qty && !cur.qtys.includes(i.qty)) cur.qtys.push(i.qty);
      map.set(k, cur);
    })
  );
  return [...map.values()]
    .map(({ qtys, ...rest }) => ({ ...rest, qty: qtys.slice(0, 3).join(' + ') }))
    .sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
}

export function swapSavings(plan: SupportPlan) {
  const map = new Map<string, { id: string; label: string; save: number }>();
  plan.meals.forEach((m) =>
    m.ingredients.forEach((i) => {
      if (!i.alt || i.alt.price >= i.price) return;
      const k = ingKey(i.name) + '>' + ingKey(i.alt.name);
      const cur = map.get(k) || { id: k, label: `Swap ${i.name} for ${i.alt.name}`, save: 0 };
      cur.save += i.price - i.alt.price;
      map.set(k, cur);
    })
  );
  return [...map.values()].sort((a, b) => b.save - a.save);
}

/** Applies every cheaper swap. Returns a new plan. */
export function optimizeBudget(plan: SupportPlan): SupportPlan {
  return {
    ...plan,
    bought: {},
    meals: plan.meals.map((m) => ({
      ...m,
      ingredients: m.ingredients.map((i) =>
        i.alt && i.alt.price < i.price ? { ...i, name: i.alt.name, price: i.alt.price, alt: undefined } : i
      ),
    })),
  };
}

/* ---------- today's intelligence ---------- */

export function evaluatePlan(plan: SupportPlan, day: number, key: string, nowMin: number) {
  const meals = mealsForDay(plan, day);
  const log = plan.log[key] || {};
  const doneMeals = meals.filter((m) => log[m.id]);
  const pending = meals.filter((m) => !log[m.id]);
  const upcoming = pending.find((m) => toMin(m.time) >= nowMin - 30);
  const next = upcoming || pending[0] || null;
  const late = !!next && !upcoming;

  const missing = next
    ? [...new Set(next.ingredients.filter((i) => i.name.trim() && !plan.bought[ingKey(i.name)]).map((i) => i.name.trim()))]
    : [];

  const list = shoppingList(plan);
  const total = list.reduce((a, i) => a + i.price, 0);
  const planned = meals.reduce((a, m) => a + m.protein, 0);
  const eaten = doneMeals.reduce((a, m) => a + m.protein, 0);

  return {
    meals,
    next,
    late,
    allDone: meals.length > 0 && pending.length === 0,
    adherence: meals.length ? Math.round((doneMeals.length / meals.length) * 100) : 0,
    doneCount: doneMeals.length,
    proteinPlanned: planned,
    proteinEaten: eaten,
    proteinGap: Math.max(0, plan.preferences.proteinTarget - planned),
    blocked: next && missing.length ? `Before ${fmt12(next.time)}: you still need ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ` +${missing.length - 4} more` : ''}.` : '',
    total,
    remaining: plan.budget - total,
    over: plan.budget > 0 && total > plan.budget,
    bought: list.filter((i) => plan.bought[i.id]).length,
    listCount: list.length,
    savings: swapSavings(plan),
  };
}
