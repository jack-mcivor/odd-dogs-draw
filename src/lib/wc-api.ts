// Live match data: fetches openfootball/worldcup.json from GitHub raw,
// normalises team names, applies scores, resolves pre-assigned wildcards,
// and exposes API meta state (offline status, live match IDs, UK TV channels).
// Falls back to STATIC_MATCH_API_DATA when the live fetch fails.

import { useSyncExternalStore } from "react";
import { GROUP_MATCHES, PLAYERS, STATIC_MATCH_API_DATA, type MatchData } from "./wc-data";
import { bulkSetScores, setAllWildcards, type WildcardUse } from "./wc-store";

const OPENFOOTBALL_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

// API name → canonical app name (only when they differ).
const NAME_MAP: Record<string, string> = {
  "Turkey": "Türkiye",
  "Türkiye": "Türkiye",
  "USA": "United States",
  "United States": "United States",
  "Czech Republic": "Czechia",
  "Czechia": "Czechia",
  "Ivory Coast": "Côte d'Ivoire",
  "Côte d'Ivoire": "Côte d'Ivoire",
  "Bosnia-Herzegovina": "Bosnia & Herzegovina",
  "Bosnia and Herzegovina": "Bosnia & Herzegovina",
  "Congo DR": "DR Congo",
  "DR Congo": "DR Congo",
  "Cape Verde Islands": "Cape Verde",
  "Cape Verde": "Cape Verde",
};
export function canonName(n: string): string {
  return NAME_MAP[n] ?? n;
}

// Pre-assigned wildcards. Each value identifies the unique group-stage match
// by the two team names that play in it (order-independent, canonical names).
export const WILDCARD_ASSIGNMENTS: Record<
  string,
  { pot3: [string, string]; pot4: [string, string] }
> = {
  "Jash":        { pot3: ["Côte d'Ivoire", "Curaçao"],          pot4: ["Sweden", "Tunisia"] },
  "Ed":          { pot3: ["Panama", "Ghana"],                    pot4: ["Iraq", "Senegal"] },
  "Xavier":      { pot3: ["Egypt", "New Zealand"],               pot4: ["Ghana", "Panama"] },
  "Neil":        { pot3: ["Bosnia & Herzegovina", "Qatar"],       pot4: ["Bosnia & Herzegovina", "Switzerland"] },
  "Jess":        { pot3: ["Algeria", "Jordan"],                  pot4: ["New Zealand", "Iran"] },
  "Gigi":        { pot3: ["Czechia", "South Africa"],            pot4: ["Haiti", "Scotland"] },
  "Landy":       { pot3: ["Scotland", "Haiti"],                  pot4: ["Curaçao", "Ecuador"] },
  "Bandy":       { pot3: ["Sweden", "Tunisia"],                  pot4: ["DR Congo", "Uzbekistan"] },
  "Vic":         { pot3: ["Paraguay", "Türkiye"],                pot4: ["Türkiye", "Australia"] },
  "Dana":        { pot3: ["Saudi Arabia", "Cape Verde"],         pot4: ["Jordan", "Algeria"] },
  "Mikki":       { pot3: ["Norway", "Iraq"],                     pot4: ["Cape Verde", "Saudi Arabia"] },
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

// --- Fetchers -----------------------------------------------------------------

// openfootball match shape (only the fields we use).
interface OpenFootballGoal { name: string; minute: string; penalty?: boolean; owngoal?: boolean; }
interface OpenFootballMatch {
  date: string;
  time: string; // e.g. "13:00 UTC-6"
  team1: string;
  team2: string;
  group?: string;
  score?: { ft?: [number, number]; ht?: [number, number] };
  goals1?: OpenFootballGoal[];
  goals2?: OpenFootballGoal[];
}

// Parse "HH:MM UTC±N" + ISO date into a UTC Date.
function parseOpenFootballDateTime(date: string, time: string): Date {
  const m = /^(\d{2}):(\d{2})\s+UTC([+-]\d{1,2})(?::?(\d{2}))?$/.exec(time.trim());
  if (!m) return new Date(`${date}T${time}`);
  const [, hh, mm, offH, offM = "00"] = m;
  const sign = offH.startsWith("-") ? "-" : "+";
  const offHH = offH.replace(/^[+-]/, "").padStart(2, "0");
  // ISO offset on the timestamp itself.
  return new Date(`${date}T${hh}:${mm}:00${sign}${offHH}:${offM}`);
}

// Convert openfootball matches into the internal MatchData shape used downstream.
function openFootballToMatchData(matches: OpenFootballMatch[]): MatchData[] {
  return matches.map((m, i) => {
    const dt = parseOpenFootballDateTime(m.date, m.time);
    const finished = Array.isArray(m.score?.ft);
    return {
      num: i + 1,
      date: m.date,
      time_utc: dt.toISOString().slice(11, 16),
      datetime_utc: dt.toISOString(),
      home: m.team1,
      away: m.team2,
      home_name: m.team1,
      away_name: m.team2,
      group: m.group ?? null,
      phase: "group",
      venue: "",
      slug: "",
      score_home: finished ? m.score!.ft![0] : undefined,
      score_away: finished ? m.score!.ft![1] : undefined,
      status: finished ? "FINISHED" : "SCHEDULED",
    } as MatchData;
  });
}

async function fetchOpenFootball(): Promise<MatchData[]> {
  const res = await fetch(OPENFOOTBALL_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { matches: OpenFootballMatch[] };
  return openFootballToMatchData(json.matches ?? []);
}

async function fetchJsonStatic<T>(path: string): Promise<T> {
  const res = await fetch(`../static/api/${path}`);
  return res.json() as Promise<T>;
}

export async function fetchAndApply(): Promise<void> {
  let matches: MatchData[];
  let isStaticData = false;
  try {
    matches = await fetchOpenFootball();
  } catch (e) {
    console.warn("openfootball fetch failed, using static fallback", e);
    matches = STATIC_MATCH_API_DATA.data;
    isStaticData = true;
  }

  const updates: Array<{ id: string; home: number; away: number; played: boolean }> = [];
  const live = new Set<string>();
  const now = Date.now();

  for (const m of matches) {
    if (m.phase !== "group") continue;
    const home = canonName(m.home_name ?? m.home ?? "");
    const away = canonName(m.away_name ?? m.away ?? "");
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
  meta = { ...meta, offline: isStaticData, loaded: true, liveMatchIds: live, lastFetch: Date.now() };
  emit();
}


export async function fetchTv(): Promise<void> {
  try {
    const tv = await fetchJsonStatic<{ data: Array<{ code: string; channels: TvChannel[] }> }>("tv.json");
    const uk = tv.data.find((c) => c.code === "uk" || c.code === "gb");
    if (uk?.channels?.length) {
      meta = { ...meta, ukChannels: uk.channels };
      emit();
    }
  } catch {
    // keep fallback channels
  }
}

// One-shot init: pre-apply wildcards, start polling. Safe to call multiple times.
let started = false;
export function initApi() {
  if (started || typeof window === "undefined") return;
  started = true;
  setAllWildcards(resolveWildcards());
  fetchTv();
  fetchAndApply();
  window.setInterval(fetchAndApply, 60_000);
}
