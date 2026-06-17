// openfootball GitHub raw JSON integration: fetches live match data,
// normalises team names, merges with STATIC_MATCH_API_DATA for venue/code/num
// metadata, applies scores, resolves pre-assigned wildcards, and exposes API
// meta state (offline flag, live match IDs, UK TV channels) to the UI.

import { useSyncExternalStore } from "react";
import { GROUP_MATCHES, PLAYERS, STATIC_MATCH_API_DATA, type MatchData } from "./wc-data";
import { bulkSetScores, setAllWildcards, type WildcardUse } from "./wc-store";

const OPENFOOTBALL_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

// openfootball team name → canonical app team name.
// Names not in this map are assumed to already be canonical.
const TEAM_NAME_MAP: Record<string, string> = {
  "USA": "United States",
  "Ivory Coast": "Côte d'Ivoire",
  "Iran": "Iran",
  "Cape Verde": "Cape Verde",
  "Bosnia and Herzegovina": "Bosnia & Herzegovina",
  "UEFA Path A winner": "Bosnia & Herzegovina",
  "UEFA Path B winner": "Sweden",
  "UEFA Path C winner": "Türkiye",
  "UEFA Path D winner": "Czechia",
  "IC Path 1 winner": "DR Congo",
  "IC Path 2 winner": "Iraq",
};
export function canonName(n: string): string {
  return TEAM_NAME_MAP[n] ?? n;
}

// --- openfootball types -------------------------------------------------------

interface OfMatch {
  round?: string;
  date: string;
  time?: string;
  team1: string;
  team2: string;
  group?: string;
  ground?: string;
  score1?: number;
  score2?: number;
  num?: number;
}
interface OfResponse { name?: string; matches?: OfMatch[]; }

// --- Pre-assigned wildcards ---------------------------------------------------

export const WILDCARD_ASSIGNMENTS: Record<
  string,
  { pot3: [string, string]; pot4: [string, string] }
> = {
  "J'Ashley":    { pot3: ["Côte d'Ivoire", "Curaçao"],          pot4: ["Sweden", "Tunisia"] },
  "Edward":      { pot3: ["Panama", "Ghana"],                    pot4: ["Iraq", "Senegal"] },
  "Xavier":      { pot3: ["Egypt", "New Zealand"],               pot4: ["Ghana", "Panama"] },
  "Neil":        { pot3: ["Bosnia & Herzegovina", "Qatar"],       pot4: ["Bosnia & Herzegovina", "Switzerland"] },
  "Jess":        { pot3: ["Algeria", "Jordan"],                  pot4: ["New Zealand", "Iran"] },
  "Gigi":        { pot3: ["Czechia", "South Africa"],            pot4: ["Haiti", "Scotland"] },
  "Andy":        { pot3: ["Scotland", "Haiti"],                  pot4: ["Curaçao", "Ecuador"] },
  "Better Andy": { pot3: ["Sweden", "Tunisia"],                  pot4: ["DR Congo", "Uzbekistan"] },
  "Victoria":    { pot3: ["Paraguay", "Türkiye"],                pot4: ["Türkiye", "Australia"] },
  "Dana":        { pot3: ["Saudi Arabia", "Cape Verde"],         pot4: ["Jordan", "Algeria"] },
  "Michelle":    { pot3: ["Norway", "Iraq"],                     pot4: ["Cape Verde", "Saudi Arabia"] },
  "Violet":      { pot3: ["Uzbekistan", "DR Congo"],             pot4: ["Czechia", "South Africa"] },
};

function findGroupMatchId(a: string, b: string): string | undefined {
  return GROUP_MATCHES.find(
    (m) => (m.home === a && m.away === b) || (m.home === b && m.away === a),
  )?.id;
}

export function resolveWildcards(): Record<string, WildcardUse[]> {
  const out: Record<string, WildcardUse[]> = {};
  for (const p of PLAYERS) {
    const assign = WILDCARD_ASSIGNMENTS[p.name];
    if (!assign) continue;
    const uses: WildcardUse[] = [];
    const id3 = findGroupMatchId(assign.pot3[0], assign.pot3[1]);
    const id4 = findGroupMatchId(assign.pot4[0], assign.pot4[1]);
    if (id3) uses.push({ matchId: id3, pot: 3 });
    if (id4) uses.push({ matchId: id4, pot: 4 });
    out[p.name] = uses;
  }
  return out;
}

// --- API meta store -----------------------------------------------------------

export interface TvChannel { name: string; type: string; note: string; }

interface ApiMeta {
  offline: boolean;
  loaded: boolean;
  liveMatchIds: Set<string>;
  lastFetch: number;
  ukChannels: TvChannel[];
}

