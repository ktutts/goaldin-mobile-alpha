// lib/smartPlan.ts
// Data model + logic for the Nutrition / Shopping support plan.
// No React in here, so it is easy to test.

export type DietStyle = 'wholefood' | 'balanced' | 'highprotein' | 'keto' | 'carnivore' | 'vegetarian' | 'vegan' | 'mediterranean';
export type DietaryRule = 'glutenfree' | 'dairyfree' | 'nutfree' | 'soyfree' | 'eggfree' | 'kosher' | 'halal' | 'nopork' | 'noshellfish' | 'nobeef' | 'nomeat' | 'nofish' | 'norootveg' | 'noalcohol' | 'separatemeatdairy' | 'fastingplant';
export const RULE_LABEL: Record<DietaryRule, string> = {
  glutenfree: 'Gluten-free', dairyfree: 'Dairy-free', nutfree: 'Nut-free', soyfree: 'Soy-free', eggfree: 'Egg-free',
  kosher: 'Kosher sourcing / preparation', halal: 'Halal sourcing / preparation',
  nopork: 'No pork', noshellfish: 'No shellfish', nobeef: 'No beef', nomeat: 'No meat or poultry',
  nofish: 'No fish or seafood', norootveg: 'No root vegetables', noalcohol: 'No alcohol ingredients',
  separatemeatdairy: 'No meat and dairy in one meal', fastingplant: 'Plant-based fasting meals',
};
export type DietGuide = 'kosher' | 'halal' | 'hindu' | 'jain' | 'buddhist' | 'orthodox' | 'lent' | 'adventist' | 'plantfast';
export const DIET_GUIDES: Record<DietGuide, { label: string; style?: DietStyle; rules: DietaryRule[] }> = {
  kosher: { label: 'Kosher practices', rules: ['kosher','nopork','noshellfish','separatemeatdairy'] },
  halal: { label: 'Halal practices', rules: ['halal','nopork','noalcohol'] },
  hindu: { label: 'Hindu vegetarian example', style: 'vegetarian', rules: ['nomeat','nofish','nobeef'] },
  jain: { label: 'Jain-style example', style: 'vegan', rules: ['nomeat','nofish','eggfree','norootveg'] },
  buddhist: { label: 'Buddhist vegetarian example', style: 'vegetarian', rules: ['nomeat','nofish'] },
  orthodox: { label: 'Orthodox plant-based fasting example', style: 'vegan', rules: ['fastingplant','dairyfree','eggfree'] },
  lent: { label: 'Lenten meat-free example', style: 'vegetarian', rules: ['nomeat'] },
  adventist: { label: 'Adventist vegetarian example', style: 'vegetarian', rules: ['nomeat','nofish'] },
  plantfast: { label: 'Plant-based fasting', style: 'vegan', rules: ['fastingplant','dairyfree','eggfree'] },
};

export const RULE_NOTE = 'These are recipe-screening aids, not certification. Verify product labels, sourcing, cross-contact, equipment and preparation. Kosher/halal status cannot be confirmed here. Fasting practices and traditions vary; review every suggested setting.';

