import { useSyncExternalStore } from "react";
import {
  ALL_MATCHES, KNOCKOUT_MATCHES, PLAYERS, TEAMS,
  teamOwner, type Match,
} from "./wc-data";
import { getLiveMatch } from "./wc-live";

export interface MatchScore {
  home: number;
  away: number;
  played: boolean;
}

export interface WildcardUse {
  matchId: string;
  pot: 3 | 4;
}

export interface AppState {
  scores: Record<string, MatchScore>; // matchId -> score
  // Knockout slot overrides: matchId -> { home?: teamName, away?: teamName }
  knockoutSlots: Record<string, { home?: string; away?: string }>;
  // Wildcards used: playerName -> WildcardUse[] (max 2: one pot3, one pot4)
  wildcards: Record<string, WildcardUse[]>;
}

const KEY = "odd-dogs-wc-2026-v1";

function load(): AppState {
  if (typeof localStorage === "undefined") {
    return { scores: {}, knockoutSlots: {}, wildcards: {} };
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { scores: {}, knockoutSlots: {}, wildcards: {} };
    const parsed = JSON.parse(raw);
    return {
      scores: parsed.scores ?? {},
      knockoutSlots: parsed.knockoutSlots ?? {},
      wildcards: parsed.wildcards ?? {},
    };
  } catch {
    return { scores: {}, knockoutSlots: {}, wildcards: {} };
  }
}

let state: AppState = { scores: {}, knockoutSlots: {}, wildcards: {} };
const listeners = new Set<() => void>();

function emit() {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(KEY, JSON.stringify(state));
  }
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function loadFromStorage(): void {
  state = load();
  emit();
}

export function getState(): AppState {
  return state;
}

export function useAppState(): AppState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

export function setScore(matchId: string, home: number, away: number, played: boolean) {
  state = {
    ...state,
    scores: { ...state.scores, [matchId]: { home, away, played } },
  };
  emit();
}

// Bulk set/replace scores in one emit — used by the API poller to avoid
// triggering 30+ re-renders per refresh.
export function bulkSetScores(
  updates: Array<{ id: string; home: number; away: number; played: boolean }>,
) {
  if (updates.length === 0) return;
  const next = { ...state.scores };
  let changed = false;
  for (const u of updates) {
    const cur = next[u.id];
    if (!cur || cur.home !== u.home || cur.away !== u.away || cur.played !== u.played) {
      next[u.id] = { home: u.home, away: u.away, played: u.played };
      changed = true;
    }
  }
  if (!changed) return;
  state = { ...state, scores: next };
  emit();
}

// Replace the entire wildcards map (used to apply pre-assigned wildcards on init).
export function setAllWildcards(wildcards: Record<string, WildcardUse[]>) {
  // Avoid an unnecessary emit if nothing actually changed.
  const cur = JSON.stringify(state.wildcards);
  const nxt = JSON.stringify(wildcards);
  if (cur === nxt) return;
  state = { ...state, wildcards };
  emit();
}

export function clearScore(matchId: string) {
  const { [matchId]: _, ...rest } = state.scores;
  state = { ...state, scores: rest };
  emit();
}

export function setKnockoutSlot(matchId: string, side: "home" | "away", team: string) {
  const cur = state.knockoutSlots[matchId] ?? {};
  state = {
    ...state,
    knockoutSlots: { ...state.knockoutSlots, [matchId]: { ...cur, [side]: team || undefined } },
  };
  emit();
}

export function useWildcard(player: string, pot: 3 | 4, matchId: string): boolean {
  const used = state.wildcards[player] ?? [];
  if (used.some((u) => u.pot === pot)) return false;
  state = {
    ...state,
    wildcards: { ...state.wildcards, [player]: [...used, { matchId, pot }] },
  };
  emit();
  return true;
}

// Effective home/away for a match (knockout slots override blank teams)
export function effectiveTeams(m: Match): { home: string; away: string } {
  if (m.stage === "group") return { home: m.home, away: m.away };
  const ko = state.knockoutSlots[m.id];
  return {
    home: m.home || ko?.home || "",
    away: m.away || ko?.away || "",
  };
}

export interface MatchPoints {
  team: string;
  player: string | undefined;
  pot: 1 | 2 | 3 | 4 | undefined;
  winPts: number;
  goalPts: number;
  wildcardBonus: number;
  total: number;
}

// Returns the effective confirmed score for a match. Prefers live FINISHED
// data from worldcup26.ir over locally stored scores. Returns undefined if
// the match is not finished.
export function effectiveScore(matchId: string): { home: number; away: number } | undefined {
  const live = getLiveMatch(matchId);
  if (live && live.liveStatus === "FINISHED") {
    return { home: live.liveScoreHome, away: live.liveScoreAway };
  }
  const s = state.scores[matchId];
  if (s?.played) return { home: s.home, away: s.away };
  return undefined;
}

// Score to use for display in any context: confirmed first, then in-progress live.
export function displayScore(matchId: string): { home: number; away: number; live: boolean; played: boolean } | undefined {
  const live = getLiveMatch(matchId);
  if (live && live.liveStatus === "FINISHED") {
    return { home: live.liveScoreHome, away: live.liveScoreAway, live: false, played: true };
  }
  if (live && live.liveStatus === "LIVE") {
    return { home: live.liveScoreHome, away: live.liveScoreAway, live: true, played: false };
  }
  const s = state.scores[matchId];
  if (s?.played) return { home: s.home, away: s.away, live: false, played: true };
  return undefined;
}

export function isMatchLive(matchId: string): boolean {
  return getLiveMatch(matchId)?.liveStatus === "LIVE";
}

