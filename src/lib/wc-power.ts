// Live Elo + Power Index engine. Recomputes from scratch on every call so it
// always reflects the latest scores. Cheap enough at WC scale (~104 matches).

import { ALL_MATCHES, TEAMS, teamGroup, type GroupLetter } from "./wc-data";
import { effectiveScore, effectiveTeams } from "./wc-store";

const DEFAULT_START_ELO = 1500;
const K = 60;

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
}

interface PlayedMatch {
  date: string;
  home: string;
  away: string;
  goalsHome: number;
  goalsAway: number;
  isKnockout: boolean;
}

function collectPlayedMatches(): PlayedMatch[] {
  const out: PlayedMatch[] = [];
  for (const m of ALL_MATCHES) {
    const score = effectiveScore(m.id);
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
    const expectedA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));

    // Knockout matches that ended level went to penalties — count as a draw
    // for Elo purposes, using the score at end of extra time.
    let actualA: number;
    if (m.isKnockout && m.goalsHome === m.goalsAway) actualA = 0.5;
    else if (m.goalsHome > m.goalsAway) actualA = 1;
    else if (m.goalsHome === m.goalsAway) actualA = 0.5;
    else actualA = 0;

    const gd = Math.abs(m.goalsHome - m.goalsAway);
    const G = goalDiffMultiplier(gd);

    elo[m.home] = eloA + K * G * (actualA - expectedA);
    elo[m.away] = eloB + K * G * ((1 - actualA) - (1 - expectedA));
  }

  // Step 3: build per-team stats + Power Index, weighting by opponent live Elo.
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
    };
  }

  for (const m of played) {
    const sides: Array<{ team: string; opp: string; gf: number; ga: number }> = [
      { team: m.home, opp: m.away, gf: m.goalsHome, ga: m.goalsAway },
      { team: m.away, opp: m.home, gf: m.goalsAway, ga: m.goalsHome },
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
      if (isDraw) { resultPoints = 1; ts.draws += 1; }
      else if (s.gf > s.ga) { resultPoints = 3; ts.wins += 1; }
      else { resultPoints = 0; ts.losses += 1; }

      const rawMargin = s.gf - s.ga;
      const goalMargin = Math.max(-3, Math.min(3, rawMargin));
      const goalBonus = Math.sign(goalMargin) * Math.sqrt(Math.abs(goalMargin));

      const oppLiveElo = elo[s.opp] ?? DEFAULT_START_ELO;
      const oppStrength = Math.max(0, Math.min(1, (oppLiveElo - 1300) / 800));
      const difficulty = 0.5 + oppStrength;

      ts.powerIndex += (resultPoints + goalBonus) * difficulty;
    }
  }

  return Object.values(stats).sort((a, b) =>
    b.powerIndex - a.powerIndex || b.liveElo - a.liveElo,
  );
}
