import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

export type CoachDiscovery = {
  title: string; hook: string; whyYou: string; idea: string; explore: string; possibilities?: string[];
  readiness: 'within_reach' | 'stretch' | 'bigger_possibility';
  readinessReason: string; category: string; imageTheme: string; verification: 'curated_idea';
};
export type DiscoveryContext = {
  activeGoals: { title: string; milestone?: string; progress?: string }[];
  achievements: string[]; interests: string[];
  direction?: string; recentDiscoveries?: string[];
};
const day = () => new Date().toLocaleDateString('en-CA');
const cacheKey = (id: string) => `goaldin-discovery-v61-${id}-${day()}`;
const historyKey = (id: string) => `goaldin-discovery-history-v6-${id}`;
const directions = ['MOVE', 'LEARN', 'DO', 'CONNECT', 'GO', 'BUILD', 'HELP', 'FIX', 'PUSH'] as const;
type HistoryItem = { title: string; category: string };
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const keywords = (value: string) => normalize(value).split(' ').filter(w => w.length > 3 && !['your', 'with', 'from', 'into', 'make', 'create', 'personalized', 'custom', 'using', 'something'].includes(w));
const similar = (a: string, b: string) => {
  const left = new Set(keywords(a)); const right = new Set(keywords(b));
  if (!left.size || !right.size) return normalize(a) === normalize(b);
  const overlap = [...left].filter(w => right.has(w)).length;
  return normalize(a) === normalize(b) || overlap >= 2 && overlap / Math.min(left.size, right.size) >= 0.55;
};
const selectedKey = (id: string) => `goaldin-discovery-selected-v6-${id}`;

export async function loadDiscovery(id: string): Promise<CoachDiscovery | null> {
  try { const value = await AsyncStorage.getItem(cacheKey(id)); return value ? JSON.parse(value) as CoachDiscovery : null; } catch { return null; }
}
export async function selectedDiscovery(id: string): Promise<CoachDiscovery | null> {
  try { const value = await AsyncStorage.getItem(selectedKey(id)); return value ? JSON.parse(value) as CoachDiscovery : null; } catch { return null; }
}
export async function saveSelectedDiscovery(id: string, value: CoachDiscovery) {
  await AsyncStorage.setItem(selectedKey(id), JSON.stringify(value));
}
export async function requestDiscovery(id: string, context: DiscoveryContext, refresh = false): Promise<CoachDiscovery> {
  if (!refresh && !context.direction) {
    const cached = await loadDiscovery(id);
    if (cached) return cached;
  }
  const raw = await AsyncStorage.getItem(historyKey(id)).catch(() => null);
  let history: HistoryItem[] = [];
  try {
    const parsed: unknown = JSON.parse(raw || '[]');
    if (Array.isArray(parsed)) history = parsed.map(item => typeof item === 'string'
      ? { title: item, category: '' }
      : { title: String(item?.title || ''), category: String(item?.category || '').toUpperCase() })
      .filter(item => item.title).slice(-18);
  } catch { /* history is optional */ }
  const recentCategories = history.map(item => item.category).filter(Boolean);
  // Rotate the broad experience direction only on a fresh, unfiltered discovery.
  // Explicit category selections still belong to the user.
  const direction = context.direction || (refresh ? directions.find(d => !recentCategories.slice(-5).includes(d))
    || directions[history.length % directions.length] : undefined);
  const recentDiscoveries = history.map(item => item.title);
  let value: CoachDiscovery | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase.functions.invoke('goal-coach', {
      body: {
        mode: 'discovery', ...context, direction,
        recentDiscoveries,
        recentCategories: recentCategories.slice(-10),
        avoidTopics: history.slice(-8).map(item => item.title),
        freshExperience: refresh,
      },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message || 'Discovery is unavailable.');
    const candidate = data?.discovery as CoachDiscovery | undefined;
    if (!candidate || typeof candidate.title !== 'string' || typeof candidate.idea !== 'string' || typeof candidate.explore !== 'string') {
      throw new Error('The Coach did not return a complete discovery.');
    }
    value = candidate;
    // Retry one time if the Coach repeats a subject, rather than presenting a renamed duplicate.
    if (!refresh || !history.slice(-7).some(item => similar(item.title, candidate.title))) break;
    recentDiscoveries.push(candidate.title);
  }
  if (!value) throw new Error('Discovery is unavailable.');
  if (refresh && history.slice(-7).some(item => similar(item.title, value!.title))) {
    throw new Error('Discovery needs more variety. Try a different direction.');
  }
  const updated = [...history, { title: value.title, category: value.category || direction || '' }].slice(-18);
  await Promise.all([
    AsyncStorage.setItem(historyKey(id), JSON.stringify(updated)),
    !context.direction ? AsyncStorage.setItem(cacheKey(id), JSON.stringify(value)) : Promise.resolve(),
  ]);
  return value;
}