export const STYLE_LABEL: Record<DietStyle, string> = {
  wholefood: 'Whole-food, grain-free',
  balanced: 'Balanced',
  highprotein: 'High protein',
  keto: 'Keto', carnivore: 'Carnivore', vegetarian: 'Vegetarian', vegan: 'Vegan', mediterranean: 'Mediterranean',
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
  rules: DietaryRule[];
  mealsPerDay: number;
  firstMeal: string;
  lastMeal: string;
  proteinTarget: number;
  calorieTarget: number;
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
  diningOutCost?: number; // user-entered typical alternative meal cost, not a verified saving
  onHand?: Record<string, boolean>; // confirmed enough of this ingredient for the current week
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
  { kind: 'breakfast', styles: ['keto', 'vegetarian'], title: 'Spinach and avocado eggs', subtitle: 'Low-carb breakfast', p: 24, c: 8, f: 30, ing: [['Eggs','3',1.2,'Protein'],['Spinach','2 cups',0.8,'Produce'],['Avocado','1/2',0.7,'Produce'],['Olive oil','1 tbsp',0.2,'Fats']], prep: ['Cook spinach in olive oil.', 'Scramble eggs until set.', 'Serve with sliced avocado.'] },
  { kind: 'main', styles: ['keto'], title: 'Salmon and asparagus', subtitle: 'Low-carb dinner', p: 40, c: 7, f: 26, ing: [['Salmon','7 oz',4.3,'Protein'],['Asparagus','1 cup',1.5,'Produce'],['Olive oil','1 tbsp',0.2,'Fats']], prep: ['Roast salmon until cooked through.', 'Roast asparagus with olive oil.', 'Serve together.'] },
  { kind: 'snack', styles: ['keto', 'vegetarian'], title: 'Cucumber and avocado', subtitle: 'Simple low-carb snack', p: 3, c: 11, f: 15, ing: [['Cucumber','1',0.7,'Produce'],['Avocado','1',1.25,'Produce']], prep: ['Slice cucumber and avocado.', 'Serve chilled.'] },
  { kind: 'breakfast', styles: ['carnivore'], title: 'Eggs and beef patties', subtitle: 'Animal-based breakfast', p: 42, c: 2, f: 34, ing: [['Eggs','3',1.2,'Protein'],['Ground beef','6 oz',2.5,'Protein']], prep: ['Cook beef patties thoroughly.', 'Cook eggs to preference.'] },
  { kind: 'main', styles: ['carnivore'], title: 'Seared beef steak', subtitle: 'Simple animal-based meal', p: 52, c: 0, f: 27, ing: [['Beef steak','8 oz',6.0,'Protein']], prep: ['Season as preferred.', 'Cook steak to a safe temperature.'] },
  { kind: 'snack', styles: ['carnivore'], title: 'Hard-boiled eggs', subtitle: 'Prepare ahead', p: 18, c: 2, f: 15, ing: [['Eggs','3',1.2,'Protein']], prep: ['Boil eggs and refrigerate promptly.'] },
  { kind: 'breakfast', styles: ['vegan'], title: 'Berry oat bowl', subtitle: 'Plant-based breakfast', p: 12, c: 48, f: 10, ing: [['Oats','1/2 cup',0.3,'Pantry'],['Berries','1 cup',1.5,'Produce'],['Pumpkin seeds','2 tbsp',0.5,'Pantry'],['Water','1 cup',0,'Other']], prep: ['Cook oats in water.', 'Top with berries and pumpkin seeds.'] },
  { kind: 'main', styles: ['vegan', 'vegetarian', 'mediterranean'], title: 'Lentil and vegetable bowl', subtitle: 'Plant-based and filling', p: 22, c: 58, f: 12, ing: [['Lentils','1 cup cooked',0.8,'Pantry'],['Tomatoes','1 cup',0.8,'Produce'],['Spinach','2 cups',0.8,'Produce'],['Olive oil','1 tbsp',0.2,'Fats']], prep: ['Cook lentils until tender.', 'Sauté vegetables.', 'Combine with olive oil.'] },
  { kind: 'snack', styles: ['vegan', 'vegetarian', 'mediterranean'], title: 'Apple and pumpkin seeds', subtitle: 'Quick plant-based snack', p: 8, c: 28, f: 13, ing: [['Apple','1',0.7,'Produce'],['Pumpkin seeds','1 oz',0.8,'Pantry']], prep: ['Slice apple and portion seeds.'] },
  { kind: 'breakfast', styles: ['vegetarian', 'mediterranean'], title: 'Greek yogurt and berries', subtitle: 'Simple breakfast', p: 25, c: 25, f: 6, ing: [['Greek yogurt','1 cup',1.4,'Dairy'],['Berries','1 cup',1.5,'Produce']], prep: ['Spoon yogurt into a bowl.', 'Top with berries.'] },
  { kind: 'main', styles: ['vegetarian'], title: 'Egg and vegetable skillet', subtitle: 'Meat-free dinner', p: 25, c: 20, f: 22, ing: [['Eggs','3',1.2,'Protein'],['Potatoes','1 small',0.5,'Produce'],['Spinach','2 cups',0.8,'Produce']], prep: ['Cook diced potatoes until tender.', 'Add spinach and eggs.', 'Cook eggs thoroughly.'] },
  { kind: 'breakfast', styles: ['mediterranean'], title: 'Tomato and egg toast', subtitle: 'Mediterranean breakfast', p: 21, c: 28, f: 16, ing: [['Eggs','2',0.8,'Protein'],['Tomatoes','1 cup',0.8,'Produce'],['Whole wheat bread','2 slices',0.6,'Pantry'],['Olive oil','1 tsp',0.1,'Fats']], prep: ['Toast bread.', 'Cook eggs.', 'Serve with tomatoes and olive oil.'] },
  { kind: 'main', styles: ['mediterranean'], title: 'Lemon salmon and greens', subtitle: 'Mediterranean plate', p: 42, c: 16, f: 22, ing: [['Salmon','7 oz',4.3,'Protein'],['Mixed greens','2 cups',1.2,'Produce'],['Lemon','1/2',0.3,'Produce'],['Olive oil','1 tbsp',0.2,'Fats']], prep: ['Cook salmon thoroughly.', 'Toss greens with lemon and olive oil.'] },


  { kind: 'main', styles: ['keto'], title: 'Beef lettuce bowls', subtitle: 'Low-carb weeknight main', p: 42, c: 8, f: 28, ing: [['Ground beef','7 oz',2.8,'Protein'],['Lettuce','2 cups',0.8,'Produce'],['Avocado','1/2',0.7,'Produce']], prep: ['Brown beef thoroughly.', 'Serve in lettuce with avocado.'] },
  { kind: 'main', styles: ['vegan'], title: 'Black bean tofu skillet', subtitle: 'Plant-protein main', p: 30, c: 44, f: 16, ing: [['Firm tofu','6 oz',1.5,'Protein'],['Black beans','3/4 cup',0.8,'Pantry'],['Bell pepper','1',0.9,'Produce'],['Olive oil','1 tsp',0.1,'Fats']], prep: ['Cook tofu and pepper in a skillet.', 'Add drained beans and heat through.'] },
  { kind: 'breakfast', styles: ['carnivore'], title: 'Turkey patties and eggs', subtitle: 'Animal-based breakfast', p: 44, c: 2, f: 24, ing: [['Ground turkey','7 oz',2.2,'Protein'],['Eggs','2',0.8,'Protein']], prep: ['Cook turkey patties thoroughly.', 'Cook eggs until set.'] },
  { kind: 'main', styles: ['carnivore'], title: 'Roasted chicken thighs', subtitle: 'Simple animal-based main', p: 46, c: 0, f: 29, ing: [['Chicken thighs','9 oz',2.5,'Protein']], prep: ['Roast chicken until cooked through.'] },
  { kind: 'snack', styles: ['carnivore'], title: 'Turkey slices', subtitle: 'Simple protein snack', p: 25, c: 1, f: 3, ing: [['Roasted turkey','4 oz',2.1,'Protein']], prep: ['Slice cooked turkey and refrigerate promptly.'] },
  // Additional complete recipes to avoid repeating the same day in narrow diet styles.
  { kind: 'breakfast', styles: ['keto'], title: 'Smoked salmon and eggs', subtitle: 'Protein-forward, low carb', p: 35, c: 4, f: 25, ing: [['Eggs','3',1.2,'Protein'],['Smoked salmon','3 oz',3.1,'Protein'],['Spinach','1 cup',0.4,'Produce']], prep: ['Scramble eggs with spinach.', 'Serve with smoked salmon; check package labels.'] },
  { kind: 'main', styles: ['keto'], title: 'Chicken with zucchini', subtitle: 'Easy low-carb skillet', p: 45, c: 9, f: 22, ing: [['Chicken thighs','8 oz',2.2,'Protein'],['Zucchini','2 cups',1.3,'Produce'],['Olive oil','1 tbsp',0.2,'Fats']], prep: ['Cook chicken thoroughly.', 'Sauté zucchini in olive oil.', 'Serve together.'] },
  { kind: 'snack', styles: ['keto'], title: 'Boiled eggs and olives', subtitle: 'Quick savory snack', p: 13, c: 3, f: 17, ing: [['Eggs','2',0.8,'Protein'],['Olives','10',0.7,'Pantry']], prep: ['Boil eggs until set.', 'Serve with olives.'] },
  { kind: 'breakfast', styles: ['vegan'], title: 'Tofu spinach scramble', subtitle: 'Savory plant-based breakfast', p: 24, c: 15, f: 15, ing: [['Firm tofu','7 oz',1.7,'Protein'],['Spinach','2 cups',0.8,'Produce'],['Tomatoes','1/2 cup',0.4,'Produce'],['Olive oil','1 tsp',0.1,'Fats']], prep: ['Crumble tofu.', 'Sauté vegetables and tofu until heated through.'] },
  { kind: 'main', styles: ['vegan', 'vegetarian'], title: 'Chickpea quinoa bowl', subtitle: 'Plant-based main', p: 21, c: 65, f: 14, ing: [['Chickpeas','1 cup',0.9,'Pantry'],['Quinoa','3/4 cup cooked',0.9,'Pantry'],['Cucumber','1/2',0.35,'Produce'],['Olive oil','1 tbsp',0.2,'Fats']], prep: ['Cook quinoa.', 'Drain and rinse chickpeas.', 'Combine with cucumber and olive oil.'] },
  { kind: 'snack', styles: ['vegan'], title: 'Edamame and berries', subtitle: 'Plant protein snack', p: 18, c: 22, f: 6, ing: [['Edamame','1 cup',1.3,'Frozen'],['Berries','1/2 cup',0.75,'Produce']], prep: ['Cook edamame as directed.', 'Serve with berries.'] },

  // Expanded V8 starter library. Portion costs and nutrition are illustrative estimates.
  {kind: "breakfast", styles: ["wholefood", "balanced", "highprotein"], title: "Turkey sweet potato skillet", subtitle: "Hearty morning skillet", p: 38, c: 32, f: 16, ing: [["Ground turkey", "6 oz", 1.9, "Protein"], ["Sweet potato", "1 medium", 0.8, "Produce"], ["Spinach", "1 cup", 0.4, "Produce"], ["Olive oil", "1 tsp", 0.1, "Fats"]], prep: ["Dice and cook sweet potato until tender.", "Brown turkey thoroughly and wilt spinach.", "Combine and serve."]},
  {kind: "breakfast", styles: ["wholefood", "balanced", "highprotein"], title: "Chicken breakfast hash", subtitle: "Savory protein breakfast", p: 41, c: 25, f: 14, ing: [["Chicken breast", "6 oz", 1.9, "Protein"], ["Potatoes", "1 small", 0.5, "Produce"], ["Bell pepper", "1/2", 0.45, "Produce"], ["Olive oil", "1 tsp", 0.1, "Fats"]], prep: ["Cook diced potatoes until tender.", "Cook chicken thoroughly with peppers.", "Combine and season."]},
  {kind: "main", styles: ["wholefood", "balanced", "highprotein"], title: "Turkey meatballs and roasted carrots", subtitle: "Batch-cook dinner", p: 43, c: 27, f: 15, ing: [["Ground turkey", "7 oz", 2.2, "Protein"], ["Carrots", "2 cups", 0.8, "Produce"], ["Zucchini", "1 cup", 0.65, "Produce"], ["Olive oil", "1 tsp", 0.1, "Fats"]], prep: ["Form turkey into meatballs and cook to 165°F.", "Roast carrots and zucchini until tender.", "Portion and serve."]},
  {kind: "main", styles: ["wholefood", "balanced", "highprotein"], title: "Pork tenderloin and apple slaw", subtitle: "Lean protein plate", p: 44, c: 25, f: 14, ing: [["Pork tenderloin", "7 oz", 2.9, "Protein"], ["Cabbage", "2 cups", 0.7, "Produce"], ["Apple", "1", 0.7, "Produce"], ["Olive oil", "1 tsp", 0.1, "Fats"]], prep: ["Cook pork to 145°F and rest at least 3 minutes.", "Shred cabbage and slice apple.", "Toss slaw with oil and serve."]},
  {kind: "main", styles: ["wholefood", "balanced", "highprotein"], title: "Chicken fajita vegetable bowl", subtitle: "Grain-free option", p: 45, c: 24, f: 14, ing: [["Chicken thighs", "8 oz", 2.2, "Protein"], ["Bell pepper", "1", 0.9, "Produce"], ["Onion", "1/2", 0.3, "Produce"], ["Avocado", "1/2", 0.7, "Produce"]], prep: ["Cook chicken thoroughly and slice.", "Sauté peppers and onions.", "Top with avocado."]},
  {kind: "main", styles: ["wholefood", "balanced", "highprotein"], title: "Beef and broccoli skillet", subtitle: "Quick skillet", p: 42, c: 20, f: 20, ing: [["Ground beef", "7 oz", 2.8, "Protein"], ["Broccoli", "2 cups", 1.2, "Produce"], ["Carrots", "1 cup", 0.4, "Produce"], ["Olive oil", "1 tsp", 0.1, "Fats"]], prep: ["Brown beef thoroughly.", "Steam broccoli and carrots.", "Combine and season."]},
  {kind: "snack", styles: ["wholefood", "balanced", "highprotein"], title: "Turkey roll-ups and apple", subtitle: "Portable protein", p: 26, c: 24, f: 4, ing: [["Roasted turkey", "4 oz", 2.1, "Protein"], ["Apple", "1", 0.7, "Produce"]], prep: ["Check turkey label and portion.", "Serve with sliced apple."]},
  {kind: "snack", styles: ["wholefood", "balanced", "highprotein"], title: "Chicken and cucumber bites", subtitle: "Savory mini meal", p: 29, c: 8, f: 6, ing: [["Chicken breast", "4 oz", 1.3, "Protein"], ["Cucumber", "1", 0.7, "Produce"], ["Olive oil", "1 tsp", 0.1, "Fats"]], prep: ["Use fully cooked chicken.", "Slice cucumber and portion."]},
  {kind: "breakfast", styles: ["balanced", "highprotein", "vegetarian"], title: "Cottage cheese banana bowl", subtitle: "Easy high-protein breakfast", p: 30, c: 35, f: 9, ing: [["Cottage cheese", "1 cup", 1.5, "Dairy"], ["Banana", "1", 0.3, "Produce"], ["Pumpkin seeds", "2 tbsp", 0.5, "Pantry"]], prep: ["Spoon cottage cheese into a bowl.", "Slice banana and add seeds."]},
  {kind: "main", styles: ["balanced", "highprotein"], title: "Tuna rice and cucumber bowl", subtitle: "Pantry-friendly lunch", p: 43, c: 52, f: 9, ing: [["Canned tuna", "2 cans", 2.4, "Protein"], ["Rice", "1 cup cooked", 0.4, "Pantry"], ["Cucumber", "1", 0.7, "Produce"], ["Olive oil", "1 tsp", 0.1, "Fats"]], prep: ["Cook rice and cool safely.", "Drain tuna and slice cucumber.", "Combine and serve."]},
  {kind: "main", styles: ["balanced", "highprotein"], title: "Turkey chili and beans", subtitle: "Freezer friendly", p: 43, c: 48, f: 13, ing: [["Ground turkey", "7 oz", 2.2, "Protein"], ["Kidney beans", "3/4 cup", 0.65, "Pantry"], ["Tomatoes", "1 cup", 0.8, "Produce"], ["Onion", "1/2", 0.3, "Produce"]], prep: ["Brown turkey thoroughly.", "Add beans, tomatoes and onion.", "Simmer until heated through."]},
  {kind: "main", styles: ["balanced", "highprotein"], title: "Chicken pasta and spinach", subtitle: "Weeknight pasta", p: 48, c: 60, f: 11, ing: [["Chicken breast", "8 oz", 2.4, "Protein"], ["Pasta", "2 oz dry", 0.45, "Pantry"], ["Spinach", "2 cups", 0.8, "Produce"], ["Tomatoes", "1/2 cup", 0.4, "Produce"]], prep: ["Cook pasta according to package.", "Cook chicken thoroughly.", "Toss with sautéed spinach and tomatoes."]},
  {kind: "snack", styles: ["balanced", "highprotein", "vegetarian"], title: "Greek yogurt and pumpkin seeds", subtitle: "Protein-rich snack", p: 26, c: 17, f: 10, ing: [["Greek yogurt", "1 cup", 1.4, "Dairy"], ["Pumpkin seeds", "1 oz", 0.8, "Pantry"]], prep: ["Top yogurt with seeds."]},
  {kind: "snack", styles: ["balanced", "highprotein"], title: "Tuna and crackers", subtitle: "Easy pantry snack", p: 25, c: 22, f: 6, ing: [["Canned tuna", "1 can", 1.2, "Protein"], ["Whole grain crackers", "8", 0.5, "Pantry"]], prep: ["Drain tuna and serve with crackers."]},
  {kind: "breakfast", styles: ["keto"], title: "Mushroom cheese omelet", subtitle: "Low-carb breakfast", p: 30, c: 7, f: 29, ing: [["Eggs", "3", 1.2, "Protein"], ["Mushrooms", "1 cup", 0.8, "Produce"], ["Cheddar cheese", "1 oz", 0.5, "Dairy"], ["Olive oil", "1 tsp", 0.1, "Fats"]], prep: ["Sauté mushrooms.", "Add beaten eggs and cook until set.", "Fold in cheese."]},
  {kind: "breakfast", styles: ["keto"], title: "Turkey avocado breakfast plate", subtitle: "No-grain breakfast", p: 34, c: 7, f: 27, ing: [["Roasted turkey", "5 oz", 2.6, "Protein"], ["Avocado", "1", 1.25, "Produce"], ["Cucumber", "1/2", 0.35, "Produce"]], prep: ["Check turkey package ingredients.", "Slice avocado and cucumber.", "Serve chilled."]},
  {kind: "main", styles: ["keto"], title: "Garlic chicken and cauliflower", subtitle: "Low-carb sheet pan", p: 45, c: 10, f: 25, ing: [["Chicken thighs", "8 oz", 2.2, "Protein"], ["Cauliflower", "2 cups", 1.2, "Produce"], ["Olive oil", "1 tbsp", 0.2, "Fats"]], prep: ["Roast chicken to 165°F.", "Roast cauliflower with olive oil.", "Season and serve."]},
  {kind: "main", styles: ["keto"], title: "Turkey burger lettuce plate", subtitle: "Bunless burger", p: 44, c: 8, f: 22, ing: [["Ground turkey", "8 oz", 2.5, "Protein"], ["Lettuce", "2 cups", 0.8, "Produce"], ["Cheddar cheese", "1 oz", 0.5, "Dairy"], ["Avocado", "1/2", 0.7, "Produce"]], prep: ["Form turkey burger and cook to 165°F.", "Serve in lettuce with cheese and avocado."]},
  {kind: "main", styles: ["keto"], title: "Pork chops and green beans", subtitle: "Simple low-carb dinner", p: 46, c: 10, f: 23, ing: [["Pork chops", "8 oz", 3.2, "Protein"], ["Green beans", "2 cups", 1.1, "Produce"], ["Olive oil", "1 tbsp", 0.2, "Fats"]], prep: ["Cook pork to 145°F and rest 3 minutes.", "Sauté green beans and serve."]},
  {kind: "main", styles: ["keto"], title: "Beef mushroom skillet", subtitle: "One-pan low-carb meal", p: 43, c: 9, f: 30, ing: [["Ground beef", "7 oz", 2.8, "Protein"], ["Mushrooms", "2 cups", 1.6, "Produce"], ["Spinach", "1 cup", 0.4, "Produce"]], prep: ["Brown beef thoroughly.", "Cook mushrooms and spinach in same pan."]},
  {kind: "snack", styles: ["keto"], title: "Cheese cucumber plate", subtitle: "Easy savory snack", p: 13, c: 7, f: 18, ing: [["Cheddar cheese", "2 oz", 1, "Dairy"], ["Cucumber", "1", 0.7, "Produce"]], prep: ["Slice and serve chilled."]},
  {kind: "snack", styles: ["keto"], title: "Turkey and olives", subtitle: "Portable low-carb snack", p: 22, c: 3, f: 11, ing: [["Roasted turkey", "4 oz", 2.1, "Protein"], ["Olives", "10", 0.7, "Pantry"]], prep: ["Check turkey labels.", "Portion turkey and olives."]},
  {kind: "breakfast", styles: ["carnivore"], title: "Chicken and scrambled eggs", subtitle: "Animal-based breakfast", p: 48, c: 2, f: 25, ing: [["Chicken thighs", "6 oz", 1.8, "Protein"], ["Eggs", "3", 1.2, "Protein"]], prep: ["Cook chicken thoroughly.", "Scramble eggs until set."]},
  {kind: "breakfast", styles: ["carnivore"], title: "Beef and turkey breakfast patties", subtitle: "High-protein morning", p: 48, c: 1, f: 27, ing: [["Ground beef", "4 oz", 1.7, "Protein"], ["Ground turkey", "4 oz", 1.3, "Protein"]], prep: ["Form separate patties.", "Cook beef and turkey to their safe internal temperatures."]},
  {kind: "main", styles: ["carnivore"], title: "Pork tenderloin slices", subtitle: "Lean animal-based meal", p: 49, c: 0, f: 15, ing: [["Pork tenderloin", "9 oz", 3.7, "Protein"]], prep: ["Cook pork to 145°F and rest 3 minutes.", "Slice and serve."]},
  {kind: "main", styles: ["carnivore"], title: "Turkey burger patties", subtitle: "Simple batch-cook protein", p: 51, c: 0, f: 18, ing: [["Ground turkey", "9 oz", 2.8, "Protein"]], prep: ["Form patties and cook to 165°F.", "Refrigerate leftovers promptly."]},
  {kind: "main", styles: ["carnivore"], title: "Salmon and eggs", subtitle: "Protein-rich dinner", p: 49, c: 2, f: 30, ing: [["Salmon", "7 oz", 4.3, "Protein"], ["Eggs", "2", 0.8, "Protein"]], prep: ["Cook salmon thoroughly.", "Cook eggs to preference."]},
  {kind: "main", styles: ["carnivore"], title: "Chicken breast and beef", subtitle: "Two-protein plate", p: 58, c: 0, f: 21, ing: [["Chicken breast", "6 oz", 1.9, "Protein"], ["Ground beef", "4 oz", 1.7, "Protein"]], prep: ["Cook chicken to 165°F.", "Brown beef thoroughly."]},
  {kind: "snack", styles: ["carnivore"], title: "Cooked chicken strips", subtitle: "Cold protein snack", p: 30, c: 0, f: 4, ing: [["Chicken breast", "5 oz", 1.6, "Protein"]], prep: ["Cook chicken to 165°F.", "Cool and refrigerate promptly."]},
  {kind: "snack", styles: ["carnivore"], title: "Salmon leftovers", subtitle: "Simple protein portion", p: 26, c: 0, f: 10, ing: [["Salmon", "4 oz", 2.5, "Protein"]], prep: ["Use fully cooked, safely refrigerated salmon."]},
  {kind: "breakfast", styles: ["vegan"], title: "Peanut butter banana oats", subtitle: "Budget-friendly plant breakfast", p: 18, c: 58, f: 17, ing: [["Oats", "1/2 cup", 0.3, "Pantry"], ["Peanut butter", "2 tbsp", 0.4, "Pantry"], ["Banana", "1", 0.3, "Produce"], ["Pumpkin seeds", "1 tbsp", 0.25, "Pantry"]], prep: ["Cook oats with water.", "Stir in peanut butter and top with banana and seeds."]},
  {kind: "breakfast", styles: ["vegan"], title: "Chickpea breakfast hash", subtitle: "Savory plant breakfast", p: 20, c: 44, f: 13, ing: [["Chickpeas", "1 cup", 0.9, "Pantry"], ["Potatoes", "1 small", 0.5, "Produce"], ["Bell pepper", "1/2", 0.45, "Produce"], ["Olive oil", "1 tsp", 0.1, "Fats"]], prep: ["Cook potatoes until tender.", "Sauté chickpeas and pepper.", "Combine and season."]},
  {kind: "breakfast", styles: ["vegan"], title: "Quinoa berry seed bowl", subtitle: "Grain-and-seed breakfast", p: 17, c: 50, f: 14, ing: [["Quinoa", "1 cup cooked", 1.2, "Pantry"], ["Berries", "1 cup", 1.5, "Produce"], ["Pumpkin seeds", "1 oz", 0.8, "Pantry"]], prep: ["Cook quinoa.", "Top with berries and seeds."]},
  {kind: "main", styles: ["vegan", "vegetarian", "mediterranean"], title: "White bean tomato stew", subtitle: "Low-cost pantry dinner", p: 23, c: 57, f: 11, ing: [["White beans", "1.5 cups", 1.2, "Pantry"], ["Tomatoes", "1 cup", 0.8, "Produce"], ["Spinach", "2 cups", 0.8, "Produce"], ["Olive oil", "1 tbsp", 0.2, "Fats"]], prep: ["Simmer beans and tomatoes.", "Wilt spinach and finish with olive oil."]},
  {kind: "main", styles: ["vegan", "vegetarian"], title: "Lentil sweet potato curry", subtitle: "Filling plant-based meal", p: 24, c: 68, f: 12, ing: [["Lentils", "1 cup cooked", 0.8, "Pantry"], ["Sweet potato", "1 medium", 0.8, "Produce"], ["Tomatoes", "1 cup", 0.8, "Produce"], ["Olive oil", "1 tbsp", 0.2, "Fats"]], prep: ["Cook lentils and diced sweet potato until tender.", "Simmer with tomatoes and seasonings."]},
  {kind: "main", styles: ["vegan", "vegetarian"], title: "Tofu broccoli rice bowl", subtitle: "Plant-protein classic", p: 29, c: 55, f: 16, ing: [["Firm tofu", "8 oz", 1.9, "Protein"], ["Rice", "1 cup cooked", 0.4, "Pantry"], ["Broccoli", "2 cups", 1.2, "Produce"], ["Olive oil", "1 tsp", 0.1, "Fats"]], prep: ["Cook rice.", "Sear tofu and steam broccoli.", "Serve together."]},
  {kind: "main", styles: ["vegan", "vegetarian", "mediterranean"], title: "Chickpea spinach pasta", subtitle: "Plant-based pasta", p: 25, c: 65, f: 13, ing: [["Chickpeas", "1 cup", 0.9, "Pantry"], ["Pasta", "2 oz dry", 0.45, "Pantry"], ["Spinach", "2 cups", 0.8, "Produce"], ["Olive oil", "1 tbsp", 0.2, "Fats"]], prep: ["Cook pasta.", "Warm chickpeas and spinach.", "Toss with olive oil."]},
  {kind: "main", styles: ["vegan", "vegetarian"], title: "Black bean potato bowls", subtitle: "Budget-conscious dinner", p: 22, c: 60, f: 12, ing: [["Black beans", "1 cup", 1.0, "Pantry"], ["Potatoes", "1 large", 0.7, "Produce"], ["Tomatoes", "1 cup", 0.8, "Produce"], ["Olive oil", "1 tbsp", 0.2, "Fats"]], prep: ["Roast potatoes until tender.", "Warm beans and tomatoes.", "Combine and serve."]},
  {kind: "snack", styles: ["vegan", "vegetarian"], title: "Roasted chickpeas", subtitle: "Crunchy budget snack", p: 13, c: 28, f: 7, ing: [["Chickpeas", "3/4 cup", 0.7, "Pantry"], ["Olive oil", "1 tsp", 0.1, "Fats"]], prep: ["Drain and dry chickpeas.", "Roast until crisp, stirring occasionally."]},
  {kind: "snack", styles: ["vegan", "vegetarian"], title: "Hummus carrots and cucumber", subtitle: "Fresh plant snack", p: 10, c: 24, f: 10, ing: [["Hummus", "1/2 cup", 1.2, "Pantry"], ["Carrots", "1 cup", 0.4, "Produce"], ["Cucumber", "1/2", 0.35, "Produce"]], prep: ["Wash and slice vegetables.", "Serve with hummus."]},
  {kind: "snack", styles: ["vegan"], title: "Peanut butter apple slices", subtitle: "Quick plant snack", p: 9, c: 30, f: 16, ing: [["Peanut butter", "2 tbsp", 0.4, "Pantry"], ["Apple", "1", 0.7, "Produce"]], prep: ["Slice apple and serve with peanut butter."]},
  {kind: "snack", styles: ["vegan"], title: "Edamame pumpkin seed cup", subtitle: "Higher-protein plant snack", p: 22, c: 18, f: 12, ing: [["Edamame", "1 cup", 1.3, "Frozen"], ["Pumpkin seeds", "2 tbsp", 0.5, "Pantry"]], prep: ["Cook edamame as directed.", "Top with pumpkin seeds."]},
  {kind: "breakfast", styles: ["vegetarian"], title: "Egg spinach breakfast wrap", subtitle: "Quick vegetarian breakfast", p: 27, c: 34, f: 18, ing: [["Eggs", "3", 1.2, "Protein"], ["Whole wheat tortilla", "1", 0.5, "Pantry"], ["Spinach", "1 cup", 0.4, "Produce"], ["Cheddar cheese", "1 oz", 0.5, "Dairy"]], prep: ["Scramble eggs and spinach.", "Add cheese and wrap in tortilla."]},
  {kind: "breakfast", styles: ["vegetarian"], title: "Cottage cheese berry toast", subtitle: "Simple morning meal", p: 29, c: 36, f: 9, ing: [["Cottage cheese", "1 cup", 1.5, "Dairy"], ["Berries", "1/2 cup", 0.75, "Produce"], ["Whole wheat bread", "2 slices", 0.6, "Pantry"]], prep: ["Toast bread.", "Serve with cottage cheese and berries."]},
  {kind: "main", styles: ["vegetarian"], title: "Black bean egg tacos", subtitle: "Meat-free protein dinner", p: 28, c: 47, f: 19, ing: [["Eggs", "3", 1.2, "Protein"], ["Black beans", "3/4 cup", 0.8, "Pantry"], ["Corn tortillas", "2", 0.4, "Pantry"], ["Tomatoes", "1/2 cup", 0.4, "Produce"]], prep: ["Cook eggs thoroughly.", "Warm beans and tortillas.", "Assemble tacos with tomatoes."]},
  {kind: "main", styles: ["vegetarian"], title: "Cottage cheese baked potato", subtitle: "Easy filling lunch", p: 30, c: 52, f: 9, ing: [["Potatoes", "1 large", 0.7, "Produce"], ["Cottage cheese", "1 cup", 1.5, "Dairy"], ["Broccoli", "1 cup", 0.6, "Produce"]], prep: ["Bake potato until tender.", "Steam broccoli.", "Top with cottage cheese."]},
  {kind: "main", styles: ["vegetarian"], title: "Eggplant chickpea skillet", subtitle: "Vegetable-forward main", p: 21, c: 49, f: 17, ing: [["Eggplant", "1 cup", 1.2, "Produce"], ["Chickpeas", "1 cup", 0.9, "Pantry"], ["Tomatoes", "1 cup", 0.8, "Produce"], ["Olive oil", "1 tbsp", 0.2, "Fats"]], prep: ["Sauté eggplant until tender.", "Add chickpeas and tomatoes and simmer."]},
  {kind: "snack", styles: ["vegetarian"], title: "Cottage cheese and apple", subtitle: "Protein-forward snack", p: 26, c: 28, f: 5, ing: [["Cottage cheese", "1 cup", 1.5, "Dairy"], ["Apple", "1", 0.7, "Produce"]], prep: ["Slice apple and serve with cottage cheese."]},
  {kind: "breakfast", styles: ["mediterranean"], title: "Overnight oats with berries", subtitle: "Prepare ahead", p: 18, c: 49, f: 13, ing: [["Oats", "1/2 cup", 0.3, "Pantry"], ["Greek yogurt", "3/4 cup", 1.1, "Dairy"], ["Berries", "1/2 cup", 0.75, "Produce"], ["Pumpkin seeds", "1 tbsp", 0.25, "Pantry"]], prep: ["Mix oats and yogurt and refrigerate overnight.", "Top with berries and seeds."]},
  {kind: "breakfast", styles: ["mediterranean"], title: "Spinach tomato egg plate", subtitle: "Savory Mediterranean breakfast", p: 25, c: 16, f: 20, ing: [["Eggs", "3", 1.2, "Protein"], ["Tomatoes", "1 cup", 0.8, "Produce"], ["Spinach", "1 cup", 0.4, "Produce"], ["Olive oil", "1 tbsp", 0.2, "Fats"]], prep: ["Sauté tomatoes and spinach.", "Add eggs and cook until set."]},
  {kind: "main", styles: ["mediterranean"], title: "Chicken chickpea salad", subtitle: "Bright protein lunch", p: 43, c: 40, f: 19, ing: [["Chicken breast", "7 oz", 2.2, "Protein"], ["Chickpeas", "3/4 cup", 0.7, "Pantry"], ["Cucumber", "1/2", 0.35, "Produce"], ["Tomatoes", "1/2 cup", 0.4, "Produce"], ["Olive oil", "1 tbsp", 0.2, "Fats"]], prep: ["Cook chicken thoroughly.", "Combine chopped vegetables and chickpeas.", "Slice chicken and toss with olive oil."]},
  {kind: "main", styles: ["mediterranean"], title: "Sardine tomato toast", subtitle: "Budget seafood plate", p: 29, c: 36, f: 18, ing: [["Canned sardines", "1 can", 1.8, "Protein"], ["Whole wheat bread", "2 slices", 0.6, "Pantry"], ["Tomatoes", "1 cup", 0.8, "Produce"], ["Olive oil", "1 tsp", 0.1, "Fats"]], prep: ["Toast bread.", "Top with sardines and sliced tomatoes."]},
  {kind: "main", styles: ["mediterranean"], title: "Turkey lentil soup", subtitle: "Batch-friendly soup", p: 39, c: 43, f: 12, ing: [["Ground turkey", "6 oz", 1.9, "Protein"], ["Lentils", "3/4 cup cooked", 0.6, "Pantry"], ["Carrots", "1 cup", 0.4, "Produce"], ["Tomatoes", "1 cup", 0.8, "Produce"]], prep: ["Cook turkey thoroughly.", "Add lentils, carrots, tomatoes and water.", "Simmer until vegetables are tender."]},
  {kind: "main", styles: ["mediterranean"], title: "Lemon chicken and quinoa", subtitle: "Weeknight Mediterranean dinner", p: 45, c: 47, f: 15, ing: [["Chicken thighs", "8 oz", 2.2, "Protein"], ["Quinoa", "1 cup cooked", 1.2, "Pantry"], ["Lemon", "1/2", 0.3, "Produce"], ["Spinach", "1 cup", 0.4, "Produce"]], prep: ["Cook chicken thoroughly.", "Cook quinoa and wilt spinach.", "Finish with lemon."]},
  {kind: "snack", styles: ["mediterranean"], title: "Greek yogurt and apple", subtitle: "Simple Mediterranean snack", p: 23, c: 26, f: 5, ing: [["Greek yogurt", "1 cup", 1.4, "Dairy"], ["Apple", "1", 0.7, "Produce"]], prep: ["Slice apple and serve with yogurt."]},
  {kind: "snack", styles: ["mediterranean"], title: "Hummus and bell pepper", subtitle: "Fresh snack", p: 9, c: 20, f: 10, ing: [["Hummus", "1/2 cup", 1.2, "Pantry"], ["Bell pepper", "1", 0.9, "Produce"]], prep: ["Slice pepper and serve with hummus."]},
];

