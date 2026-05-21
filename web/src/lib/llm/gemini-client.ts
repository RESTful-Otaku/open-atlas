/**
 * Direct Gemini API from the browser (mobile-friendly). API key stays in
 * localStorage on device — use a key restricted by HTTP referrer / IP in Google AI Studio.
 */

export interface GeminiInsightResult {
  text: string;
  model: string;
}

export async function requestGeminiInsight(
  apiKey: string,
  model: string,
  snapshot: Record<string, unknown>,
  userPrompt?: string,
  signal?: AbortSignal,
): Promise<GeminiInsightResult> {
  const key = apiKey.trim();
  if (!key) {
    throw new Error("Gemini API key is empty — add it in Settings → LLM providers.");
  }
  const modelId = model.trim() || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(key)}`;

  const system = `You are an operations analyst for OpenAtlas. Ground every claim in the JSON snapshot only. Be concise and quantitative.`;
  const userText =
    (userPrompt?.trim() ? `${userPrompt.trim()}\n\n` : "") +
    `Snapshot JSON:\n${JSON.stringify(snapshot, null, 2)}`;

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `${system}\n\n${userText}` }] }],
      generationConfig: { temperature: 0.35, maxOutputTokens: 2048 },
    }),
  });

  if (!r.ok) {
    let detail = r.statusText;
    try {
      const err = (await r.json()) as { error?: { message?: string } };
      if (err.error?.message) detail = err.error.message;
    } catch {
      /* */
    }
    throw new Error(`Gemini API ${r.status}: ${detail}`);
  }

  const body = (await r.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text =
    body.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? "";
  if (!text) throw new Error("Gemini returned an empty response");
  return { text, model: modelId };
}
