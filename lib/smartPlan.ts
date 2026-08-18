export type Meal={id:string;day:number;time:string;title:string;subtitle:string;protein:string;carb:string;fat:string;ingredients:string[];prep:string[];done:boolean;cost:number};
export type Item={id:string;name:string;qty:string;cat:string;price:number;bought:boolean;required:boolean;save?:{label:string;amount:number}};
export type SupportPlan={version:2;budget:number;preferences:{workout:string;work:string};meals:Meal[];shopping:Item[]};

const baseMeals=[
 ['4:05 AM','Pre-workout fuel','Quick protein + training carb','20–30 g','½ banana / berries','Light',['Whey protein','½ banana'],3.2],
 ['5:45 AM','Post-workout breakfast','Recovery meal','30–35 g','Sweet potato + berries','Avocado / EVOO',['Whole eggs','80/20 beef','Sweet potato','Spinach','Avocado'],4.8],
 ['9:15 AM','Meal 2','Steady mid-morning meal','25–30 g','Berries','Walnuts',['Full-fat Greek yogurt','Berries','Walnuts'],3.1],
 ['12:30 PM','Lunch','Workday anchor','30–35 g','Sweet potato / beans','EVOO / avocado',['Chicken thighs','Broccoli','Sweet potato','EVOO'],4.4],
 ['3:45 PM','Meal 4','Portable afternoon meal','25–30 g','Apple / berries','Nuts',['Boiled eggs','Apple','Walnuts'],3.0],
 ['6:30 PM','Dinner','Whole-food dinner','30–35 g','Potato / squash','Natural animal fat + EVOO',['80/20 beef','Roasted vegetables','Potato','EVOO'],5.2],
];
export function buildPlan():SupportPlan{
 const meals:Meal[]=[];for(let d=1;d<=7;d++)baseMeals.forEach((x:any[],i)=>meals.push({id:`d${d}m${i}`,day:d,time:d>5&&i===0?'6:00 AM':x[0],title:x[1],subtitle:x[2],protein:x[3],carb:x[4],fat:x[5],ingredients:x[6],prep:['Use batch-cooked protein and vegetables.','Portion the grain-free carbohydrate source.','Add EVOO/avocado or the meal’s natural fat.','Pack work meals the night before.'],done:false,cost:x[7]}));
 return {version:2,budget:120,preferences:{workout:'4:30 AM',work:'7:00 AM–5:30 PM'},meals,shopping:[
 {id:'eggs',name:'Eggs',qty:'2 dozen',cat:'Protein',price:7,bought:false,required:true},
 {id:'beef',name:'80/20 ground beef',qty:'3 lb',cat:'Protein',price:16,bought:false,required:true,save:{label:'Buy family-pack ground beef',amount:3}},
 {id:'thighs',name:'Chicken thighs',qty:'4 lb',cat:'Protein',price:11,bought:false,required:true,save:{label:'Use bone-in family-pack thighs',amount:3}},
 {id:'pork',name:'Pork shoulder',qty:'2.5 lb',cat:'Protein',price:8,bought:false,required:true},
 {id:'chuck',name:'Chuck roast',qty:'2.5 lb',cat:'Protein',price:17,bought:false,required:true,save:{label:'Use pork shoulder for one roast meal',amount:6}},
 {id:'salmon',name:'Salmon',qty:'1 lb',cat:'Protein',price:12,bought:false,required:false,save:{label:'Replace one salmon meal with chicken thighs',amount:7}},
 {id:'yogurt',name:'Full-fat Greek yogurt',qty:'2 large tubs',cat:'Protein',price:10,bought:false,required:false,save:{label:'Use eggs/leftovers for two snacks',amount:4}},
 {id:'whey',name:'Whey protein',qty:'7–10 servings',cat:'Protein',price:8,bought:false,required:false},
 {id:'sweet',name:'Sweet potatoes',qty:'5 lb',cat:'Carb/Fiber',price:6,bought:false,required:true},
 {id:'potato',name:'Potatoes',qty:'5 lb',cat:'Carb/Fiber',price:5,bought:false,required:true},
 {id:'berries',name:'Frozen berries',qty:'2 large bags',cat:'Carb/Fiber',price:12,bought:false,required:true,save:{label:'Use store-brand frozen berries',amount:4}},
 {id:'fruit',name:'Bananas + apples',qty:'10–12 pieces',cat:'Carb/Fiber',price:7,bought:false,required:false},
 {id:'avo',name:'Avocados',qty:'4',cat:'Fat',price:6,bought:false,required:false,save:{label:'Use EVOO for two avocado servings',amount:3}},
 {id:'evoo',name:'Extra-virgin olive oil',qty:'Weekly portion',cat:'Fat',price:8,bought:false,required:true},
 {id:'nuts',name:'Walnuts / mixed nuts',qty:'10–12 oz',cat:'Fat',price:7,bought:false,required:false},
 {id:'greens',name:'Spinach / leafy greens',qty:'2 containers',cat:'Vegetable',price:8,bought:false,required:true},
 {id:'broc',name:'Broccoli / cauliflower',qty:'3–4 lb frozen',cat:'Vegetable',price:8,bought:false,required:true,save:{label:'Buy frozen store-brand florets',amount:3}},
 {id:'pep',name:'Peppers + onions',qty:'6–8 total',cat:'Vegetable',price:7,bought:false,required:true},
 {id:'cab',name:'Cabbage',qty:'1 head',cat:'Vegetable',price:3,bought:false,required:true},
 ]}}
