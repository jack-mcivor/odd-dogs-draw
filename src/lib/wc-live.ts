// Supplementary live data from worldcup26.ir. Enriches existing matches with
// live score, status, and goal scorers. Never replaces the primary data layer.
// Fails silently on any error.

import { useSyncExternalStore } from "react";
import { ALL_MATCHES, GROUP_MATCHES, type Match } from "./wc-data";
import { canonName } from "./wc-api";

const ENDPOINT = "https://worldcup26.ir/get/games";

const EXTRA_NAME_MAP: Record<string, string> = {
  "Czech Republic": "Czechia",
  "Bosnia and Herzegovina": "Bosnia & Herzegovina",
  "Cape Verde Islands": "Cape Verde",
  "IR Iran": "Iran",
  "Curacao": "Curaçao",
  "Ivory Coast": "Côte d'Ivoire",
  "USA": "United States",
};

function normaliseName(n: string): string {
  return EXTRA_NAME_MAP[n] ?? canonName(n);
}

export type LiveStatus = "UPCOMING" | "LIVE" | "FINISHED";

export interface LiveMatch {
  matchId: string;
  liveStatus: LiveStatus;
  liveScoreHome: number;
  liveScoreAway: number;
  homeScorers: string[];
  awayScorers: string[];
  timeElapsed: string;
}

interface LiveState {
  loading: boolean;
  loaded: boolean;
  byMatchId: Record<string, LiveMatch>;
}

let state: LiveState = { loading: false, loaded: false, byMatchId: {} };
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }

export function getLiveState(): LiveState { return state; }

export function useLiveState(): LiveState {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => state,
    () => state,
  );
}

export function useLiveMatch(matchId: string): LiveMatch | undefined {
  return useLiveState().byMatchId[matchId];
}

export function getLiveMatch(matchId: string): LiveMatch | undefined {
  return state.byMatchId[matchId];
}

interface RawGame {
  id?: string;
  home_score?: string;
  away_score?: string;
  home_scorers?: string;
  away_scorers?: string;
  finished?: string;
  time_elapsed?: string;
  home_team_name_en?: string;
  away_team_name_en?: string;
}

function parseScorers(raw: string | null | undefined): string[] {
  if (!raw || raw === "{}") return [];
  const inner = raw.replace(/^\{/, "").replace(/\}$/, "");
  const matches = inner.match(/"([^"]+)"/g);
  if (!matches) return [];
  return matches.map((m) => m.replace(/^"|"$/g, ""));
}

function deriveStatus(finished: string | undefined, timeElapsed: string | undefined): LiveStatus {
  if (finished === "TRUE") return "FINISHED";
  const te = (timeElapsed ?? "").trim();
  if (!te || te === "0") return "UPCOMING";
  if (te === "HT") return "LIVE";
  if (/^\d+(\+\d+)?$/.test(te)) return "LIVE";
  return "UPCOMING";
}

function parseScore(s: string | undefined): number {
  const n = parseInt(s ?? "", 10);
  return Number.isFinite(n) ? n : 0;
}

function findMatch(g: RawGame): Match | undefined {
  if (g.id) {
    const idx = parseInt(g.id, 10);
    if (Number.isFinite(idx) && idx >= 1 && idx <= GROUP_MATCHES.length) {
      return GROUP_MATCHES[idx - 1];
    }
  }
  const home = normaliseName(g.home_team_name_en ?? "");
  const away = normaliseName(g.away_team_name_en ?? "");
  if (!home || !away) return undefined;
  return ALL_MATCHES.find(
    (m) => (m.home === home && m.away === away) || (m.home === away && m.away === home),
  );
}

export async function fetchLive(): Promise<void> {
  if (typeof window === "undefined") return;
  state = { ...state, loading: true };
  emit();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(ENDPOINT, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json || json.success !== true || !Array.isArray(json.data)) {
      console.warn("worldcup26.ir: unexpected payload shape");
      state = { ...state, loading: false, loaded: true };
      emit();
      return;
    }
    const byMatchId: Record<string, LiveMatch> = {};
    for (const raw of json.data as RawGame[]) {
      try {
        const m = findMatch(raw);
        if (!m) continue;
        byMatchId[m.id] = {
          matchId: m.id,
          liveStatus: deriveStatus(raw?.finished, raw?.time_elapsed),
          liveScoreHome: parseScore(raw?.home_score),
          liveScoreAway: parseScore(raw?.away_score),
          homeScorers: parseScorers(raw?.home_scorers),
          awayScorers: parseScorers(raw?.away_scorers),
          timeElapsed: (raw?.time_elapsed ?? "").trim(),
        };
      } catch (e) {
        console.warn("worldcup26.ir: per-match parse failed", e);
      }
    }
    state = { loading: false, loaded: true, byMatchId };
    emit();
  } catch (e) {
    console.warn("worldcup26.ir fetch failed", e);
    state = { ...state, loading: false, loaded: state.loaded };
    emit();
  } finally {
    window.clearTimeout(timeout);
  }
}

let started = false;
export function initLive() {
  if (started || typeof window === "undefined") return;
  started = true;
  fetchLive();
  window.setInterval(fetchLive, 60_000);
}
