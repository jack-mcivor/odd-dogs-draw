// wheniskickoff.com API integration: fetches live match data, applies scores,
// resolves pre-assigned wildcards to real match IDs, and exposes API meta state
// (offline status, live match IDs, UK TV channels) to the UI.

import { useSyncExternalStore } from "react";
import { GROUP_MATCHES, PLAYERS } from "./wc-data";
import { bulkSetScores, setAllWildcards, type WildcardUse } from "./wc-store";

const BASE = "https://wheniskickoff.com/data/v1";

// API name → canonical app name (only when they differ).
const NAME_MAP: Record<string, string> = {
  "Turkey": "Türkiye",
  "Türkiye": "Türkiye",
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
  "J'Ashley":    { pot3: ["Côte d'Ivoire", "Curaçao"],          pot4: ["Sweden", "Tunisia"] },
  "Edward":      { pot3: ["Panama", "Ghana"],                    pot4: ["Iraq", "Senegal"] },
  "Xavier":      { pot3: ["Egypt", "New Zealand"],               pot4: ["Ghana", "Panama"] },
  "Neil":        { pot3: ["Switzerland", "Bosnia & Herzegovina"],pot4: ["Bosnia & Herzegovina", "Qatar"] },
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

// --- Fetchers -----------------------------------------------------------------

interface ApiMatch {
  num: number;
  date: string;
  time_utc: string;
  datetime_utc: string;
  home: string;
  away: string;
  home_name: string;
  away_name: string;
  group?: string;
  phase: string;
  venue: string;
  venue_name?: string;
  venue_city?: string;
  slug: string;
  score_home?: number;
  score_away?: number;
  status?: string;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, { cache: "no-store", headers:
        {
            "Access-Control-Allow-Origin": "https://wheniskickoff.com",
            "Access-Control-Allow-Methods": "HEAD, GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Origin, Content-Type, X-Auth-Token",
            "Access-Control-Allow-Credentials": "true"
        } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function fetchJsonStatic<T>(path: string): Promise<T> {
  const res = await fetch(`../static/api/${path}`);
  return res.json() as Promise<T>;
}

export async function fetchAndApply(): Promise<void> {
  let matchesJson, isStaticData = false;
  try {
    matchesJson = await fetchJson<{ data: ApiMatch[] }>("matches.json");
  } catch {
    matchesJson = await fetchJsonStatic<{ data: ApiMatch[] }>("matches.json");
    isStaticData = true;
    console.log('Using static data')
  }
    
  const updates: Array<{ id: string; home: number; away: number; played: boolean }> = [];
  const live = new Set<string>();
  const now = Date.now();

  for (const m of matchesJson.data) {
    if (m.phase !== "group") continue;
    const home = canonName(m.home_name);
    const away = canonName(m.away_name);
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
  meta = { ...meta, offline: !isStaticData, loaded: true, liveMatchIds: live, lastFetch: Date.now() };
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
