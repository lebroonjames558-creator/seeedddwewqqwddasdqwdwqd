# Shadow AI — tools build

Shadow AI is a private chat UI. The model still writes the explanation, but arithmetic, unit conversion, time, JSON checks, documentation lookup, Wikipedia search, and short code snippets run in real tools on the server. The model is not allowed to invent those results.

## What runs locally

- Exact integer and rational calculator (`BigInt`), with a second multiplication path that must match before a product is returned.
- Linear equation solver for one variable.
- JavaScript sandbox (`node --permission`, API keys removed, filesystem and child processes blocked).
- Python sandbox when `python3` is installed (`python3 -I`, CPU limit, API keys removed).
- JSON parsing, unit conversion, and date/time conversion.
- Wikipedia search and MDN documentation search. Both need outbound network access from the server.

Native NVIDIA tool calls are used when the model endpoint accepts them. If it rejects the `tools` parameter, the server keeps going and still injects calculator results it computed itself.

## Deploy to Netlify

Deploy the whole project from Git. Do not drag-and-drop only the `public` folder, or the functions will not be included.

1. Put this folder at the root of a GitHub repository (`netlify.toml`, `netlify/`, `lib/`, and `public/` together).
2. Import the repository in Netlify. Publish directory `public`. Functions directory `netlify/functions`. No build command.
3. Set one environment variable: `NVIDIA_API_KEY`. Do not put the key in `public/`, `netlify.toml`, or git.
4. Redeploy.

No visitor password is required.

Check `/api/health`. It should report `toolsEnabled: true`. `keyConfigured` is true only after the key is set. Chat still answers pure calculations when the key is missing. Other questions need the key.

`/api/chat` is POST. A browser GET returns 405, which is expected.

## Run on your computer

1. Install Node.js 18 or newer. Python 3 is optional, for the Python tool.
2. Either paste the key into `API_KEY` in `server.js`, or set `NVIDIA_API_KEY` in the environment. Do not commit a real key.
3. Run `start.bat` on Windows, or `node server.js`.
4. Open `http://127.0.0.1:3210`.

## Test the calculator

From this folder:

```bash
node scripts/test-tools.cjs
```

The large-product test computes the product twice (engine and an independent schoolbook multiply) and compares them. The expected digits are not stored in the source.

## Limits

- The JavaScript and Python sandboxes are best-effort. They are not a hardened multi-tenant jail. Do not point an untrusted public audience at code execution without extra isolation.
- Node's permission model does not fully disable raw network access. The sandbox replaces `fetch` and blocks common network modules, but a determined snippet could still try other escapes.
- Python is unavailable on Netlify unless the function image contains `python3`. The tool reports that honestly.
- Web search is Wikipedia, not a full web index. Documentation lookup is MDN. Empty results are not filled in.
- Unit conversion and logarithms/trigonometry are approximations. Integer and rational results are exact.
- Results longer than 20,000 digits are refused.
- Netlify's function time limit can cut off a slow model call. Calculator results are computed before the model is called, and if the model errors they are still returned.
- The configured model is `nvidia/nemotron-3.5-lightning-30b-a3b`. Tool-call support varies by checkpoint. The fallback does not pretend a rejected tool call succeeded.