/* ---------- plan generation ---------- */

export const DEFAULT_PREFS: Preferences = {
  style: 'wholefood',
  rules: [],
  mealsPerDay: 4,
  firstMeal: '07:00',
  lastMeal: '19:30',
  proteinTarget: 160,
  calorieTarget: 2200,
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

const disallowed: Partial<Record<DietaryRule, RegExp>> = {
  glutenfree: /\b(oats|bread|wheat|barley|rye|flour|pasta|crackers|couscous|bulgur)\b/i,
  dairyfree: /\b(milk|yogurt|cheese|whey|butter|cream|paneer|ghee)\b/i,
  nutfree: /\b(almonds|peanuts|cashews|walnuts|pecans|pistachios|hazelnuts|peanut butter)\b/i,
  soyfree: /\b(soy|tofu|tempeh|edamame|miso)\b/i,
  eggfree: /\b(eggs|egg whites|egg)\b/i,
  nopork: /\b(pork|bacon|ham|prosciutto|lard|pancetta|sausage)\b/i,
  noshellfish: /\b(shrimp|prawn|crab|lobster|clam|mussel|oyster|scallop|shellfish)\b/i,
  nobeef: /\b(beef|steak|chuck roast|beef jerky)\b/i,
  nomeat: /\b(chicken|turkey|beef|steak|pork|bacon|ham|lamb|duck|jerky|sausage|roast beef|ground meat|meatballs|bone broth)\b/i,
  nofish: /\b(salmon|tuna|cod|tilapia|trout|sardine|anchovy|fish|shrimp|prawn|crab|lobster|clam|oyster|scallop)\b/i,
  norootveg: /\b(potato|potatoes|sweet potato|carrot|carrots|onion|onions|garlic|ginger|beet|beets|radish|turnip|yam|shallot|leek)\b/i,
  noalcohol: /\b(wine|beer|alcohol|rum|brandy|vodka|mirin|cooking sherry)\b/i,
};
const dairyIngredient = /\b(milk|yogurt|cheese|whey|butter|cream|paneer|ghee)\b/i;
export function recipeMatchesRules(r: Recipe, rules: DietaryRule[] = []): boolean {
  const names = r.ing.map(i => i[0]).join(' ');
  return rules.every(rule => {
    if (rule === 'kosher' || rule === 'halal') return true; // never implies certification
    if (rule === 'separatemeatdairy') return !(disallowed.nomeat!.test(names) && dairyIngredient.test(names));
    if (rule === 'fastingplant') return !disallowed.nomeat!.test(names) && !disallowed.nofish!.test(names) && !dairyIngredient.test(names) && !disallowed.eggfree!.test(names);
    return !disallowed[rule]?.test(names);
  });
}
export function ingredientMatchesRules(name: string, rules: DietaryRule[] = []): boolean {
  return rules.every(rule => !disallowed[rule]?.test(name));
}
export function mealMatchesRules(meal: Meal, rules: DietaryRule[] = []): boolean {
  return recipeMatchesRules({kind: 'main', styles: [], title: meal.title, subtitle: meal.subtitle,
    p: meal.protein, c: meal.carb, f: meal.fat, ing: meal.ingredients.map(i => [i.name,i.qty,i.price,i.cat] as Ing), prep: meal.prep}, rules);
}
export function dietaryPrepNotes(rules: DietaryRule[]): string[] {
  const notes: string[] = [];
  if (rules.includes('kosher')) notes.push('Kosher: verify certification and approved equipment; check meat/dairy separation and waiting practices as applicable.');
  if (rules.includes('halal')) notes.push('Halal: verify meat sourcing, certification, additives and preparation surfaces.');
  if (rules.includes('separatemeatdairy')) notes.push('Keep meat and dairy ingredients, utensils and preparation separate as your practice requires.');
  if (rules.includes('fastingplant')) notes.push('Confirm permitted foods, oils and dates for your specific fasting practice.');
  if (rules.includes('norootveg')) notes.push('Check seasonings and packaged foods for root-derived ingredients.');
  return notes;
}
export function availableRecipeCount(p: Preferences): number {
  return RECIPES.filter(r => r.styles.includes(p.style) && recipeMatchesRules(r, p.rules)).length;
}

export function generateMeals(p: Preferences): Meal[] {
  const kinds = slotKinds(p.mealsPerDay);
  const a = toMin(p.firstMeal);
  const b = Math.max(a, toMin(p.lastMeal));
  const out: Meal[] = [];
  const usedWeeks = new Set<string>();
  const usage = new Map<string, number>();
  for (let day = 1; day <= 7; day++) {
    const pools = kinds.map(kind => RECIPES.filter(r => r.kind === kind && r.styles.includes(p.style) && recipeMatchesRules(r, p.rules)));
    if (pools.some(pool => !pool.length)) continue; // no incompatible substitutions
    // Bounded beam search: scales with a large library without enumerating every combination.
    // Favor variety, daily protein/calorie targets, and lower estimated cost.
    type Candidate = { picked: Recipe[]; score: number; protein: number; calories: number; cost: number };
    let beam: Candidate[] = [{ picked: [], score: 0, protein: 0, calories: 0, cost: 0 }];
    for (let slot = 0; slot < pools.length; slot++) {
      const next: Candidate[] = [];
      for (const candidate of beam) for (const r of pools[slot]) {
        const count = candidate.picked.filter(x => x.title === r.title).length;
        const cost = r.ing.reduce((n, i) => n + i[2], 0);
        next.push({
          picked: [...candidate.picked, r],
          protein: candidate.protein + r.p,
          calories: candidate.calories + mealCalories({ protein: r.p, carb: r.c, fat: r.f }),
          cost: candidate.cost + cost,
          score: candidate.score + count * 45 + (usage.get(r.title) || 0) * 7 + cost * 0.35 +
            ((RECIPES.indexOf(r) + day * (slot + 1)) % 11) * 0.015,
        });
      }
      const fraction = (slot + 1) / pools.length;
      next.sort((a, b) => {
        const rank = (x: Candidate) => x.score +
          Math.abs(x.protein - p.proteinTarget * fraction) * 0.20 +
          Math.abs(x.calories - p.calorieTarget * fraction) / 45;
        return rank(a) - rank(b);
      });
      beam = next.slice(0, 32);
    }
    const best = beam.sort((a, b) => {
      const score = (x: Candidate) => x.score +
        Math.abs(x.protein - p.proteinTarget) * 0.45 +
        Math.abs(x.calories - p.calorieTarget) / 22 +
        (usedWeeks.has(x.picked.map(r => r.title).join('|')) ? 1000 : 0);
      return score(a) - score(b);
    })[0]?.picked;
    if (!best) continue;
    const selected: Recipe[] = best;
    usedWeeks.add(selected.map(r => r.title).join('|'));
    selected.forEach((r, i) => {
      usage.set(r.title, (usage.get(r.title) || 0) + 1);
      out.push({
        id: uid(), day,
        time: kinds.length === 1 ? p.firstMeal : fromMin(a + ((b - a) * i) / (kinds.length - 1)),
        title: r.title, subtitle: r.subtitle, protein: r.p, carb: r.c, fat: r.f,
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
    diningOutCost: keep?.diningOutCost ?? 0,
    preferences: prefs,
    meals,
    prepTasks: prepTasksFor(meals),
    log: keep?.log || {},
    bought: {},
    onHand: keep?.onHand || {},
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
  if (!(prefs.style in STYLE_LABEL)) prefs.style = DEFAULT_PREFS.style;
  prefs.rules = Array.isArray(prefs.rules) ? prefs.rules.filter((r): r is DietaryRule => typeof r === 'string' && r in RULE_LABEL) : [];
  prefs.calorieTarget = Number.isFinite(Number(prefs.calorieTarget)) && Number(prefs.calorieTarget) > 0
    ? Math.min(10000, Math.round(Number(prefs.calorieTarget))) : DEFAULT_PREFS.calorieTarget;
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
    budget: Number.isFinite(Number(raw.budget)) && Number(raw.budget) >= 0 ? Number(raw.budget) : base.budget,
    diningOutCost: Number.isFinite(Number(raw.diningOutCost)) && Number(raw.diningOutCost) >= 0 ? Number(raw.diningOutCost) : 0,
    preferences: prefs,
    meals,
    prepTasks: Array.isArray(raw.prepTasks) ? raw.prepTasks : prepTasksFor(meals),
    log: raw.log && typeof raw.log === 'object' ? raw.log : {},
    bought: raw.bought && typeof raw.bought === 'object' ? raw.bought : {},
    onHand: raw.onHand && typeof raw.onHand === 'object' ? raw.onHand : {},
  };
}

/** Compatible, lower-estimated-cost whole-meal alternatives. No automatic substitutions. */
export type AffordableOption = {
  mealId: string; day: number; original: string; replacement: Meal;
  oldCost: number; newCost: number; difference: number;
};
export function affordableMealOptions(plan: SupportPlan): AffordableOption[] {
  const prefs = plan.preferences;
  const eligible = RECIPES.filter(r => r.styles.includes(prefs.style) && recipeMatchesRules(r, prefs.rules));
  const options: AffordableOption[] = [];
  for (const meal of plan.meals) {
    const oldCost = mealCost(meal);
    const candidates = eligible.filter(r => r.title !== meal.title && r.ing.reduce((sum, i) => sum + i[2], 0) < oldCost - 0.05)
      .filter(r => {
        const isSnack = /snack|shake|fruit|nuts|seeds|yogurt/i.test(meal.subtitle);
        return isSnack ? r.kind === 'snack' : r.kind !== 'snack';
      }).sort((a, b) => b.p - a.p || a.ing.reduce((sum, i) => sum + i[2], 0) - b.ing.reduce((sum, i) => sum + i[2], 0));
    const r = candidates[0];
    if (!r) continue;
    const replacement: Meal = { ...meal, title: r.title, subtitle: r.subtitle, protein: r.p, carb: r.c, fat: r.f,
      ingredients: r.ing.map(([name, qty, price, cat, an, ap]) => ({ id: uid(), name, qty, price, cat, ...(an ? { alt: { name: an, price: ap || 0 } } : {}) })), prep: [...r.prep] };
    const newCost = mealCost(replacement);
    options.push({ mealId: meal.id, day: meal.day, original: meal.title, replacement, oldCost, newCost, difference: oldCost - newCost });
  }
  return options.sort((a, b) => b.difference - a.difference);
}

/** One source of compatible meal replacements for PLAN, SHOP and PREP. */
export type MealSwapMode = 'cheaper' | 'nutrition' | 'different';
export function mealSwapOptions(plan: SupportPlan, meal: Meal, mode: MealSwapMode): Meal[] {
  const eligible = RECIPES.filter(r => r.styles.includes(plan.preferences.style) && recipeMatchesRules(r, plan.preferences.rules) && r.title !== meal.title);
  const currentCost = mealCost(meal);
  const currentCalories = mealCalories(meal);
  const kind: Kind = /snack|shake|fruit|nuts|seeds/i.test(meal.subtitle) ? 'snack' :
    /breakfast|morning/i.test(meal.subtitle) || /breakfast|eggs|oat|yogurt|toast|scramble/i.test(meal.title) ? 'breakfast' : 'main';
  const pool = eligible.filter(r => r.kind === kind);
  const score = (r: Recipe) => {
    const cost = r.ing.reduce((n, i) => n + i[2], 0);
    const cal = r.p * 4 + r.c * 4 + r.f * 9;
    if (mode === 'cheaper') return cost * 100 + Math.abs(r.p - meal.protein) * 0.8;
    if (mode === 'nutrition') return Math.abs(r.p - meal.protein) * 1.5 + Math.abs(cal - currentCalories) / 12;
    const used = plan.meals.filter(m => m.title === r.title).length;
    return used * 100 + Math.abs(cost - currentCost) * 2;
  };
  return pool.filter(r => mode !== 'cheaper' || r.ing.reduce((n, i) => n + i[2], 0) < currentCost - 0.05)
    .sort((a, b) => score(a) - score(b)).slice(0, 6).map(r => ({
      ...meal, title: r.title, subtitle: r.subtitle, protein: r.p, carb: r.c, fat: r.f,
      ingredients: r.ing.map(([name, qty, price, cat, an, ap]) => ({ id: uid(), name, qty, price, cat, ...(an ? { alt: { name: an, price: ap || 0 } } : {}) })),
      prep: [...r.prep],
    }));
}

/** Replace a whole recipe; preserve meal id, day and time for history. */
export function replacePlannedMeal(plan: SupportPlan, id: string, replacement: Meal): SupportPlan {
  const meals = plan.meals.map(m => m.id === id ? { ...replacement, id: m.id, day: m.day, time: m.time } : m);
  return { ...plan, meals, bought: {}, prepTasks: prepTasksFor(meals) };
}

/** Replace matching ingredients across all meals. Prep instructions require manual review. */
export function replaceShoppingIngredient(plan: SupportPlan, oldName: string, alternative: { name: string; price: number }): SupportPlan {
  const oldKey = ingKey(oldName);
  const meals = plan.meals.map(m => ({ ...m, ingredients: m.ingredients.map(i => ingKey(i.name) === oldKey ?
    { ...i, name: alternative.name, price: alternative.price, alt: undefined } : i) }));
  return { ...plan, meals, bought: {}, onHand: { ...(plan.onHand || {}) }, prepTasks: prepTasksFor(meals) };
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
    onHand: plan.onHand || {},
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
    ? [...new Set(next.ingredients.filter((i) => i.name.trim() && !plan.bought[ingKey(i.name)] && !plan.onHand?.[ingKey(i.name)]).map((i) => i.name.trim()))]
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
    caloriesPlanned: meals.reduce((sum, meal) => sum + mealCalories(meal), 0),
    caloriesLogged: doneMeals.reduce((sum, meal) => sum + mealCalories(meal), 0),
    proteinGap: Math.max(0, plan.preferences.proteinTarget - planned),
    blocked: next && missing.length ? `Check what you already have for ${fmt12(next.time)}: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ` +${missing.length - 4} more` : ''}. Unchecked items aren't necessarily missing.` : '',
    total,
    remaining: plan.budget - total,
    estimatedToBuy: list.filter(i => !plan.onHand?.[i.id]).reduce((sum, i) => sum + i.price, 0),
    estimatedAlreadyHave: list.filter(i => !!plan.onHand?.[i.id]).reduce((sum, i) => sum + i.price, 0),
    over: plan.budget > 0 && total > plan.budget,
    bought: list.filter((i) => plan.bought[i.id]).length,
    listCount: list.length,
    savings: swapSavings(plan),
  };
}
