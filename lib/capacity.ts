import { supabase } from '@/lib/supabase';

export type CapacityLevel = 'high' | 'medium' | 'low';

export type Capacity = {
  id?: string;
  user_id?: string;
  date: string;
  level: CapacityLevel;
  source: 'manual' | 'automatic';
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

export const DEFAULT_CAPACITY_LEVEL: CapacityLevel = 'medium';

export const capacityLabels: Record<CapacityLevel, string> = {
  high: 'PUSH',
  medium: 'STEADY',
  low: 'LIGHT',
};

export const capacityTargetMinutes: Record<CapacityLevel, number> = {
  high: 60,
  medium: 30,
  low: 10,
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export async function getCapacityForDate(
  date: string = todayString()
): Promise<Capacity | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from('capacities')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', date)
    .maybeSingle();

  if (error) {
    console.warn('Error fetching capacity', error.message);
    return null;
  }

  return data as Capacity | null;
}

export async function upsertCapacity(
  input: Omit<Capacity, 'id' | 'user_id' | 'created_at' | 'updated_at'>
): Promise<Capacity | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from('capacities')
    .upsert(
      {
        user_id: user.id,
        date: input.date,
        level: input.level,
        source: input.source,
        metadata: input.metadata ?? null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,date',
      }
    )
    .select()
    .single();

  if (error) {
    console.warn('Error upserting capacity', error.message);
    return null;
  }

  return data as Capacity;
}