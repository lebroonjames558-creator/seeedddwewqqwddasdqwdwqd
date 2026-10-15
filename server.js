// Shadow AI local server and hosted-model API proxy.
// Paste your API provider key into API_KEY below.
// Keep this file private; never publish it with a real key.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 3210);
const MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";

// Paste your API key between these quotes:
const API_KEY = "PASTE_YOUR_API_KEY_HERE";

const ROOT = path.join(__dirname, "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function send(res, status, data, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(typeof data === "string" ? data : JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 2_000_000) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); }
      catch { reject(new Error("Request body must be valid JSON.")); }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    return send(res, 200, {
      ok: true,
      model: MODEL,
      keyConfigured: Boolean(API_KEY && API_KEY !== "PASTE_YOUR_API_KEY_HERE"),
      accessProtectionConfigured: true
    });
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    if (!API_KEY || API_KEY === "PASTE_YOUR_API_KEY_HERE") {
      return send(res, 400, {
        error: "Add your API key to the API_KEY constant near the top of server.js, then restart the app."
      });
    }

    let input;
    try { input = await readBody(req); }
    catch (e) { return send(res, 400, { error: e.message }); }

    const messages = Array.isArray(input.messages) ? input.messages : [];
    if (!messages.length || messages.length > 100) {
      return send(res, 400, { error: "messages must be a non-empty array (up to 100 messages)." });
    }

    const allowedRoles = new Set(["system", "user", "assistant"]);
    const cleanMessages = messages.map(m => ({
      role: allowedRoles.has(m.role) ? m.role : "user",
      content: String(m.content ?? "").slice(0, 100_000)
    }));

    const payload = {
      model: MODEL,
      messages: cleanMessages,
      temperature: clamp(input.temperature, 0, 1, 0.7),
      top_p: clamp(input.top_p, 0, 1, 0.95),
      max_tokens: Math.round(clamp(input.max_tokens, 1, 16384, 4096)),
      stream: true,
      // Disable the model's explicit reasoning trace; show only the final answer.
      chat_template_kwargs: { enable_thinking: false }
    };

    let upstream;
    try {
      upstream = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
          "Accept": "text/event-stream"
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(180_000)
      });
    } catch (e) {
      return send(res, 502, { error: `Could not reach the model API: ${e.message}` });
    }

    if (!upstream.ok) {
      const detail = await upstream.text();
      return send(res, upstream.status, {
        error: `Model API returned HTTP ${upstream.status}.`,
        detail: detail.slice(0, 12000)
      });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });

    if (!upstream.body) {
      res.end();
      return;
    }

    try {
      const reader = upstream.body.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (res.destroyed) {
          await reader.cancel();
          break;
        }
        res.write(Buffer.from(value));
      }
    } catch (e) {
      if (!res.destroyed) {
        res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
      }
    }
    if (!res.writableEnded) res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, { error: "Method not allowed." });
  }

  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const resolved = path.resolve(ROOT, "." + pathname);
  if (!resolved.startsWith(ROOT + path.sep) && resolved !== path.join(ROOT, "index.html")) {
    return send(res, 403, { error: "Forbidden." });
  }
  fs.readFile(resolved, (err, data) => {
    if (err) return send(res, 404, "Not found", "text/plain; charset=utf-8");
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(resolved)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    res.end(data);
  });
});

function clamp(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

server.listen(PORT, HOST, () => {
  console.log("");
  console.log("  ✦ Shadow AI");
  console.log(`  Local URL: http://${HOST}:${PORT}`);
  console.log(`  Model:     ${MODEL}`);
  console.log(`  API key:   ${API_KEY !== "PASTE_YOUR_API_KEY_HERE" ? "configured" : "not configured yet"}`);
  console.log("  Press Ctrl+C to stop.");
  console.log("");
});
