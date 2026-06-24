
// scripts/update.mjs
// Regenerates data.json for the Cannes Lions 2026 dashboard.
// Runs on a schedule via GitHub Actions. Uses Claude with the web_search
// server tool to compile current winners + completed-talk recaps as JSON.
//
// Requires: Node 20+ (built-in fetch) and an ANTHROPIC_API_KEY secret.
// Honest caveat: an LLM-with-search refresh is a convenience, not a guaranteed
// feed. The authoritative winners list is always Love The Work.

import { writeFileSync, readFileSync } from "node:fs";

// ---- Auto-stop: do nothing after the festival + one buffer week ----
const STOP_AFTER = new Date("2026-07-04T00:00:00Z");
if (new Date() > STOP_AFTER) {
  console.log("Past STOP_AFTER date — refresh disabled. Delete the workflow to tidy up.");
  process.exit(0);
}

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) { console.error("Missing ANTHROPIC_API_KEY"); process.exit(1); }

const today = new Date().toISOString().slice(0, 10);

const SCHEMA = `{
  "updated": "<e.g. 24 Jun 2026>",
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

const prompt = `You are updating a Cannes Lions 2026 intelligence dashboard. Today is ${today}. The festival runs 22-26 June 2026.

Use web search to compile the CURRENT state and return ONLY a single JSON object — no prose, no markdown fences — matching this exact schema:

${SCHEMA}

Rules:
- winners: include every Grand Prix announced so far, plus notable named Gold/Silver/Bronze you can verify. Prefer official canneslions.com and established trade press.
- tally: Gold/Silver/Bronze counts per category for categories whose awards show has happened.
- talks: ONLY sessions that have already taken place (not upcoming). Each "read" must be a truthful recap of what was actually said on stage, drawn from post-event reporting — never a preview or prediction. Each "link" must be an open-access page (avoid known paywalls like Campaign, Adweek, Digiday, Marketing Week, AdExchanger if a free alternative exists; The Drum, Provoke, LBB, Mumbrella, 9to5Mac, MediaPost, official Cannes pages are fine).
- buzz: integer 0-100 reflecting coverage volume and tone. sent: "pos", "mix", or "pol".
- pending: categories not yet awarded.
- If unsure about a fact, omit it rather than guess. Output must be valid JSON and nothing else.`;

const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": API_KEY,
    "anthropic-version": "2023-06-01"
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 12 }],
    messages: [{ role: "user", content: prompt }]
  })
});

if (!res.ok) { console.error("API error", res.status, await res.text()); process.exit(1); }
const data = await res.json();

// Collect the final text blocks (ignore tool_use / search result blocks).
const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();

// Be forgiving: strip any stray fences and grab the outermost JSON object.
const cleaned = text.replace(/```json|```/g, "").trim();
const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
if (start === -1 || end === -1) { console.error("No JSON found in response:\n", text.slice(0, 600)); process.exit(1); }

let next;
try { next = JSON.parse(cleaned.slice(start, end + 1)); }
catch (e) { console.error("JSON parse failed:", e.message); process.exit(1); }

// Minimal validation before we overwrite anything.
if (!Array.isArray(next.winners) || !Array.isArray(next.talks) || next.winners.length === 0) {
  console.error("Validation failed — refusing to overwrite. Keeping existing data.json.");
  process.exit(1);
}
for (const k of ["tally", "honours", "pending"]) if (!Array.isArray(next[k])) next[k] = [];

// Only write if something actually changed (keeps the git history clean).
let prev = "";
try { prev = readFileSync("data.json", "utf8"); } catch {}
const out = JSON.stringify(next, null, 2);
if (out.trim() === prev.trim()) { console.log("No change — data.json already current."); process.exit(0); }

writeFileSync("data.json", out);
console.log(`Updated data.json — ${next.winners.length} winners, ${next.talks.length} talks.`);
