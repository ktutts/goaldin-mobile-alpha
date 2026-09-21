import { supabase } from "./supabase";

export type SuggestedSchedule = {
  type: "once" | "repeat";
  days: number[];
  time: string;
  reason: string;
};

export async function getSuggestedSchedule(input: {
  goalTitle: string;
  why?: string;
  barriers?: string[];
}): Promise<SuggestedSchedule | null> {
  try {
    const { data, error } = await supabase.functions.invoke(
      "suggested-schedule",
      {
        body: input,
      }
    );

    if (error || !data) {
      console.log("Suggested schedule unavailable:", error);
      return null;
    }

    return data as SuggestedSchedule;
  } catch (error) {
    console.log("Suggested schedule error:", error);
    return null;
  }
}