function timeToMinutes(time: string) {
  const match = time.match(/(\d+):(\d+)\s*(AM|PM)/i);

  if (!match) return 0;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();

  if (hour === 12) hour = 0;
  if (period === 'PM') hour += 12;

  return hour * 60 + minute;
}

export function evaluatePlan(
  p: SupportPlan,
  day: number,
  now = new Date()
) {
  const total =
    Math.round(
      p.shopping.reduce((a, x) => a + x.price, 0) * 100
    ) / 100;

  const remaining =
    Math.round((p.budget - total) * 100) / 100;

  const done = p.meals.filter(x => x.done).length;

  const currentMinutes =
    now.getHours() * 60 + now.getMinutes();

  const todayMeals = p.meals
    .filter(x => x.day === day && !x.done)
    .sort(
      (a, b) =>
        timeToMinutes(a.time) - timeToMinutes(b.time)
    );

  // Find the next unfinished meal that has not passed yet.
  let next =
    todayMeals.find(
      meal => timeToMinutes(meal.time) >= currentMinutes
    ) || null;

  // If today's meal times have all passed,
  // turn tomorrow's first meal into tonight's prep move.
  if (!next) {
    const tomorrowDay = day >= 7 ? 1 : day + 1;

    const tomorrowFirst = p.meals
      .filter(x => x.day === tomorrowDay)
      .sort(
        (a, b) =>
          timeToMinutes(a.time) - timeToMinutes(b.time)
      )[0];

    if (tomorrowFirst) {
      next = {
        ...tomorrowFirst,
        id: `prep-${tomorrowFirst.id}`,
        time: 'TONIGHT',
        title: `Prep tomorrow's ${tomorrowFirst.title.toLowerCase()}`,
        subtitle: `Make the ${tomorrowFirst.time} move easier before bed.`,
        done: false,
      };
    }
  }

  const missing = p.shopping.filter(
    x => x.required && !x.bought
  );

  const savings = p.shopping
    .filter(x => x.save)
    .map(x => ({
      id: x.id,
      label: x.save!.label,
      save: x.save!.amount,
    }))
    .sort((a, b) => b.save - a.save)
    .slice(0, 4);

  return {
    total,
    remaining,
    over: remaining < 0,

    adherence: Math.round(
      done / Math.max(1, p.meals.length) * 100
    ),

    next,

    blocked: missing.length
      ? `Required groceries still open: ${missing
          .slice(0, 3)
          .map(x => x.name)
          .join(', ')}${missing.length > 3 ? '…' : ''}`
      : null,

    savings,

    bought: p.shopping.filter(x => x.bought).length,
  };
}
export function optimizeBudget(p:SupportPlan):SupportPlan{
 let shopping=p.shopping.map(x=>({...x}));let total=shopping.reduce((a,x)=>a+x.price,0);
 for(const x of shopping.filter(x=>x.save).sort((a,b)=>(b.save?.amount||0)-(a.save?.amount||0))){if(total<=p.budget)break;const amt=x.save?.amount||0;x.price=Math.max(0,x.price-amt);total-=amt}
 return {...p,shopping}}
