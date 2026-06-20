const BASE_GOALS = 1.231586;
const GOAL_SENSITIVITY = 0.00263724;
const HOME_ADV_FACTOR = 0.265583;

export const TEAM_ELOS: Record<string, number> = {
  ARG: 2073,
  ESP: 2048,
  ENG: 2042,
  FRA: 2041,
  BRA: 1993,
  GER: 1985,
  POR: 1963,
  NOR: 1962,
  COL: 1958,
  NED: 1918,
  URU: 1913,
  ECU: 1911,
  SUI: 1891,
  BEL: 1891,
  MAR: 1884,
  SEN: 1881,
  JPN: 1872,
  MEX: 1867,
  CRO: 1865,
  TUR: 1856,
  USA: 1853,
  PAR: 1849,
  AUT: 1833,
  CAN: 1819,
  CIV: 1812,
  SWE: 1806,
  SCO: 1801,
  ALG: 1796,
  AUS: 1793,
  KOR: 1782,
  EGY: 1779,
  CZE: 1754,
  COD: 1743,
  IRN: 1722,
  PAN: 1719,
  UZB: 1707,
  GHA: 1685,
  BIH: 1684,
  RSA: 1674,
  TUN: 1662,
  KSA: 1659,
  CPV: 1648,
  NZL: 1648,
  IRQ: 1645,
  JOR: 1644,
  HAI: 1618,
  HTI: 1618,
  CUW: 1557,
  QAT: 1551,
};

const HOST_ADVANTAGES: Record<string, number> = {
  MEX: 145,
  USA: 88,
  CAN: 86,
};

const TEAM_CODES: Record<string, string> = {
  Algeria: "ALG",
  Argentina: "ARG",
  Australia: "AUS",
  Austria: "AUT",
  Belgium: "BEL",
  "Bosnia & Herzegovina": "BIH",
  Brazil: "BRA",
  Canada: "CAN",
  "Cape Verde": "CPV",
  Colombia: "COL",
  Croatia: "CRO",
  "Côte d'Ivoire": "CIV",
  Curaçao: "CUW",
  Czechia: "CZE",
  "DR Congo": "COD",
  Ecuador: "ECU",
  Egypt: "EGY",
  England: "ENG",
  France: "FRA",
  Germany: "GER",
  Ghana: "GHA",
  Haiti: "HAI",
  Iran: "IRN",
  Iraq: "IRQ",
  Japan: "JPN",
  Jordan: "JOR",
  Mexico: "MEX",
  Morocco: "MAR",
  Netherlands: "NED",
  "New Zealand": "NZL",
  Norway: "NOR",
  Panama: "PAN",
  Paraguay: "PAR",
  Portugal: "POR",
  Qatar: "QAT",
  "Saudi Arabia": "KSA",
  Scotland: "SCO",
  Senegal: "SEN",
  "South Africa": "RSA",
  "South Korea": "KOR",
  Spain: "ESP",
  Sweden: "SWE",
  Switzerland: "SUI",
  Tunisia: "TUN",
  Türkiye: "TUR",
  "United States": "USA",
  Uruguay: "URU",
  Uzbekistan: "UZB",
};

export interface MatchPrice {
  home: string;
  away: string;
  homeXg: number;
  awayXg: number;
  homeWin: number;
  draw: number;
  awayWin: number;
}

export interface TeamMatchProbabilities {
  win: number;
  draw: number;
  loss: number;
  xg: number;
  opponentXg: number;
}

function normaliseTeamCode(team: string): string | null {
  const direct = team.trim().toUpperCase();
  if (direct in TEAM_ELOS) return direct;
  return TEAM_CODES[team.trim()] ?? null;
}

function ratingDiff(home: string, away: string): number | null {
  const homeCode = normaliseTeamCode(home);
  const awayCode = normaliseTeamCode(away);
  if (!homeCode || !awayCode) return null;

  const eloDiff = TEAM_ELOS[homeCode] - TEAM_ELOS[awayCode];
  const homeAdvDiff = (HOST_ADVANTAGES[homeCode] ?? 0) - (HOST_ADVANTAGES[awayCode] ?? 0);
  return eloDiff + HOME_ADV_FACTOR * homeAdvDiff;
}

function expectedGoals(home: string, away: string): [number, number] | null {
  const diff = ratingDiff(home, away);
  if (diff === null) return null;

  const strengthMultiplier = Math.exp(GOAL_SENSITIVITY * diff);
  return [BASE_GOALS * strengthMultiplier, BASE_GOALS / strengthMultiplier];
}

function poissonPmf(mean: number, maxGoals: number): number[] {
  const probs = Array(maxGoals + 1).fill(0);
  probs[0] = Math.exp(-mean);
  for (let goals = 1; goals <= maxGoals; goals++) {
    probs[goals] = (probs[goals - 1] * mean) / goals;
  }

  const total = probs.reduce((sum, prob) => sum + prob, 0);
  return probs.map((prob) => prob / total);
}

function outcomeProbabilities(
  homeXg: number,
  awayXg: number,
): Pick<MatchPrice, "homeWin" | "draw" | "awayWin"> {
  const largestXg = Math.max(homeXg, awayXg);
  const maxGoals = Math.max(18, Math.ceil(largestXg + 10 * Math.sqrt(largestXg) + 10));
  const homeGoalProbs = poissonPmf(homeXg, maxGoals);
  const awayGoalProbs = poissonPmf(awayXg, maxGoals);

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  for (let homeGoals = 0; homeGoals < homeGoalProbs.length; homeGoals++) {
    for (let awayGoals = 0; awayGoals < awayGoalProbs.length; awayGoals++) {
      const scoreProb = homeGoalProbs[homeGoals] * awayGoalProbs[awayGoals];
      if (homeGoals > awayGoals) homeWin += scoreProb;
      else if (homeGoals === awayGoals) draw += scoreProb;
      else awayWin += scoreProb;
    }
  }

  const total = homeWin + draw + awayWin;
  return { homeWin: homeWin / total, draw: draw / total, awayWin: awayWin / total };
}

export function priceMatch(home: string, away: string): MatchPrice | null {
  const xg = expectedGoals(home, away);
  if (!xg) return null;

  const [homeXg, awayXg] = xg;
  const outcomes = outcomeProbabilities(homeXg, awayXg);
  return { home, away, homeXg, awayXg, ...outcomes };
}

export function teamMatchProbabilities(
  team: string,
  home: string,
  away: string,
): TeamMatchProbabilities | null {
  const price = priceMatch(home, away);
  if (!price) return null;

  if (team === home) {
    return {
      win: price.homeWin,
      draw: price.draw,
      loss: price.awayWin,
      xg: price.homeXg,
      opponentXg: price.awayXg,
    };
  }
  if (team === away) {
    return {
      win: price.awayWin,
      draw: price.draw,
      loss: price.homeWin,
      xg: price.awayXg,
      opponentXg: price.homeXg,
    };
  }
  return null;
}

export function knockoutAdvanceProbability(home: string, away: string): number | null {
  const price = priceMatch(home, away);
  if (!price) return null;
  return price.homeWin + price.draw * 0.5;
}
