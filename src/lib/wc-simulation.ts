// Elo-driven Monte Carlo tournament simulator.
// Holds current live Elo FIXED, simulates every unplayed match (group +
// knockout), runs N iterations, and reports per-team probabilities of
// reaching each stage and winning the tournament.

import {
  ALL_MATCHES, CONFIRMED_R32_MATCHUPS, GROUP_MATCHES, GROUPS, GROUP_LETTERS, KNOCKOUT_MATCHES,
  TEAMS, type GroupLetter, type Match,
} from "./wc-data";
import { effectiveScore, getState } from "./wc-store";
import {
  contextDelta as computeContextDelta, getContextState,
  refereeNoise, type ContextState,
} from "./wc-context";
import { computeTeamPower } from "./wc-power";

const HOSTS = new Set(["United States", "Canada", "Mexico"]);
const HOST_ADJ = 80;
const DEFAULT_N = 10000;

export interface TeamSimProbs {
  qualify: number;
  r16: number;
  qf: number;
  sf: number;
  final: number;
  win: number;
}

// ---------- math helpers ----------
function poisson(lambda: number): number {
  // Knuth — fine for the small lambdas (~0.2 to ~3) we use.
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  while (true) {
    k++;
    p *= Math.random();
    if (p <= L) return k - 1;
    if (k > 20) return k - 1; // safety guard
  }
}

function hostAdj(team: string): number {
  return HOSTS.has(team) ? HOST_ADJ : 0;
}

function simMatch(
  teamA: string, teamB: string, elo: Record<string, number>, knockout: boolean,
  ctxDelta: number,
): { gA: number; gB: number; winnerA: boolean } {
  const eloA = elo[teamA] ?? 1500;
  const eloB = elo[teamB] ?? 1500;
  const hA = hostAdj(teamA);
  const hB = hostAdj(teamB);
  // Referee variance: fresh ±25-Elo noise applied to every match in every run.
  const noise = refereeNoise();
  const supremacy = ((eloA + hA) - (eloB + hB) + ctxDelta + noise) / 200;
  const lambdaA = Math.max(0.2, 1.35 + supremacy / 2);
  const lambdaB = Math.max(0.2, 1.35 - supremacy / 2);
  const gA = poisson(lambdaA);
  const gB = poisson(lambdaB);
  let winnerA: boolean;
  if (gA > gB) winnerA = true;
  else if (gB > gA) winnerA = false;
  else if (knockout) {
    // Shootout: Elo-weighted coin flip with host adjustment + context delta
    // (no extra ref noise — pen shootouts are already lottery-level random).
    const pA = 1 / (1 + Math.pow(10, ((eloB + hB) - (eloA + hA) - ctxDelta) / 400));
    winnerA = Math.random() < pA;
  } else {
    winnerA = false; // ignored for groups; result is a draw
  }
  return { gA, gB, winnerA };
}

// ---------- inputs prepared once per simulateTournament call ----------
interface PreparedGroupMatch {
  m: Match;
  home: string;
  away: string;
  played?: { h: number; a: number };
  ctxDelta: number;  // precomputed from snapshot (constant across runs)
}

interface PreparedKnockoutOverride {
  // For knockout matches whose slots are filled AND have a real result, we
  // can lock the winner regardless of how the sim threaded teams through.
  // We DON'T use these as bracket bypasses (a sim could route different
  // teams through). The override matches by the canonical R32/R16/QF/SF/F
  // index. If the sim happens to produce the same pair, lock the result.
  matchId: string;
  home: string;
  away: string;
  winner: string; // resolved winner (penalty winner ignored — uses stored slot if drawn)
}

interface SimInputs {
  elo: Record<string, number>;
  groupMatches: Record<GroupLetter, PreparedGroupMatch[]>;
  // matchId -> override (only when both slots filled AND score recorded)
  knockoutOverrides: Record<string, { home: string; away: string; winnerHome: boolean }>;
  // matchId -> venue (stadium name) for every knockout slot
  knockoutVenues: Record<string, string>;
  // Snapshot of context state — used to compute per-pair deltas in knockouts
  ctxState: ContextState;
  teams: string[];
}

