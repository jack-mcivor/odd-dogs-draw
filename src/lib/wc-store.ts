import { useSyncExternalStore } from "react";
import {
  ALL_MATCHES, GROUP_MATCHES, KNOCKOUT_MATCHES, PLAYERS, TEAMS,
  teamOwner, type Match,
} from "./wc-data";

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

let state: AppState = load();
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
    home: ko?.home ?? m.home,
    away: ko?.away ?? m.away,
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

// Compute points awarded to each team in a single played match.
export function pointsForMatch(m: Match): MatchPoints[] {
  const out: MatchPoints[] = [];
  const score = state.scores[m.id];
  if (!score || !score.played) return out;
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
      team: t.name,
      player,
      pot,
      winPts: winPts * multiplier,
      goalPts: goalPts * multiplier,
      wildcardBonus,
      total,
    });
  }
  return out;
}

export interface PlayerTotals {
  player: string;
  winPts: number;
  goalPts: number;
  wildcardBonus: number;
  total: number;
  perTeam: Record<string, { winPts: number; goalPts: number; wildcardBonus: number; total: number; matches: Array<{ match: Match; points: MatchPoints }> }>;
}

export function computeAllTotals(): PlayerTotals[] {
  const map: Record<string, PlayerTotals> = {};
  for (const p of PLAYERS) {
    map[p.name] = {
      player: p.name,
      winPts: 0, goalPts: 0, wildcardBonus: 0, total: 0,
      perTeam: Object.fromEntries(p.teams.map((t) => [t.team, { winPts: 0, goalPts: 0, wildcardBonus: 0, total: 0, matches: [] }])),
    };
  }
  for (const m of ALL_MATCHES) {
    const pts = pointsForMatch(m);
    for (const p of pts) {
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
  }
  return Object.values(map).sort((a, b) => b.total - a.total);
}

// A team is "eliminated" if any match in the knockout stage they were assigned to has been played and they lost.
// Simpler heuristic: eliminated if all their played group matches are done AND they didn't advance (not in any knockout slot)
// after knockout has begun. For tracking purposes we just expose this:
export function isTeamEliminated(team: string): boolean {
  // played all 3 group games and not present in any knockout slot
  const groupGames = GROUP_MATCHES.filter((m) => m.home === team || m.away === team);
  const allPlayed = groupGames.every((m) => state.scores[m.id]?.played);
  if (!allPlayed) return false;
  const inKO = KNOCKOUT_MATCHES.some((m) => {
    const e = effectiveTeams(m);
    return e.home === team || e.away === team;
  });
  // Only call eliminated if knockout assignments have started
  const koStarted = KNOCKOUT_MATCHES.some((m) => state.knockoutSlots[m.id]);
  if (!koStarted) return false;
  return !inKO;
}

export function nextUpcoming(n: number): Match[] {
  const now = Date.now();
  return ALL_MATCHES
    .filter((m) => !state.scores[m.id]?.played)
    .filter((m) => {
      const { home, away } = effectiveTeams(m);
      return home && away;
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((m) => new Date(m.date).getTime() >= now - 1000 * 60 * 60 * 2)
    .slice(0, n);
}

export function recentResults(n: number): Match[] {
  return ALL_MATCHES
    .filter((m) => state.scores[m.id]?.played)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, n);
}
