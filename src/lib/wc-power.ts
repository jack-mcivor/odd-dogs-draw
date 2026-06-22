// Live Elo + Power Index engine. Recomputes from scratch on every call so it
// always reflects the latest scores. Cheap enough at WC scale (~104 matches).

import { ALL_MATCHES, TEAMS, teamGroup, type GroupLetter } from "./wc-data";
import { effectiveScore, effectiveTeams } from "./wc-store";
import { getLiveMatch } from "./wc-live";

const DEFAULT_START_ELO = 1500;
const HOST_BONUS = 80;
const HOSTS = new Set(["USA", "Canada", "Mexico"]);

const STAGE_K: Record<string, number> = {
  group: 50,
  R32: 55,
  R16: 60,
  QF: 65,
  SF: 70,
  "3rd": 75,
  Final: 75,
};

export interface PowerMatchBreakdown {
  date: string;
  opponent: string;
  stage: string;
  gf: number;
  ga: number;
  resultPoints: number;
  goalBonus: number;
  difficulty: number;
  upsetBonus: number;
  stageFactor: number;
  matchScore: number;
}

export interface TeamPower {
  team: string;
  group: GroupLetter | undefined;
  liveElo: number;
  startElo: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  powerIndex: number;
  breakdown: PowerMatchBreakdown[];
}

interface PlayedMatch {
  date: string;
  home: string;
  away: string;
  goalsHome: number;
  goalsAway: number;
  isKnockout: boolean;
  stage: string;
  homeEloBefore?: number;
  awayEloBefore?: number;
  homeExpected?: number;
  awayExpected?: number;
}

