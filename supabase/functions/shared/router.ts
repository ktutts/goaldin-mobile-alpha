// supabase/functions/_shared/router.ts

export type ModelRole = "STRATEGY" | "FAST_UTILITY" | "LONG_MEMORY";

const MODEL_MAP: Record<ModelRole, string> = {
  STRATEGY: "anthropic/claude-3.5-sonnet",      // Highly empathetic, nuanced coaching
  FAST_UTILITY: "meta-llama/llama-3.3-70b-instruct", // Fast micro-interactions / formatting
  LONG_MEMORY: "google/gemini-2.5-flash",       // Processing long histories & context
};
export type RequestKind =
  | "SIMPLE"
  | "PLANNING"
  | "COACHING"
  | "HISTORY";

export function chooseModelRole(kind: RequestKind): ModelRole {
  switch (kind) {
    case "SIMPLE":
      return "FAST_UTILITY";

    case "HISTORY":
      return "LONG_MEMORY";

    case "PLANNING":
    case "COACHING":
    default:
      return "STRATEGY";
  }
}
export async function dispatchAIRequest(
  role: ModelRole,
  systemPrompt: string,
  userPrompt: string
) {
  const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
  const openAiKey = Deno.env.get("OPENAI_API_KEY");

  // Route through OpenRouter if available, fall back to OpenAI
  const apiUrl = openRouterKey
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";

  const apiKey = openRouterKey || openAiKey;
  const model = openRouterKey ? MODEL_MAP[role] : "gpt-4o-mini";

  if (!apiKey) {
    throw new Error("Missing API Key in environment variables.");
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://mygoaldin.com",
      "X-Title": "Goal'D In",
    },
    body: JSON.stringify({
      model: model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI Gateway Error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}