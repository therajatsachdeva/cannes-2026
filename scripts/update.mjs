// scripts/update.mjs
// Refreshes data.json for the Cannes Lions 2026 dashboard.
// Runs on a schedule via GitHub Actions. Uses Claude + web search to ADD any
// newly-announced winners and newly-completed talks to the existing data —
// it never rebuilds from scratch, so good entries can't silently disappear.
//
// Requires: Node 20+ (built-in fetch) and an ANTHROPIC_API_KEY secret.
// Honest caveat: this is a convenience, not a guaranteed feed. The authoritative
// winners list is always Love The Work (lovethework.com/work-awards/results).

import { writeFileSync, readFileSync } from "node:fs";

// ---- Auto-stop: do nothing after the festival + buffer ----
const STOP_AFTER = new Date("2026-07-04T00:00:00Z");
if (new Date() > STOP_AFTER) {
  console.log("Past STOP_AFTER date — refresh disabled. Delete/disable the workflow to tidy up.");
  process.exit(0);
}

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) { console.error("Missing ANTHROPIC_API_KEY"); process.exit(1); }

// To cut cost further, swap this to "claude-haiku-4-5-20251001".
const MODEL = "claude-sonnet-4-6";

const today = new Date().toISOString().slice(0, 10);

// Load the current data so we can hand it to the model and merge onto it.
let current = null;
try { current = JSON.parse(readFileSync("data.json", "utf8")); } catch {}
const prevWinners = current?.winners?.length || 0;
const prevTalks   = current?.talks?.length   || 0;

const SCHEMA = `{
  "updated": "<e.g. 25 Jun 2026>",
  "winners": [ { "tier":"gp|gold|silver|bronze", "title":"", "brand":"", "agency":"",
    "extra":"<optional one-liner or omit>", "cat":"<category>", "track":"Entertainment|Craft|Health|B2B & Brand|Print & Outdoor|Audio",
    "day":"Day 1..Day 5", "link":"<url to coverage that embeds the case-study film>" } ],
  "tally": [ { "nm":"<category short name>", "g":0, "s":0, "b":0 } ],
  "honours": [ { "lbl":"", "name":"", "who":"" } ],
  "pending": [ "<category names not yet awarded>" ],
  "talks": [ { "talk":"", "spk":"", "ven":"<venue · day, time>", "buzz":0,
    "sent":"pos|mix|pol", "read":"<2-3 line factual recap of what was actually said on stage>",
    "link":"<open-access, non-paywalled recap URL>" } ]
}`;

const prompt = `You are updating a Cannes Lions 2026 dashboard. Today is ${today}. The festival runs 22-26 June 2026.

Here is the CURRENT data (already verified and live). Your job is to UPDATE it, not rebuild it:

${JSON.stringify(current, null, 2)}

Use web search to find what has been announced or has happened SINCE this data was compiled, then return the FULL updated JSON object — and ONLY that object, no prose or markdown fences — matching this schema:

${SCHEMA}

Critical rules:
- KEEP every existing winner and talk above. Do not drop any of them. A talk that already happened stays in the list permanently.
- ADD newly-announced Grand Prix / notable metal winners, and newly-completed talks (with a truthful 2-3 line recap of what was actually said on stage — never a preview or prediction).
- Only change an existing entry if it was factually wrong; otherwise leave it exactly as-is.
- The returned "winners" and "talks" arrays must be at least as long as the current ones (${prevWinners} winners, ${prevTalks} talks). Never return fewer.
- talks: only sessions that have actually taken place. Each "link" must be open-access (avoid paywalls like Campaign, Adweek, Digiday, Marketing Week, AdExchanger where a free alternative exists; The Drum, Provoke, LBB, Mumbrella, 9to5Mac, MediaPost, official Cannes pages are fine).
- tally: Gold/Silver/Bronze counts per category for categories whose awards show has happened. pending: categories not yet awarded.
- If unsure about a NEW fact, omit that new item rather than guess. Output valid JSON only.`;

const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { "content-type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
  body: JSON.stringify({
    model: MODEL,
    max_tokens: 8000,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
    messages: [{ role: "user", content: prompt }]
  })
});

if (!res.ok) { console.error("API error", res.status, await res.text()); process.exit(1); }
const data = await res.json();

const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
const cleaned = text.replace(/```json|```/g, "").trim();
const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
if (start === -1 || end === -1) { console.error("No JSON found:\n", text.slice(0, 600)); process.exit(1); }

let next;
try { next = JSON.parse(cleaned.slice(start, end + 1)); }
catch (e) { console.error("JSON parse failed:", e.message); process.exit(1); }

// Shape check.
if (!Array.isArray(next.winners) || !Array.isArray(next.talks) || next.winners.length === 0) {
  console.error("Validation failed (bad shape) — keeping existing data.json.");
  process.exit(1);
}
for (const k of ["tally", "honours", "pending"]) if (!Array.isArray(next[k])) next[k] = [];

// Anti-shrink guard: never let a thin run reduce what's already live.
if (next.winners.length < prevWinners || next.talks.length < prevTalks) {
  console.error(`Refusing to shrink data (was ${prevWinners}w/${prevTalks}t, got ${next.winners.length}w/${next.talks.length}t). Keeping existing data.json.`);
  process.exit(0);
}

let prevRaw = "";
try { prevRaw = readFileSync("data.json", "utf8"); } catch {}
const out = JSON.stringify(next, null, 2);
if (out.trim() === prevRaw.trim()) { console.log("No change — data.json already current."); process.exit(0); }

writeFileSync("data.json", out);
console.log(`Updated data.json — ${next.winners.length} winners (was ${prevWinners}), ${next.talks.length} talks (was ${prevTalks}).`);
