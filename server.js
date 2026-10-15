// Shadow AI local server, model proxy, and tool orchestrator.
// Paste your API provider key into API_KEY below, or set NVIDIA_API_KEY.
// Keep this file private; never publish it with a real key.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { runChat, MODEL } = require("./lib/orchestrate.cjs");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 3210);

const API_KEY = process.env.NVIDIA_API_KEY || "PASTE_YOUR_API_KEY_HERE";

const ROOT = path.join(__dirname, "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const hits = new Map();

function allow(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((stamp) => now - stamp < 60_000);
  if (recent.length >= 30) return false;
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

function keyReady() {
  return Boolean(API_KEY && API_KEY !== "PASTE_YOUR_API_KEY_HERE");
}

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
    req.on("data", (chunk) => {
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

function clamp(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    return send(res, 200, {
      ok: true,
      model: MODEL,
      keyConfigured: keyReady(),
      toolsEnabled: true,
      accessProtectionConfigured: false
    });
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    const ip = req.socket.remoteAddress || "local";
    if (!allow(ip)) return send(res, 429, { error: "Too many requests. Wait a minute and try again." });

    let input;
    try { input = await readBody(req); }
    catch (error) { return send(res, 400, { error: error.message }); }

    const messages = Array.isArray(input.messages) ? input.messages : [];
    if (!messages.length || messages.length > 100) {
      return send(res, 400, { error: "messages must be a non-empty array (up to 100 messages)." });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });

    try {
      const generator = runChat({
        apiKey: keyReady() ? API_KEY : "",
        messages,
        temperature: clamp(input.temperature, 0, 1, 0.4),
        top_p: clamp(input.top_p, 0, 1, 0.9),
        max_tokens: Math.round(clamp(input.max_tokens, 1, 16384, 8192))
      });
      for await (const chunk of generator) {
        if (res.destroyed) break;
        res.write(chunk);
      }
    } catch (error) {
      const status = error.status || 502;
      if (!res.headersSent) {
        return send(res, status, { error: error.message || "Chat failed." });
      }
      res.write(`data: ${JSON.stringify({ error: error.message || "Chat failed." })}\n\n`);
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
    if (req.method === "HEAD") {
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(resolved)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      });
      res.end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(resolved)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log("");
  console.log("  Shadow AI");
  console.log(`  Local URL: http://${HOST}:${PORT}`);
  console.log(`  Model:     ${MODEL}`);
  console.log(`  API key:   ${keyReady() ? "configured" : "not configured yet"}`);
  console.log("  Tools:     exact calculator, code sandbox, units, time, search");
  console.log("");
});