function collectPlayedMatches(): PlayedMatch[] {
  const out: PlayedMatch[] = [];
  for (const m of ALL_MATCHES) {
    let score = effectiveScore(m.id);
    // Treat LIVE in-progress matches as if they ended right now, so rankings
    // react to goals the moment they're scored.
    if (!score) {
      const live = getLiveMatch(m.id);
      if (live && live.liveStatus === "LIVE") {
        score = { home: live.liveScoreHome, away: live.liveScoreAway };
      }
    }
    if (!score) continue;
    const { home, away } = effectiveTeams(m);
    if (!home || !away) continue;
    out.push({
      date: m.date,
      home,
      away,
      goalsHome: score.home,
      goalsAway: score.away,
      isKnockout: m.stage !== "group",
      stage: m.stage,
    });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

function goalDiffMultiplier(gd: number): number {
  if (gd <= 1) return 1;
  if (gd === 2) return 1.5;
  return (11 + gd) / 8;
}

const STAGE_FACTOR: Record<string, number> = {
  group: 1.0,
  R32: 1.1,
  R16: 1.2,
  QF: 1.35,
  SF: 1.45,
  "3rd": 1.5,
  Final: 1.5,
};

const UPSET_WEIGHT = 3;

export function computeTeamPower(): TeamPower[] {
  // Step 1: seed Elo from startElo (or default for any team without a FIFA rank).
  const elo: Record<string, number> = {};
  const start: Record<string, number> = {};
  for (const name of Object.keys(TEAMS)) {
    const s = TEAMS[name].startElo ?? DEFAULT_START_ELO;
    elo[name] = s;
    start[name] = s;
  }

  const played = collectPlayedMatches();

  // Step 2: replay every played match chronologically updating Elo.
  for (const m of played) {
    const eloA = elo[m.home] ?? DEFAULT_START_ELO;
    const eloB = elo[m.away] ?? DEFAULT_START_ELO;

    // Host advantage applies ONLY to the expected-score calc, never stored.
    const aHost = HOSTS.has(m.home);
    const bHost = HOSTS.has(m.away);
    const hA = aHost && !bHost ? HOST_BONUS : 0;
    const hB = bHost && !aHost ? HOST_BONUS : 0;
    const expectedA = 1 / (1 + Math.pow(10, ((eloB + hB) - (eloA + hA)) / 400));
    const expectedB = 1 - expectedA;

    // Record pre-match snapshots BEFORE applying the Elo update.
    m.homeEloBefore = eloA;
    m.awayEloBefore = eloB;
    m.homeExpected = expectedA;
    m.awayExpected = expectedB;

    // Knockout matches that ended level went to penalties — count as a draw
    // for Elo purposes, using the score at end of extra time.
    let actualA: number;
    if (m.isKnockout && m.goalsHome === m.goalsAway) actualA = 0.5;
    else if (m.goalsHome > m.goalsAway) actualA = 1;
    else if (m.goalsHome === m.goalsAway) actualA = 0.5;
    else actualA = 0;

    const gd = Math.abs(m.goalsHome - m.goalsAway);
    const G = goalDiffMultiplier(gd);
    const K = STAGE_K[m.stage] ?? 50;

    elo[m.home] = eloA + K * G * (actualA - expectedA);
    elo[m.away] = eloB + K * G * ((1 - actualA) - (1 - expectedA));
  }

  // Step 3: build per-team stats + Power Index using stored snapshots.
  const stats: Record<string, TeamPower> = {};
  for (const name of Object.keys(TEAMS)) {
    stats[name] = {
      team: name,
      group: teamGroup(name),
      liveElo: elo[name],
      startElo: start[name],
      played: 0, wins: 0, draws: 0, losses: 0,
      goalsFor: 0, goalsAgainst: 0,
      powerIndex: 0,
      breakdown: [],
    };
  }

  for (const m of played) {
    const sides: Array<{
      team: string; opp: string; gf: number; ga: number;
      oppEloBefore: number; expected: number;
    }> = [
      {
        team: m.home, opp: m.away, gf: m.goalsHome, ga: m.goalsAway,
        oppEloBefore: m.awayEloBefore ?? DEFAULT_START_ELO,
        expected: m.homeExpected ?? 0.5,
      },
      {
        team: m.away, opp: m.home, gf: m.goalsAway, ga: m.goalsHome,
        oppEloBefore: m.homeEloBefore ?? DEFAULT_START_ELO,
        expected: m.awayExpected ?? 0.5,
      },
    ];
    for (const s of sides) {
      const ts = stats[s.team];
      if (!ts) continue;
      ts.played += 1;
      ts.goalsFor += s.gf;
      ts.goalsAgainst += s.ga;

      // Penalty-shootout knockouts count as draws for record purposes too.
      const isDraw = (m.isKnockout && m.goalsHome === m.goalsAway) || s.gf === s.ga;
      let resultPoints: number;
      let actual: number;
      if (isDraw) { resultPoints = 1; actual = 0.5; ts.draws += 1; }
      else if (s.gf > s.ga) { resultPoints = 3; actual = 1; ts.wins += 1; }
      else { resultPoints = 0; actual = 0; ts.losses += 1; }

      const rawMargin = s.gf - s.ga;
      const goalMargin = Math.max(-3, Math.min(3, rawMargin));
      const goalBonus = Math.sign(goalMargin) * Math.sqrt(Math.abs(goalMargin));

      const oppStrength = Math.max(0, Math.min(1, (s.oppEloBefore - 1300) / 800));
      const difficulty = 0.5 + oppStrength;

      const upsetBonus = UPSET_WEIGHT * (actual - s.expected);
      const stageFactor = STAGE_FACTOR[m.stage] ?? 1.0;

      const matchScore =
        ((resultPoints + goalBonus) * difficulty + upsetBonus) * stageFactor;

      ts.powerIndex += matchScore;
      ts.breakdown.push({
        date: m.date,
        opponent: s.opp,
        stage: m.stage,
        gf: s.gf,
        ga: s.ga,
        resultPoints,
        goalBonus,
        difficulty,
        upsetBonus,
        stageFactor,
        matchScore,
      });
    }
  }

  return Object.values(stats).sort((a, b) =>
    b.powerIndex - a.powerIndex || b.liveElo - a.liveElo,
  );
}