function computeMatchPointsFromScore(
  m: Match,
  score: { home: number; away: number },
): MatchPoints[] {
  const out: MatchPoints[] = [];
  const { home, away } = effectiveTeams(m);
  if (!home || !away) return out;
  const teams: Array<{ name: string; goals: number; opp: number }> = [
    { name: home, goals: score.home, opp: score.away },
    { name: away, goals: score.away, opp: score.home },
  ];
  for (const t of teams) {
    const teamData = TEAMS[t.name];
    if (!teamData) continue;
    const player = teamOwner(t.name);
    const pot = teamData.pot;
    let winPts = 0;
    if (t.goals > t.opp) winPts = pot;
    else if (t.goals === t.opp) winPts = pot / 2;
    const goalPts = t.goals * pot;
    let multiplier = 1;
    if (m.stage === "group" && player) {
      const used = state.wildcards[player] ?? [];
      if (used.some((u) => u.matchId === m.id && u.pot === pot)) multiplier = 2;
    }
    const baseTotal = winPts + goalPts;
    const total = baseTotal * multiplier;
    const wildcardBonus = total - baseTotal;
    out.push({
      team: t.name, player, pot,
      winPts: winPts * multiplier,
      goalPts: goalPts * multiplier,
      wildcardBonus, total,
    });
  }
  return out;
}

// Compute confirmed points for a played match (live FINISHED overrides local).
export function pointsForMatch(m: Match): MatchPoints[] {
  const score = effectiveScore(m.id);
  if (!score) return [];
  return computeMatchPointsFromScore(m, score);
}

// Projected points from an in-progress LIVE match. Returns [] when not live.
export function pointsForMatchLive(m: Match): MatchPoints[] {
  const live = getLiveMatch(m.id);
  if (!live || live.liveStatus !== "LIVE") return [];
  return computeMatchPointsFromScore(m, { home: live.liveScoreHome, away: live.liveScoreAway });
}

export interface PlayerTotals {
  player: string;
  winPts: number;
  goalPts: number;
  wildcardBonus: number;
  total: number;
  livePts: number;          // projected from currently LIVE matches only
  projectedTotal: number;   // total + livePts
  hasLive: boolean;         // any of the player's teams currently in a LIVE match
  perTeam: Record<string, { winPts: number; goalPts: number; wildcardBonus: number; total: number; matches: Array<{ match: Match; points: MatchPoints; live?: boolean }> }>;
}

export function computeAllTotals(): PlayerTotals[] {
  const map: Record<string, PlayerTotals> = {};
  for (const p of PLAYERS) {
    map[p.name] = {
      player: p.name,
      winPts: 0, goalPts: 0, wildcardBonus: 0, total: 0,
      livePts: 0, projectedTotal: 0, hasLive: false,
      perTeam: Object.fromEntries(p.teams.map((t) => [t.team, { winPts: 0, goalPts: 0, wildcardBonus: 0, total: 0, matches: [] }])),
    };
  }
  for (const m of ALL_MATCHES) {
    const confirmed = pointsForMatch(m);
    for (const p of confirmed) {
      if (!p.player) continue;
      const player = map[p.player];
      player.winPts += p.winPts;
      player.goalPts += p.goalPts;
      player.wildcardBonus += p.wildcardBonus;
      player.total += p.total;
      const t = player.perTeam[p.team];
      if (t) {
        t.winPts += p.winPts;
        t.goalPts += p.goalPts;
        t.wildcardBonus += p.wildcardBonus;
        t.total += p.total;
        t.matches.push({ match: m, points: p });
      }
    }
    const live = pointsForMatchLive(m);
    for (const p of live) {
      if (!p.player) continue;
      const player = map[p.player];
      player.livePts += p.total;
      player.hasLive = true;
      const t = player.perTeam[p.team];
      if (t) t.matches.push({ match: m, points: p, live: true });
    }
  }
  for (const player of Object.values(map)) {
    player.projectedTotal = player.total + player.livePts;
  }
  return Object.values(map).sort((a, b) => b.projectedTotal - a.projectedTotal || b.total - a.total);
}


export function isTeamEliminated(team: string): boolean {
  const lostKnockout = KNOCKOUT_MATCHES.some((m) => {
    const score = effectiveScore(m.id);
    if (!score || score.home === score.away) return false;
    const e = effectiveTeams(m);
    if (e.home !== team && e.away !== team) return false;
    return e.home === team ? score.home < score.away : score.away < score.home;
  });
  if (lostKnockout) return true;

  const hasKnownKnockoutField = KNOCKOUT_MATCHES.some((m) => {
    const e = effectiveTeams(m);
    return !!e.home || !!e.away;
  });
  if (!hasKnownKnockoutField) return false;

  const inKnownKnockout = KNOCKOUT_MATCHES.some((m) => {
    const e = effectiveTeams(m);
    return e.home === team || e.away === team;
  });
  return !inKnownKnockout;
}

export function nextUpcoming(n: number): Match[] {
  const now = Date.now();
  return ALL_MATCHES
    .filter((m) => {
      const { home, away } = effectiveTeams(m);
      return home && away;
    })
    .filter((m) => new Date(m.date).getTime() >= now - 1000 * 60 * 60 * 4)
    .filter((m) => !effectiveScore(m.id))
    .sort((a, b) => {
      // LIVE matches first
      const al = isMatchLive(a.id) ? 0 : 1;
      const bl = isMatchLive(b.id) ? 0 : 1;
      if (al !== bl) return al - bl;
      return a.date.localeCompare(b.date);
    })
    .slice(0, n);
}

export function recentResults(n: number): Match[] {
  return ALL_MATCHES
    .filter((m) => !!effectiveScore(m.id))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, n);
}
