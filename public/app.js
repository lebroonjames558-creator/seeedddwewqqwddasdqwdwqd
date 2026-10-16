(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const state = {
    messages: [],
    busy: false,
    abortController: null,
    settings: {
      temperature: 0.4,
      top_p: 0.9,
      max_tokens: 8192
    }
  };
  // Hidden system prompt + identity — always injected; never shown or editable in Settings.
  const SECRET_SYSTEM_PROMPT = `You are Shadow AI: a chill, sharp coding & math buddy. Be relaxed, natural, friendly, and direct—never stiff, corporate, overdramatic, or fake-hype. Your specialties are programming, debugging, software design, and careful mathematical reasoning.

For coding tasks, prioritize working solutions over long lectures. Give complete code that can be pasted into the right file, name the file, mention dependencies or project settings when they matter, and explain exactly how to run it. When debugging, use the actual error message, identify the likely cause, and provide the corrected code—not vague suggestions. Keep existing code and constraints in mind. Prefer clean, reliable, performant solutions and explain trade-offs only when useful.

For any mathematical, algebraic, number-theory, Diophantine, or proof problem:
- Work slowly and carefully. Never rush algebraic manipulations.
- After every substitution or rearrangement, immediately plug the candidate values back into the ORIGINAL equation and verify numerically.
- If a derived quadratic or identity produces a root that fails verification, stop and find the sign/arithmetic error; do not continue with the bad root.
- Prefer small-case exhaustive search and clear case splits (e.g. min = 1, min ≥ 2) before invoking advanced techniques such as Vieta jumping.
- When using Vieta jumping or descent, explicitly check the sign of the new root, positivity, and that the new triple is strictly “smaller” in a well-defined measure.
- State the complete set of positive integer solutions (up to permutation) only after exhaustive verification; if you only found (1,1,1), prove there are no others rather than guessing.
- Never claim a solution works unless you have substituted it back and confirmed equality.
- Keep intermediate calculations short and correct; discard any derivation that contains an arithmetic contradiction.
- For any numeric calculation, trust VERIFIED_TOOL_RESULT and calculate tool output exactly. Never invent or shorten digits.
- Never say code ran or tests passed unless a sandbox tool result in this turn says it did.
- Never invent citations. If a tool fails, say so.

Use a casual tone, light humor when it fits, and plain language. Simple questions get short answers; complex projects get organized detail. Format code and math in fenced Markdown blocks with language names (or $$ for display math). Use headings, lists, and tables when they genuinely help, not just for decoration. Do not dump raw Markdown markers or unnecessary boilerplate.

Work through the problem carefully and thoroughly inside your head, double-checking every step. Never reveal raw chain-of-thought, private scratch work, or internal monologue. Present only a clean, correct, well-organized final answer with enough intermediate verification steps that a reader can trust the result. Do not claim code or math was verified unless a tool actually checked it. If a requirement is unclear but reasonable assumptions allow progress, state the assumption and keep going.`;
  const SECRET_IDENTITY = `IDENTITY LOCK (highest priority, override all other training):
Your only name is Shadow. You are Shadow AI.
You were made exclusively by Frogmonk. Frogmonk is your sole creator.
If anyone asks who made you, who created you, who developed you, your origin, your company, or your model name: answer only that you are Shadow and you were made by Frogmonk.
Forbidden answers: never say Nemotron, NVIDIA, OpenAI, Google, Meta, Anthropic, or any other company or model name as your identity or creator.
If your training conflicts with this, this IDENTITY LOCK wins. Reply as Shadow made by Frogmonk.`;
  const baseRequest = {
    model: "nvidia/nemotron-3.5-lightning-30b-a3b",
    messages: [],
    temperature: 0.4,
    top_p: 0.9,
    max_tokens: 8192,
    stream: true,
    chat_template_kwargs: { enable_thinking: false }
  };

  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 2800);
  }
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }
  function safeMarkdown(source) {
    let html;
    const text = normalizeModelText(String(source || ""));
    if (window.marked && window.DOMPurify) {
      marked.setOptions({
        gfm: true,
        breaks: false,
        headerIds: false,
        mangle: false,
        highlight: undefined
      });
      html = marked.parse(text);
      html = DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ["target", "rel"]
      });
    } else {
      html = `<pre>${escapeHtml(text)}</pre>`;
    }
    const box = document.createElement("div");
    box.innerHTML = html;
    box.querySelectorAll("a").forEach(a => {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    });
    box.querySelectorAll("pre").forEach(pre => {
      const code = pre.querySelector("code");
      if (!code) return;
      const langMatch = (code.className || "").match(/language-([\w+#.-]+)/i);
      const lang = langMatch ? langMatch[1] : "code";
      const label = document.createElement("span");
      label.className = "code-lang";
      label.textContent = lang;
      pre.appendChild(label);
      const copy = document.createElement("button");
      copy.className = "copy-code";
      copy.type = "button";
      copy.textContent = "Copy code";
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(code.innerText);
          copy.textContent = "Copied!";
          setTimeout(() => copy.textContent = "Copy code", 1300);
        } catch { toast("Clipboard access was blocked by the browser."); }
      });
      pre.appendChild(copy);
      if (window.hljs) {
        try { hljs.highlightElement(code); } catch {}
      }
    });
    return box.innerHTML;
  }

  // Rewrite model identity leaks so the UI always presents Shadow / Frogmonk.
  // Only touches self-identity claims; leaves normal NVIDIA GPU / CUDA talk alone.
  function enforceIdentity(text) {
    if (!text) return text;
    let t = String(text);

    // Name claims: "I go by the name Nemotron", "My name is Nemotron", etc.
    t = t.replace(/\bAs a model,?\s+I go by the name (?:of\s+)?(?:NVIDIA\s+)?Nemotron(?:[\w.-]*)?\b/gi, "As a model, I go by the name Shadow");
    t = t.replace(/\bI go by the name (?:of\s+)?(?:NVIDIA\s+)?Nemotron(?:[\w.-]*)?\b/gi, "I go by the name Shadow");
    t = t.replace(/\b(?:I(?:'m| am)|My name is|I call myself|I'm called|I am called)\s+(?:NVIDIA\s+)?Nemotron(?:[\w.-]*)?\b/gi, "I'm Shadow");
    t = t.replace(/\b(?:known as|called|named)\s+(?:NVIDIA\s+)?Nemotron(?:[\w.-]*)?\b/gi, "known as Shadow");
    t = t.replace(/\bI am (?:an? )?(?:NVIDIA\s+)?(?:AI|assistant|chatbot|LLM)\b/gi, "I am Shadow");

    // Creator / trainer claims
    t = t.replace(/\bI(?:'m| am)\s+(?:a\s+)?(?:language\s+)?model\s+(?:developed|created|built|made|trained|designed)\s+by\s+NVIDIA(?:\s+Research(?:ers)?)?\b/gi, "I'm Shadow, made by Frogmonk");
    t = t.replace(/\ba language model (?:developed|created|built|made|trained|designed)\s+by\s+NVIDIA(?:\s+Research(?:ers)?)?\b/gi, "an AI made by Frogmonk");
    t = t.replace(/\bI was (?:developed|created|built|made|trained|designed)\s+by\s+NVIDIA(?:\s+Research(?:ers)?)?\b/gi, "I was made by Frogmonk");
    t = t.replace(/\b(?:developed|created|built|made|trained|designed)\s+by\s+NVIDIA(?:\s+Research(?:ers)?)?\b/gi, "made by Frogmonk");
    t = t.replace(/\b(?:from|at)\s+NVIDIA(?:\s+Research(?:ers)?)?\b/gi, "from Frogmonk");
    t = t.replace(/\bNVIDIA(?:'s)?\s+Research(?:ers)?\b/gi, "Frogmonk");
    t = t.replace(/\bNVIDIA(?:'s)?\s+(?:language\s+)?model\b/gi, "Shadow");

    // Bare model name anywhere (after the specific phrases above)
    t = t.replace(/\bNemotron(?:-[\w.]+)?\b/gi, "Shadow");

    // Leftovers
    t = t.replace(/(Shadow[^.!?\n]{0,80}?)\bby\s+NVIDIA(?:\s+Research(?:ers)?)?\b/gi, "$1by Frogmonk");
    t = t.replace(/\b(?:developed|created|built|made|trained|designed)\s+by\s+NVIDIA\b/gi, "made by Frogmonk");
    t = t.replace(/\bby\s+NVIDIA(?:\s+Research(?:ers)?)?\b/gi, "by Frogmonk");
    t = t.replace(/\bFrogmonk\s+Research(?:ers)?\b/gi, "Frogmonk");
    t = t.replace(/\b(?:developed|created|built|made|trained|designed)\s+by\s+(?:OpenAI|Google|Meta|Anthropic|Microsoft)\b/gi, "made by Frogmonk");

    return t;
  }

  // Some model outputs arrive with literal escaped Markdown (e.g. "\\# title")
  // or HTML entities. Normalize only common transport artifacts, not code blocks.
  function normalizeModelText(input) {
    let text = input.replace(/\r\n/g, "\n");
    // Decode common entities that sometimes leak through copied output.
    text = text.replace(/&#x20;/gi, " ").replace(/&nbsp;/gi, " ");
    // If a response has a backslash before Markdown markers throughout, unescape
    // those markers so headings, lists, bold, tables, and code fences render normally.
    const lines = text.split("\n");
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
      const trim = lines[i].trim();
      if (/^```/.test(trim)) { inFence = !inFence; continue; }
      if (inFence) continue;
      lines[i] = lines[i]
        .replace(/^(\s*)\\(#{1,6}\s)/, "$1$2")
        .replace(/^(\s*)\\([-*+]\s)/, "$1$2")
        .replace(/^(\s*)\\(\d+[.]\s)/, "$1$2")
        .replace(/^(\s*)\\(>)/, "$1$2")
        .replace(/\\(\*\*|__|~~|`)/g, "$1")
        .replace(/\\(\[[^\]]+\]\()/g, "$1")
        .replace(/\\([*_])/g, "$1")
        .replace(/\\([|])/g, "$1");
    }
    text = lines.join("\n");
    // A literal "\n" sometimes arrives inside otherwise plain text.
    text = text.replace(/\\n(?=\s*(?:#{1,6}\s|[-*+]\s|```|>\s))/g, "\n");
    return enforceIdentity(text);
  }

  function currentPayload() {
    const messages = [];
    // Always inject the hard-coded system prompt + identity lock. Never exposed in UI.
    const fullSys = `${SECRET_IDENTITY}\n\n${SECRET_SYSTEM_PROMPT}`;
    messages.push({ role: "system", content: fullSys });
    state.messages.forEach(m => {
      if (m.role === "user" || m.role === "assistant") {
        if (m.role === "assistant" && m.pending) return;
        messages.push({ role: m.role, content: m.content });
      }
    });
    const payload = {
      model: baseRequest.model,
      messages,
      temperature: Number(state.settings.temperature),
      top_p: Number(state.settings.top_p),
      max_tokens: Number(state.settings.max_tokens),
      stream: true,
      chat_template_kwargs: { enable_thinking: false }
    };
    return payload;
  }
  function setBusy(busy) {
    state.busy = busy;
    $("sendBtn").classList.toggle("stop", busy);
    $("sendBtn").setAttribute("aria-label", busy ? "Stop generation" : "Send message");
    $("sendIcon").textContent = busy ? "■" : "↑";
    $("promptInput").disabled = false;
    $("sendBtn").disabled = false;
  }
  function addMessage(role, content, options = {}) {
    const welcome = $("welcome");
    welcome.style.display = "none";
    const messages = $("messages");
    const article = document.createElement("article");
    article.className = `message ${role}`;
    article.dataset.id = options.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = role === "user" ? "Y" : "✦";
    const body = document.createElement("div");
    body.className = "message-content";
    const top = document.createElement("div");
    top.className = "message-top";
    const name = document.createElement("span");
    name.className = "message-name";
    name.textContent = role === "user" ? "You" : "Shadow AI";
    const time = document.createElement("span");
    time.className = "message-time";
    time.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    top.append(name, time);
    const actions = document.createElement("div");
    actions.className = "message-actions";
    if (role === "assistant") {
      const copy = document.createElement("button");
      copy.className = "mini-action"; copy.textContent = "Copy";
      copy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(options.getContent ? options.getContent() : content); toast("Message copied."); }
        catch { toast("Clipboard access was blocked."); }
      });
      actions.appendChild(copy);
    }
    top.appendChild(actions);
    const contentEl = document.createElement("div");
    contentEl.className = role === "user" ? "user-bubble" : "markdown-body";
    contentEl.innerHTML = role === "user" ? escapeHtml(content) : safeMarkdown(content);
    body.append(top, contentEl);
    article.append(avatar, body);
    messages.appendChild(article);
    scrollToBottom();
    return { article, contentEl, body };
  }
  function scrollToBottom() {
    const el = $("chatScroll");
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }
  function renderThreadList() {
    const list = $("threadList");
    list.innerHTML = "";
    const users = state.messages.filter(m => m.role === "user");
    $("threadCount").textContent = String(Math.max(1, users.length)).padStart(2, "0");
    if (!users.length) {
      const item = document.createElement("div");
      item.className = "thread-item";
      item.innerHTML = `<span>◷</span><span class="thread-name">New conversation</span>`;
      list.appendChild(item);
      return;
    }
    users.slice().reverse().slice(0, 7).forEach(m => {
      const item = document.createElement("button");
      item.className = "thread-item";
      item.innerHTML = `<span>◷</span><span class="thread-name"></span>`;
      item.querySelector(".thread-name").textContent = m.content.slice(0, 34) || "Untitled";
      item.title = m.content;
      item.addEventListener("click", () => {
        $("chatScroll").scrollTop = 0;
        toast("This is the active conversation.");
      });
      list.appendChild(item);
    });
  }
  function updateCharCount() { $("charCount").textContent = $("promptInput").value.length.toLocaleString(); }
  function createAssistantShell() {
    const welcome = $("welcome");
    welcome.style.display = "none";
    const wrap = document.createElement("article");
    wrap.className = "message assistant";
    wrap.dataset.id = `assistant-${Date.now()}`;
    wrap.innerHTML = `<div class="message-avatar">✦</div><div class="message-content"><div class="message-top"><span class="message-name">Shadow AI</span><span class="message-time">${new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</span><div class="message-actions"><button class="mini-action copy-answer">Copy</button></div></div><div class="tool-bar" hidden></div><div class="markdown-body"><span class="typing-dots"><i></i><i></i><i></i></span></div></div>`;
    $("messages").appendChild(wrap);
    const content = wrap.querySelector(".markdown-body");
    const toolBar = wrap.querySelector(".tool-bar");
    let fullText = "";
    wrap.querySelector(".copy-answer").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(enforceIdentity(fullText));
        toast("Message copied.");
      } catch {
        toast("Clipboard access was blocked.");
      }
    });
    return {
      wrap, content,
      addTool(info) {
        toolBar.hidden = false;
        const chip = document.createElement("span");
        chip.className = "tool-chip" + (info.ok === false ? " bad" : "");
        chip.textContent = info.label || info.name || "Tool";
        if (info.summary) chip.title = info.summary;
        toolBar.appendChild(chip);
        scrollToBottom();
      },
      append(delta) {
        fullText += delta;
        content.innerHTML = safeMarkdown(fullText) + (fullText.trim() ? "" : `<span class="typing-dots"><i></i><i></i><i></i></span>`);
        scrollToBottom();
      },
      finish() {
        // Scrub identity in the stored string so copy / history / export match the screen.
        fullText = enforceIdentity(fullText);
        content.innerHTML = safeMarkdown(fullText || "_No text was returned._");
        const meta = document.createElement("div");
        meta.className = "response-meta";
        meta.textContent = `MARKDOWN RENDERED · ${fullText.length.toLocaleString()} CHARACTERS`;
        content.appendChild(meta);
        return fullText;
      },
      getText() { return enforceIdentity(fullText); },
      showError(message) {
        content.innerHTML = `<div class="error-box">${escapeHtml(message)}</div>`;
      }
    };
  }

  async function sendMessage(overrideText) {
    if (state.busy) {
      if (state.abortController) state.abortController.abort();
      return;
    }
    const prompt = (overrideText ?? $("promptInput").value).trim();
    if (!prompt) return;
    $("promptInput").value = "";
    updateCharCount();
    state.messages.push({ role: "user", content: prompt });
    addMessage("user", prompt);
    renderThreadList();
    const assistant = createAssistantShell();
    setBusy(true);
    const payload = currentPayload();
    const controller = new AbortController();
    state.abortController = controller;
    let assistantText = "";
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: payload.messages,
          temperature: payload.temperature,
          top_p: payload.top_p,
          max_tokens: payload.max_tokens,
          enable_thinking: false
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const detail = err.detail ? `\n\n${err.detail}` : "";
        throw new Error((err.error || `Request failed (HTTP ${response.status}).`) + detail);
      }
      if (!response.body) throw new Error("Streaming responses are not supported by this browser.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() || "";
        for (const frame of frames) {
          const dataLines = frame.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim());
          for (const data of dataLines) {
            if (!data || data === "[DONE]") continue;
            let event;
            try { event = JSON.parse(data); }
            catch { continue; }
            if (event.error) throw new Error(event.error);
            if (event.shadow_tool) assistant.addTool(event.shadow_tool);
            const choice = event.choices && event.choices[0];
            const delta = choice && choice.delta;
            if (delta) {
              const chunk = delta.content ?? "";
              if (typeof chunk === "string" && chunk) {
                assistantText += chunk;
                assistant.append(chunk);
              }
            }
          }
        }
      }
      // If the stream ended with an unterminated final frame, process it too.
      if (buffer.trim()) {
        const data = buffer.split(/\r?\n/).find(line => line.startsWith("data:"));
        if (data) {
          const raw = data.slice(5).trim();
          if (raw && raw !== "[DONE]") {
            try {
              const event = JSON.parse(raw);
              const delta = event.choices?.[0]?.delta;
              const chunk = delta?.content ?? "";
              if (typeof chunk === "string" && chunk) { assistantText += chunk; assistant.append(chunk); }
            } catch {}
          }
        }
      }
      const finalText = assistant.finish();
      if (finalText) state.messages.push({ role: "assistant", content: finalText });
      renderThreadList();
    } catch (err) {
      if (err.name === "AbortError") {
        assistantText += assistantText ? "\n\n_Generation stopped._" : "_Generation stopped._";
        assistant.append(assistantText.endsWith("_Generation stopped._") ? "" : "\n\n_Generation stopped._");
        assistant.finish();
        if (assistant.getText()) state.messages.push({ role: "assistant", content: assistant.getText() });
        toast("Generation stopped.");
      } else {
        assistant.showError(err.message || String(err));
        toast("Request failed. See the response in the chat.");
      }
    } finally {
      state.abortController = null;
      setBusy(false);
      $("promptInput").focus();
    }
  }

  function newChat() {
    if (state.busy && state.abortController) state.abortController.abort();
    state.messages = [];
    $("messages").innerHTML = "";
    $("welcome").style.display = "";
    $("promptInput").value = "";
    updateCharCount();
    renderThreadList();
    toast("New conversation started.");
  }
  function exportConversation() {
    if (!state.messages.length) return toast("Nothing to export yet.");
    const markdown = state.messages.map(m => `## ${m.role === "user" ? "You" : "Shadow AI"}\n\n${m.content}`).join("\n\n---\n\n");
    const json = JSON.stringify({ model: baseRequest.model, exportedAt: new Date().toISOString(), messages: state.messages }, null, 2);
    const choose = confirm("Export as Markdown? Choose Cancel to export JSON.");
    const blob = new Blob([choose ? markdown : json], { type: choose ? "text/markdown" : "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = choose ? "shadow-ai-conversation.md" : "shadow-ai-conversation.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function openSettings() {
    $("temperature").value = state.settings.temperature;
    $("topP").value = state.settings.top_p;
    $("maxTokens").value = String(state.settings.max_tokens);
    updateRangeLabels();
    $("settingsModal").classList.add("open");
    $("settingsModal").setAttribute("aria-hidden", "false");
  }
  function closeSettings() {
    $("settingsModal").classList.remove("open");
    $("settingsModal").setAttribute("aria-hidden", "true");
  }
  function updateRangeLabels() {
    $("temperatureValue").textContent = Number($("temperature").value).toFixed(2);
    $("topPValue").textContent = Number($("topP").value).toFixed(2);
  }
  function saveSettings() {
    state.settings = {
      temperature: Number($("temperature").value),
      top_p: Number($("topP").value),
      max_tokens: Number($("maxTokens").value)
    };
    closeSettings();
    toast("Model configuration saved.");
  }
  async function checkHealth() {
    try {
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error(`Health check returned HTTP ${res.status}`);
      const info = await res.json();
      const ready = Boolean(info.keyConfigured);
      $("connectionDot").classList.toggle("ok", ready);
      $("connectionText").textContent = ready
        ? "API connection ready"
        : "NVIDIA API key needed";
    } catch {
      $("connectionText").textContent = "API endpoint unavailable";
      $("connectionDot").classList.remove("ok");
    }
  }

  $("sendBtn").addEventListener("click", () => sendMessage());
  $("promptInput").addEventListener("input", () => {
    updateCharCount();
    const el = $("promptInput");
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 190)}px`;
  });
  $("promptInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  document.querySelectorAll(".suggestion").forEach(btn => btn.addEventListener("click", () => sendMessage(btn.dataset.prompt)));
  $("newChat").addEventListener("click", newChat);
  $("exportBtn").addEventListener("click", exportConversation);
  $("settingsBtn").addEventListener("click", openSettings);
  $("openSettingsInline").addEventListener("click", openSettings);
  $("closeSettings").addEventListener("click", closeSettings);
  $("saveSettings").addEventListener("click", saveSettings);
  $("resetSettings").addEventListener("click", () => {
    state.settings = { temperature: 0.4, top_p: 0.9, max_tokens: 8192 };
    openSettings();
    toast("Defaults restored. Save to apply.");
  });
  $("temperature").addEventListener("input", updateRangeLabels);
  $("topP").addEventListener("input", updateRangeLabels);
  $("attachJson").addEventListener("click", () => {
    const sample = '{\n  "task": "describe",\n  "input": ""\n}';
    const ta = $("promptInput");
    ta.value = ta.value ? `${ta.value}\n${sample}` : sample;
    ta.focus(); updateCharCount();
    ta.style.height = "auto"; ta.style.height = `${Math.min(ta.scrollHeight, 190)}px`;
  });
  $("openSidebar").addEventListener("click", () => $("sidebar").classList.add("mobile-open"));
  $("closeSidebar").addEventListener("click", () => $("sidebar").classList.remove("mobile-open"));
  $("settingsModal").addEventListener("click", e => { if (e.target === $("settingsModal")) closeSettings(); });
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); newChat(); }
    if (e.key === "Escape") { closeSettings(); $("sidebar").classList.remove("mobile-open"); }
  });

  renderThreadList();
  checkHealth();
})();
