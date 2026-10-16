# Shadow AI — Netlify-ready build

This folder contains the Shadow AI website plus Netlify Functions for the NVIDIA model API. The functions fix the deployed `/api/chat` and `/api/health` endpoints that otherwise return HTTP 404.

## Deploy to Netlify (important)

**Deploy the whole project through a Git-connected Netlify deploy or the Netlify CLI.** Do not deploy only the `public` folder with drag-and-drop: that publishes the frontend but does not reliably bundle the functions.

### 1. Put the project on GitHub

1. Extract this ZIP.
2. Create a repository on GitHub (private is fine).
3. Upload the *contents* of this `ShadowAI_Netlify_Fix` folder to the repository root. Ensure `netlify.toml` and the `netlify` folder are at the root, alongside `public`.

### 2. Connect Netlify

1. In Netlify, choose **Add new project** / **Import an existing project** and connect your GitHub repository.
2. Keep the settings from `netlify.toml`: publish directory `public`; functions directory `netlify/functions`; no build command is required.
3. Deploy the site.

### 3. Set two environment variables

In your Netlify project configuration, open **Environment variables** and add:

- `NVIDIA_API_KEY` — your NVIDIA API key
- `SHADOW_AI_ACCESS_PASSWORD` — a strong private password you choose for accessing your personal Shadow AI site

Set them for the Functions/runtime context if Netlify asks for a scope. **Do not put either secret in `public/app.js`, `index.html`, GitHub, or `netlify.toml`.** Redeploy after setting the variables so the functions receive them.

When a visitor first sends a message, the site asks for the `SHADOW_AI_ACCESS_PASSWORD`. It is kept in that browser tab's session storage. Wrong passwords are rejected by the function before it calls NVIDIA.

### 4. Verify

Open your published Netlify URL and send `Hey`. The status near the bottom of the UI should say `API connection ready` when both environment variables are configured. If it still fails, open these URLs on your site:

- `/api/health` — should return JSON with `"keyConfigured": true` and `"accessProtectionConfigured": true`.
- `/api/chat` — opening this in a browser sends GET, so a `405 Method not allowed` response is expected; the UI uses POST.

## Run locally on Windows

1. Install Node.js 18 or newer.
2. Open `server.js` and set `const API_KEY = "..."` to your NVIDIA key.
3. Run `start.bat` and keep the terminal open.

The local server serves its frontend from `public` and continues to use `/api/chat` through `server.js`. The extra site access password is only required for the deployed Netlify functions.

## Notes

- Model: `nvidia/nemotron-3.5-lightning-30b-a3b`
- Explicit model thinking is disabled in API requests; hidden reasoning is not displayed.
- The site loads Markdown, fonts, and code highlighting from CDNs, so the browser needs internet access for those enhancements.
- The access password is a simple private-site gate, not user accounts or a multi-user authentication system. Use a long unique password and do not share it publicly.