// Select from bundled, offline imagery using the discovery itself, not just a broad category.
// A category photo is illustrative, not a photo of the proposed finished result.
export function discoveryImageKind(discovery: CoachDiscovery | null, fallback = 'connection'): string {
  if (!discovery) return fallback;
  const text = `${discovery.title} ${discovery.hook} ${discovery.idea}`.toLowerCase();
  if (/guitar|song|music|piano|instrument|melody/.test(text)) return 'music';
  if (/chevy|truck|car|automotiv|restor|engine|metalwork|garage/.test(text)) return 'restoration';
  if (/trail|hike|travel|run|adventure|outdoor|mountain/.test(text)) return 'adventure';
  if (/learn|read|language|study|science|book/.test(text)) return 'learning';
  const theme = discovery.imageTheme;
  return ({ projects: 'restoration', fitness: 'adventure' } as Record<string, string>)[theme] ||
    (['restoration', 'music', 'adventure', 'learning', 'connection'].includes(theme) ? theme : fallback);
}

export type DiscoveryExperience = {
  invitation: string; steps: string[]; tools: string[]; safetyNote: string;
  resourceSearch: string; suggestedWin: string;
};
export async function prepareDiscoveryExperience(discovery: CoachDiscovery, blocker = ''): Promise<DiscoveryExperience> {
  const { data, error } = await supabase.functions.invoke('goal-coach', {
    body: { mode: 'discovery-experience', title: discovery.title, idea: discovery.idea,
      category: discovery.category, blocker: blocker.slice(0, 300) },
  });
  if (error || data?.error || !data?.experience) throw new Error(data?.error || error?.message || 'Coach could not prepare this experience.');
  return data.experience as DiscoveryExperience;
}


export type DiscoveryCoachTurn = { question: string; answer: string; resourceSearch?: string };
export async function askDiscoveryCoach(
  discovery: CoachDiscovery, experience: DiscoveryExperience, question: string,
  history: DiscoveryCoachTurn[] = [],
): Promise<{ answer: string; resourceSearch: string }> {
  const { data, error } = await supabase.functions.invoke('goal-coach', {
    body: {
      mode: 'discovery-followup', title: discovery.title, idea: discovery.idea,
      category: discovery.category, question: question.trim().slice(0, 700),
      experience: { invitation: experience.invitation, tools: experience.tools, steps: experience.steps,
        safetyNote: experience.safetyNote, resourceSearch: experience.resourceSearch },
      history: history.slice(-5).map(({ question: q, answer }) => ({ question: q.slice(0, 500), answer: answer.slice(0, 1200) })),
    },
  });
  if (error || data?.error || typeof data?.reply?.answer !== 'string' || !data.reply.answer.trim()) {
    throw new Error(data?.error || error?.message || 'Coach could not answer right now.');
  }
  return { answer: data.reply.answer, resourceSearch: typeof data.reply.resourceSearch === 'string' ? data.reply.resourceSearch : '' };
}