function prepareInputs(): SimInputs {
  const power = computeTeamPower();
  const elo: Record<string, number> = {};
  for (const p of power) elo[p.team] = p.liveElo;
  for (const t of Object.keys(TEAMS)) if (elo[t] === undefined) elo[t] = 1500;

  const ctxState = getContextState();

  const groupMatches = {} as Record<GroupLetter, PreparedGroupMatch[]>;
  for (const g of GROUP_LETTERS) groupMatches[g] = [];
  for (const m of GROUP_MATCHES) {
    const score = effectiveScore(m.id);
    const d = computeContextDelta(m.home, m.away, m.venue, ctxState).total;
    groupMatches[m.group!].push({
      m, home: m.home, away: m.away,
      played: score ? { h: score.home, a: score.away } : undefined,
      ctxDelta: d,
    });
  }

  const knockoutOverrides: Record<string, { home: string; away: string; winnerHome: boolean }> = {};
  const knockoutVenues: Record<string, string> = {};
  const slots = getState().knockoutSlots;
  for (const m of KNOCKOUT_MATCHES) {
    knockoutVenues[m.id] = m.venue;
    const ko = slots[m.id];
    const home = m.home || ko?.home;
    const away = m.away || ko?.away;
    if (!home || !away) continue;
    const score = effectiveScore(m.id);
    if (!score) continue;
    if (score.home === score.away) continue; // shootout: leave to sim
    knockoutOverrides[m.id] = {
      home, away, winnerHome: score.home > score.away,
    };
  }

  return { elo, groupMatches, knockoutOverrides, knockoutVenues, ctxState, teams: Object.keys(TEAMS) };
}

// ---------- per-run group simulation ----------
interface GroupRunStats {
  team: string;
  pts: number;
  gf: number;
  ga: number;
  elo: number;
}

interface GroupMatchResult {
  home: string;
  away: string;
  hs: number;
  as: number;
}

// FIFA 2026 group tiebreak ladder:
// 1) pts  2) H2H pts  3) H2H GD  4) H2H GF (recursive on still-tied subset)
// fallback: 5) overall GD  6) overall GF  7) Elo
function rankGroupTeams(
  teams: string[],
  stats: Record<string, GroupRunStats>,
  results: GroupMatchResult[],
): GroupRunStats[] {
  const buckets = rankBucketsByPoints(teams, stats, results);
  const out: GroupRunStats[] = [];
  for (const bk of buckets) for (const t of bk) out.push(stats[t]);
  return out;
}

function rankBucketsByPoints(
  teams: string[],
  stats: Record<string, GroupRunStats>,
  results: GroupMatchResult[],
): string[][] {
  if (teams.length <= 1) return teams.length ? [teams] : [];
  const sorted = [...teams].sort((a, b) => stats[b].pts - stats[a].pts);
  const out: string[][] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && stats[sorted[i]].pts === stats[sorted[j]].pts) j++;
    const tied = sorted.slice(i, j);
    if (tied.length === 1) out.push(tied);
    else out.push(...resolveH2H(tied, stats, results));
    i = j;
  }
  return out;
}

function resolveH2H(
  tied: string[],
  stats: Record<string, GroupRunStats>,
  results: GroupMatchResult[],
): string[][] {
  const h: Record<string, { pts: number; gf: number; ga: number }> = {};
  tied.forEach((t) => (h[t] = { pts: 0, gf: 0, ga: 0 }));
  const set = new Set(tied);
  for (const r of results) {
    if (!set.has(r.home) || !set.has(r.away)) continue;
    h[r.home].gf += r.hs; h[r.home].ga += r.as;
    h[r.away].gf += r.as; h[r.away].ga += r.hs;
    if (r.hs > r.as) h[r.home].pts += 3;
    else if (r.hs < r.as) h[r.away].pts += 3;
    else { h[r.home].pts++; h[r.away].pts++; }
  }
  const cmp = (a: string, b: string) =>
    h[b].pts - h[a].pts ||
    (h[b].gf - h[b].ga) - (h[a].gf - h[a].ga) ||
    h[b].gf - h[a].gf;
  const sorted = [...tied].sort(cmp);
  const out: string[][] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && cmp(sorted[i], sorted[j]) === 0) j++;
    const sub = sorted.slice(i, j);
    if (sub.length === 1) out.push(sub);
    else if (sub.length === tied.length) out.push(...resolveOverall(sub, stats));
    else out.push(...rankBucketsByPoints(sub, stats, results));
    i = j;
  }
  return out;
}

function resolveOverall(teams: string[], stats: Record<string, GroupRunStats>): string[][] {
  const cmp = (a: string, b: string) =>
    (stats[b].gf - stats[b].ga) - (stats[a].gf - stats[a].ga) ||
    stats[b].gf - stats[a].gf ||
    stats[b].elo - stats[a].elo;
  const sorted = [...teams].sort(cmp);
  const out: string[][] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && cmp(sorted[i], sorted[j]) === 0) j++;
    out.push(sorted.slice(i, j));
    i = j;
  }
  return out;
}