let meta: ApiMeta = {
  offline: false,
  loaded: false,
  liveMatchIds: new Set(),
  lastFetch: 0,
  ukChannels: [
    { name: "BBC", type: "Free", note: "Shared 50/50 with ITV." },
    { name: "ITV", type: "Free", note: "Shared 50/50 with BBC." },
  ],
};

const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }

export function getApiMeta() { return meta; }
export function useApiMeta(): ApiMeta {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => meta,
    () => meta,
  );
}

// --- Time parsing -------------------------------------------------------------

// "HH:MM UTC±N" + "YYYY-MM-DD" → "YYYY-MM-DDTHH:MM:00Z"
export function parseOfDatetime(date: string, time: string | undefined): string | null {
  if (!time) return null;
  const parts = time.split(" UTC");
  if (parts.length !== 2) return null;
  const [hhmm, offStr] = parts;
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const offset = parseInt(offStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m) || Number.isNaN(offset)) return null;

  let utcH = h - offset;
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (utcH >= 24) { d.setUTCDate(d.getUTCDate() + 1); utcH -= 24; }
  else if (utcH < 0) { d.setUTCDate(d.getUTCDate() - 1); utcH += 24; }

  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${String(utcH).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;
}

// --- Merge openfootball with STATIC_MATCH_API_DATA ---------------------------

function mergeWithStatic(ofMatches: OfMatch[]): MatchData[] {
  const staticArr = STATIC_MATCH_API_DATA.data;
  const out: MatchData[] = [];

  for (const of of ofMatches) {
    const home = canonName(of.team1);
    const away = canonName(of.team2);
    const parsedDt = parseOfDatetime(of.date, of.time);
    const hasScores = typeof of.score1 === "number" && typeof of.score2 === "number";

    const staticMatch = staticArr.find(
      (s) => s.home_name === home && s.away_name === away,
    );

    if (staticMatch) {
      const merged: MatchData = {
        ...staticMatch,
        datetime_utc: parsedDt ?? staticMatch.datetime_utc,
      };
      if (hasScores) {
        merged.score_home = of.score1;
        merged.score_away = of.score2;
        merged.status = "FINISHED";
      } else {
        delete merged.score_home;
        delete merged.score_away;
        delete merged.status;
      }
      out.push(merged);
    } else {
      // No static counterpart (unresolved knockout placeholder) — emit minimal record.
      out.push({
        num: of.num ?? 0,
        date: of.date,
        time_utc: parsedDt ? parsedDt.slice(11, 16) : "",
        datetime_utc: parsedDt ?? `${of.date}T00:00:00Z`,
        home: null,
        away: null,
        home_name: home,
        away_name: away,
        group: of.group ?? null,
        phase: of.group ? "group" : "knockout",
        venue: "",
        venue_name: of.ground,
        slug: `${home.toLowerCase()}-vs-${away.toLowerCase()}-${of.date}`,
        ...(hasScores
          ? { score_home: of.score1, score_away: of.score2, status: "FINISHED" }
          : {}),
      });
    }
  }

  return out;
}

// --- Fetchers -----------------------------------------------------------------

export async function fetchAndApply(): Promise<void> {
  let matches: MatchData[];
  let usingOfflineData = false;

  try {
    const res = await fetch(OPENFOOTBALL_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as OfResponse;
    if (!json.matches || json.matches.length === 0) throw new Error("empty matches");
    matches = mergeWithStatic(json.matches);
  } catch (e) {
    console.log("openfootball fetch failed, using static fallback", e);
    matches = STATIC_MATCH_API_DATA.data;
    usingOfflineData = true;
  }

  const updates: Array<{ id: string; home: number; away: number; played: boolean }> = [];
  const live = new Set<string>();
  const now = Date.now();

  for (const m of matches) {
    if (m.phase !== "group") continue;
    const home = m.home_name;
    const away = m.away_name;
    if (!home || !away) continue;
    const id = findGroupMatchId(home, away);
    if (!id) continue;

    const isFinished = m.status === "FINISHED"
      && typeof m.score_home === "number"
      && typeof m.score_away === "number";

    if (isFinished) {
      updates.push({ id, home: m.score_home!, away: m.score_away!, played: true });
    } else if (new Date(m.datetime_utc).getTime() <= now) {
      live.add(id);
    }
  }

  bulkSetScores(updates);
  meta = { ...meta, offline: usingOfflineData, loaded: true, liveMatchIds: live, lastFetch: Date.now() };
  emit();
}

// One-shot init: pre-apply wildcards, start 30-minute polling.
let started = false;
export function initApi() {
  if (started || typeof window === "undefined") return;
  started = true;
  setAllWildcards(resolveWildcards());
  fetchAndApply();
  window.setInterval(fetchAndApply, 30 * 60 * 1000);
}
