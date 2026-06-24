# Cannes Lions 2026 — Live Intel

A glanceable dashboard of Grand Prix + metal winners and honest, sourced recaps of the talks. The page reads from `data.json`, which a GitHub Action regenerates several times a day during the festival.

## Repo layout

```
index.html                  the app (reads data.json, falls back to a built-in snapshot)
data.json                   the data (committed; overwritten by the Action)
scripts/update.mjs          refresh script — Claude + web search → validated data.json
.github/workflows/refresh.yml   schedule: 5x/day, with an auto-stop date
```

Put the files exactly there. `update.mjs` goes in a `scripts/` folder; `refresh.yml` goes in `.github/workflows/`.

## One-time setup (5 minutes)

1. **Create the repo** and add the four files above.
2. **Add your API key:** repo → Settings → Secrets and variables → Actions → New repository secret. Name it `ANTHROPIC_API_KEY`, paste your key.
3. **Turn on Pages:** Settings → Pages → Source: *Deploy from a branch* → `main` / root. Your site goes live at `https://<you>.github.io/<repo>/`.
4. **Allow the Action to commit:** Settings → Actions → General → Workflow permissions → *Read and write permissions*.
5. **Test it now:** Actions tab → "Refresh Cannes data" → *Run workflow*. It should update `data.json` and commit. The site reflects it within a minute.

## Google Analytics

`index.html` has a GA4 snippet near the top with a placeholder ID. To turn on tracking, create a GA4 property (analytics.google.com → Admin → Create property → add a **Web** data stream for your Pages URL), copy the **Measurement ID** (looks like `G-XXXXXXXXXX`), and replace **both** placeholder occurrences in `index.html`. Until you do, the snippet is inert.

## How the refresh works

`refresh.yml` fires on a cron schedule (2x/day, UTC), timed to the festival. Each run executes `update.mjs`, which calls Claude with the web-search tool, asks for current winners + completed-talk recaps as strict JSON, validates the shape, and commits `data.json` only if something changed. The page fetches that file on load.

### Schedule
Two runs a day, timed to Cannes (CEST = UTC+2):
- `cron: "0 20 * * *"` → 22:00 CEST — after the day's talks have wrapped and that evening's awards show, so it picks up the new winners and same-evening talk write-ups.
- `cron: "0 6 * * *"` → 08:00 CEST — a morning catch-up for trade-press coverage that posts overnight.

Edit the times in `refresh.yml` if you want a different spread. Note: GitHub's scheduled runs can lag by a few minutes under load — fine for this.

### Auto-stop
`update.mjs` has `STOP_AFTER = 2026-07-04`. After that date the script exits without doing anything, so the job quietly no-ops even though the cron keeps firing. To stop cleanly, just delete `refresh.yml` (or disable the workflow in the Actions tab) once you're done next week.

## Honest limitations

- The refresh is a **convenience pipeline, not a guaranteed-accurate feed.** An LLM-with-search can occasionally miss or misattribute a winner. The authoritative source is always **Love The Work** (`lovethework.com/work-awards/results`) — the script links to coverage, not to a structured awards API, because no free one exists.
- The script **won't overwrite `data.json` if the response fails validation**, so a bad run leaves the last good copy in place.
- The **buzz score** is a coverage-based read (volume + tone), not social-listening data.
- You can always hand-edit `data.json` and commit — the page will pick it up, and the next scheduled run will build on top.

## Cost

Each run is one Claude call with up to ~12 web searches. At 5 runs/day for ~10 days that's roughly 50 calls total — a few dollars at most. Watch it in the Anthropic console if you want to be sure.
