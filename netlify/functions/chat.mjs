import { timingSafeEqual } from "node:crypto";

const MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";
const API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function secureEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const apiKey = process.env.NVIDIA_API_KEY;
  const accessPassword = process.env.SHADOW_AI_ACCESS_PASSWORD;
  if (!apiKey) return json({ error: "The site owner must set NVIDIA_API_KEY in Netlify environment variables." }, 503);
  if (!accessPassword) return json({ error: "The site owner must set SHADOW_AI_ACCESS_PASSWORD in Netlify environment variables." }, 503);

  const submittedPassword = request.headers.get("x-shadow-access-password") || "";
  if (!secureEqual(submittedPassword, accessPassword)) {
    return json({ error: "Access password is incorrect. Try again." }, 401);
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  const messages = Array.isArray(input.messages) ? input.messages : [];
  if (!messages.length || messages.length > 100) {
    return json({ error: "messages must be a non-empty array (up to 100 messages)." }, 400);
  }

  const allowedRoles = new Set(["system", "user", "assistant"]);
  const cleanMessages = messages.map((message) => ({
    role: allowedRoles.has(message?.role) ? message.role : "user",
    content: String(message?.content ?? "").slice(0, 100_000)
  }));

  const payload = {
    model: MODEL,
    messages: cleanMessages,
    temperature: clamp(input.temperature, 0, 1, 0.7),
    top_p: clamp(input.top_p, 0, 1, 0.95),
    max_tokens: Math.round(clamp(input.max_tokens, 1, 16384, 4096)),
    stream: true,
    chat_template_kwargs: { enable_thinking: false }
  };

  let upstream;
  try {
    upstream = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream"
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(55_000)
    });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    return json({ error: timedOut ? "The model request timed out. Try a shorter prompt." : `Could not reach NVIDIA: ${error.message}` }, timedOut ? 504 : 502);
  }

  if (!upstream.ok) {
    const detail = (await upstream.text()).slice(0, 8000);
    return json({ error: `NVIDIA API returned HTTP ${upstream.status}.`, detail }, upstream.status);
  }
  if (!upstream.body) return json({ error: "NVIDIA returned an empty response stream." }, 502);

  // Pass NVIDIA's SSE stream through directly so the chat can render tokens as they arrive.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no"
    }
  });
}
