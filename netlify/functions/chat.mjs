import { runChat } from "../../lib/orchestrate.cjs";

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

const hits = new Map();

function allow(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((stamp) => now - stamp < 60_000);
  if (recent.length >= 30) return false;
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

export default async function handler(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const ip = request.headers.get("x-nf-client-connection-ip")
    || request.headers.get("x-forwarded-for")
    || "unknown";
  if (!allow(ip.split(",")[0].trim())) return json({ error: "Too many requests. Wait a minute and try again." }, 429);

  const apiKey = process.env.NVIDIA_API_KEY || "";

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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const generator = runChat({
          apiKey,
          messages,
          temperature: clamp(input.temperature, 0, 1, 0.4),
          top_p: clamp(input.top_p, 0, 1, 0.9),
          max_tokens: Math.round(clamp(input.max_tokens, 1, 16384, 8192))
        });
        for await (const chunk of generator) controller.enqueue(encoder.encode(chunk));
      } catch (error) {
        const payload = `data: ${JSON.stringify({ error: error.message || "Chat failed." })}\n\n`;
        controller.enqueue(encoder.encode(payload));
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no"
    }
  });
}
