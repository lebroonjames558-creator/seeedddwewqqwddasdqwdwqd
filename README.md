# YORU — anime, movies, and TV (Cloudflare Pages edition)

YORU keeps the anime catalogue powered by AniList/Jikan/Kitsu and adds Movies and TV Shows pages backed by The Movie Database (TMDB). Anime playback uses Server 1 from the supplied Anistream HTML; movie and TV playback continue to use VidRift. A server-side Pages Function chooses the playback target. This package is **not a Netlify project**: there is no `netlify.toml` and no Netlify Function.

## Deploy using a private GitHub repository

1. Extract this ZIP on your computer.
2. Upload the contents of this folder into the **root** of a new GitHub repository. Keep `build/` and `functions/` at the root; do not upload only `build/`.
3. You can set the GitHub repository to **Private**. Cloudflare Pages supports private repositories when its GitHub integration has access.
4. In Cloudflare Dashboard, open **Workers & Pages → Create application → Pages → Connect to Git** and select your repo.
5. Use these build settings:
   - Production branch: `main` (or the branch you uploaded to)
   - Framework preset: `None`
   - Build command: leave blank (or use `exit 0` if the UI requires one)
   - Build output directory: `build`
   - Root directory: `/` (the repository root; leave the default if not shown)
6. Deploy. `functions/api/stream.js` maps to `/api/stream`, and `functions/api/catalog.js` maps to `/api/catalog`.

Cloudflare Pages will publish files from `build/` while compiling Pages Functions from the root `functions/` folder.

## Cloudflare environment variables

Open **Workers & Pages → your Pages project → Settings → Variables and Secrets**. Add the following values under **Production** (and Preview too, if you want the Preview deployment to use them), then redeploy. Anime does not use VidRift. You no longer need `VIDRIFT_BASE_URL`, `VIDRIFT_DUB_PARAM`, `VIDRIFT_SUB_PARAM`, `VIDRIFT_BRAND`, `VIDRIFT_FULLSCREEN_PARAM`, or `VIDRIFT_TITLE_PREFIX` for anime; remove those obsolete anime-specific variables if you previously added them.

| Variable name | Suggested value | Required? | Purpose |
| --- | --- | --- | --- |
| `TMDB_API_KEY` | Your TMDB API key (v3 auth) | **Yes for Movies/TV metadata** | Server-side catalog search, posters, ratings, credits, seasons and episodes. Store as a Secret. |
| `VIDRIFT_MOVIE_BASE_URL` | `https://embed.vidrift.net/embed/movie` | Optional | Movie player base URL; built-in default if omitted. |
| `VIDRIFT_TV_BASE_URL` | `https://embed.vidrift.net/embed/tv` | Optional | TV episode player base URL; built-in default if omitted. |

Get a TMDB API key from [TMDB's developer documentation](https://developer.themoviedb.org/docs/getting-started). The key is used only inside `functions/api/catalog.js`; it is not shipped in `build/app.js`. Do not place the real key in source files, `.env.example`, or GitHub. The app shows an explanatory message on Movies/TV pages until `TMDB_API_KEY` is configured. Anime browsing continues to work without this variable.

Anime Server 1 is `https://anixo.buzz/embed/ani/{anilist_id}/{episode}?track=sub|dub`. Server 2 and Server 3 have been removed from the site and are rejected by the Cloudflare Function. The Stream tab exposes only the Server 1 indicator. Movie and TV playback keep using VidRift paths `/embed/movie/{tmdb_id}` and `/embed/tv/{tmdb_id}/{season}/{episode}`.

### GitHub Secrets vs. Cloudflare runtime secrets

**GitHub Actions Secrets do not automatically become runtime variables for a website.** Because this version uses Cloudflare Pages Functions, configure the values above in Cloudflare's **Variables and Secrets** settings. You do not need a GitHub Actions workflow or GitHub Actions secrets to use this Git-connected deployment.

If you later use GitHub Actions to deploy through the Cloudflare API, deployment credentials such as `CLOUDFLARE_API_TOKEN` belong in GitHub Actions Secrets. That is a separate setup from the runtime `VIDRIFT_*` variables.

## Security and privacy notes

- Add `.env`, `.dev.vars`, and real credentials **never** to GitHub. The provided `.gitignore` excludes local env files.
- The TMDB API key is read by the server-side Pages Function and never included in frontend JavaScript. The catalog endpoint has a fixed route allowlist; it is not an arbitrary URL proxy.
- The anime provider URL is stored in the server-side stream Function rather than in `build/app.js`, and the iframe uses `referrerpolicy="no-referrer"` to avoid sending the YORU page URL as the referrer. The stream iframe is sandboxed without popup permission to block provider-created popup windows and top-level navigation. Browser DevTools / Network can still reveal the redirect destination and third-party iframe traffic: a browser must request the stream to play it, so there is no reliable way to make those requests invisible. This project does not proxy or disguise third-party media traffic.
- This site does not proxy or host video. Use only streams and providers you are authorized to access.
- Making the GitHub repository private hides source browsing, not the public website or browser-delivered HTML/CSS/JS.

## File layout

```text
build/
  index.html
  anistream.html # optional standalone Anistream-style player; uses /api/stream
  styles.css
  app.js
  api.js
functions/
  api/
    catalog.js # Cloudflare Pages Function handling /api/catalog (TMDB)
    stream.js  # Cloudflare Pages Function for anime server selection plus movie/TV VidRift redirects
.env.example   # sample local config only; no real secrets
.gitignore
README.md
```

## Run the static front end locally

From the repository root, run:

```bash
python -m http.server 8080 --directory build
```

This previews the UI and anime catalogue. The `/api/catalog` and `/api/stream` Functions will not run under Python's HTTP server; test movie/TV metadata, the Server 1 anime redirect, and movie/TV VidRift redirects after deploying to Cloudflare Pages or using Cloudflare Pages local development tooling with variables configured.


## Mobile support

The interface includes responsive phone and tablet layouts: safe-area-aware fixed navigation, a tap-to-expand header search, two-column poster grids on phones, touch-sized controls, responsive movie/TV detail sheets, and player/trailer layouts sized for portrait and landscape screens. Test on at least one narrow phone viewport and one tablet viewport after deployment.


## Popup blocking and stream visibility

The anime stream iframe is sandboxed without `allow-popups` / top-level navigation, and the page blocks first-party `window.open` calls. This should block most popup windows launched by the player, but can affect a provider that requires popups. Ads rendered inside the provider's cross-origin iframe are not controllable by page JavaScript. The player page uses `/api/stream` so the provider hostname is not embedded in frontend JavaScript, but the browser follows a redirect and DevTools can still reveal the final network destination. Hiding that request completely would require proxying the actual video traffic, which this project intentionally does not do.