function runGroups(inputs: SimInputs): {
  qualifiersByGroup: Record<GroupLetter, [string, string]>; // [1st, 2nd]
  thirds: Array<GroupRunStats & { group: GroupLetter }>;
} {
  const qualifiersByGroup = {} as Record<GroupLetter, [string, string]>;
  const thirds: Array<GroupRunStats & { group: GroupLetter }> = [];
  for (const g of GROUP_LETTERS) {
    const teamStats: Record<string, GroupRunStats> = {};
    for (const t of GROUPS[g]) {
      teamStats[t] = { team: t, pts: 0, gf: 0, ga: 0, elo: inputs.elo[t] ?? 1500 };
    }
    const results: GroupMatchResult[] = [];
    for (const pm of inputs.groupMatches[g]) {
      let h: number, a: number;
      if (pm.played) {
        h = pm.played.h; a = pm.played.a;
      } else {
        const r = simMatch(pm.home, pm.away, inputs.elo, false, pm.ctxDelta);
        h = r.gA; a = r.gB;
      }
      teamStats[pm.home].gf += h;
      teamStats[pm.home].ga += a;
      teamStats[pm.away].gf += a;
      teamStats[pm.away].ga += h;
      if (h > a) teamStats[pm.home].pts += 3;
      else if (a > h) teamStats[pm.away].pts += 3;
      else { teamStats[pm.home].pts++; teamStats[pm.away].pts++; }
      results.push({ home: pm.home, away: pm.away, hs: h, as: a });
    }
    const sorted = rankGroupTeams(GROUPS[g] as unknown as string[], teamStats, results);
    qualifiersByGroup[g] = [sorted[0].team, sorted[1].team];
    thirds.push({ ...sorted[2], group: g });
  }
  return { qualifiersByGroup, thirds };
}

// ---------- bracket slotting ----------
function buildR32Pairs(): Array<[string, string]> {
  const apiPairs = KNOCKOUT_MATCHES
    .filter((m) => m.stage === "R32")
    .map((m) => [m.home, m.away] as [string, string]);
  if (apiPairs.length === 16 && apiPairs.every(([home, away]) => home && away)) return apiPairs;
  return CONFIRMED_R32_MATCHUPS.map(([home, away]) => [home, away]);
}

// ---------- knockout simulation ----------
function simKnockoutPair(
  a: string, b: string,
  matchId: string,
  inputs: SimInputs,
): string {
  const ov = inputs.knockoutOverrides[matchId];
  if (ov && ov.home === a && ov.away === b) return ov.winnerHome ? a : b;
  if (ov && ov.home === b && ov.away === a) return ov.winnerHome ? b : a;
  const venue = inputs.knockoutVenues[matchId] ?? "";
  const d = computeContextDelta(a, b, venue, inputs.ctxState).total;
  const r = simMatch(a, b, inputs.elo, true, d);
  return r.winnerA ? a : b;
}

// ---------- one full run ----------
function runOnce(
  inputs: SimInputs,
  reached: Record<string, TeamSimProbs>,
): void {
  const r32Pairs = buildR32Pairs();

  const counted = new Set<string>();
  for (const [a, b] of r32Pairs) {
    if (a && !counted.has(a)) { reached[a].qualify++; counted.add(a); }
    if (b && !counted.has(b)) { reached[b].qualify++; counted.add(b); }
  }

  // R32 -> R16 winners
  const r16Winners: string[] = [];
  r32Pairs.forEach(([a, b], i) => {
    r16Winners.push(simKnockoutPair(a, b, `R32-${i + 1}`, inputs));
  });
  for (const t of r16Winners) if (t) reached[t].r16++;

  const qfWinners: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = r16Winners[i * 2], b = r16Winners[i * 2 + 1];
    qfWinners.push(simKnockoutPair(a, b, `R16-${i + 1}`, inputs));
  }
  for (const t of qfWinners) if (t) reached[t].qf++;

  const sfWinners: string[] = [];
  for (let i = 0; i < 4; i++) {
    const a = qfWinners[i * 2], b = qfWinners[i * 2 + 1];
    sfWinners.push(simKnockoutPair(a, b, `QF-${i + 1}`, inputs));
  }
  for (const t of sfWinners) if (t) reached[t].sf++;

  const finalists: string[] = [];
  for (let i = 0; i < 2; i++) {
    const a = sfWinners[i * 2], b = sfWinners[i * 2 + 1];
    finalists.push(simKnockoutPair(a, b, `SF-${i + 1}`, inputs));
  }
  for (const t of finalists) if (t) reached[t].final++;

  const champion = simKnockoutPair(finalists[0], finalists[1], "Final-1", inputs);
  if (champion) reached[champion].win++;
}

// ---------- entry point ----------
export function simulateTournament(N: number = DEFAULT_N): Record<string, TeamSimProbs> {
  const inputs = prepareInputs();
  const reached: Record<string, TeamSimProbs> = {};
  for (const t of inputs.teams) {
    reached[t] = { qualify: 0, r16: 0, qf: 0, sf: 0, final: 0, win: 0 };
  }
  for (let i = 0; i < N; i++) runOnce(inputs, reached);
  const out: Record<string, TeamSimProbs> = {};
  for (const [t, c] of Object.entries(reached)) {
    out[t] = {
      qualify: c.qualify / N,
      r16: c.r16 / N,
      qf: c.qf / N,
      sf: c.sf / N,
      final: c.final / N,
      win: c.win / N,
    };
  }
  // Suppress unused — _ avoids a lint complaint about Match import in some configs
  void ALL_MATCHES;
  return out;
}
