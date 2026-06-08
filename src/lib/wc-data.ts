// Sweepstakes player assignments and FIFA World Cup 2026 data (confirmed groups/fixtures).

export type Pot = 1 | 2 | 3 | 4;

export interface Team {
  name: string;
  flag: string;
  pot: Pot;
}

export interface PlayerAssignment {
  name: string;
  teams: { pot: Pot; team: string }[];
}

export const PLAYERS: PlayerAssignment[] = [
  { name: "J'Ashley", teams: [{ pot: 1, team: "Belgium" }, { pot: 2, team: "South Korea" }, { pot: 3, team: "Côte d'Ivoire" }, { pot: 4, team: "Sweden" }] },
  { name: "Edward", teams: [{ pot: 1, team: "Netherlands" }, { pot: 2, team: "Senegal" }, { pot: 3, team: "Panama" }, { pot: 4, team: "Iraq" }] },
  { name: "Xavier", teams: [{ pot: 1, team: "Mexico" }, { pot: 2, team: "Austria" }, { pot: 3, team: "Egypt" }, { pot: 4, team: "Ghana" }] },
  { name: "Neil", teams: [{ pot: 1, team: "Portugal" }, { pot: 2, team: "Iran" }, { pot: 3, team: "Qatar" }, { pot: 4, team: "Bosnia & Herzegovina" }] },
  { name: "Jess", teams: [{ pot: 1, team: "France" }, { pot: 2, team: "Ecuador" }, { pot: 3, team: "Algeria" }, { pot: 4, team: "New Zealand" }] },
  { name: "Gigi", teams: [{ pot: 1, team: "Brazil" }, { pot: 2, team: "Croatia" }, { pot: 3, team: "South Africa" }, { pot: 4, team: "Haiti" }] },
  { name: "Andy", teams: [{ pot: 1, team: "United States" }, { pot: 2, team: "Colombia" }, { pot: 3, team: "Scotland" }, { pot: 4, team: "Curaçao" }] },
  { name: "Better Andy", teams: [{ pot: 1, team: "Argentina" }, { pot: 2, team: "Morocco" }, { pot: 3, team: "Tunisia" }, { pot: 4, team: "DR Congo" }] },
  { name: "Victoria", teams: [{ pot: 1, team: "Germany" }, { pot: 2, team: "Japan" }, { pot: 3, team: "Paraguay" }, { pot: 4, team: "Türkiye" }] },
  { name: "Dana", teams: [{ pot: 1, team: "Spain" }, { pot: 2, team: "Australia" }, { pot: 3, team: "Saudi Arabia" }, { pot: 4, team: "Jordan" }] },
  { name: "Michelle", teams: [{ pot: 1, team: "Canada" }, { pot: 2, team: "Uruguay" }, { pot: 3, team: "Norway" }, { pot: 4, team: "Cape Verde" }] },
  { name: "Violet", teams: [{ pot: 1, team: "England" }, { pot: 2, team: "Switzerland" }, { pot: 3, team: "Uzbekistan" }, { pot: 4, team: "Czechia" }] },
];

const FLAGS: Record<string, string> = {
  "Belgium": "🇧🇪", "Netherlands": "🇳🇱", "Mexico": "🇲🇽", "Portugal": "🇵🇹",
  "France": "🇫🇷", "Brazil": "🇧🇷", "United States": "🇺🇸", "Argentina": "🇦🇷",
  "Germany": "🇩🇪", "Spain": "🇪🇸", "Canada": "🇨🇦", "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "South Korea": "🇰🇷", "Senegal": "🇸🇳", "Austria": "🇦🇹", "Iran": "🇮🇷",
  "Ecuador": "🇪🇨", "Croatia": "🇭🇷", "Colombia": "🇨🇴", "Morocco": "🇲🇦",
  "Japan": "🇯🇵", "Australia": "🇦🇺", "Uruguay": "🇺🇾", "Switzerland": "🇨🇭",
  "Côte d'Ivoire": "🇨🇮", "Panama": "🇵🇦", "Egypt": "🇪🇬", "Qatar": "🇶🇦",
  "Algeria": "🇩🇿", "South Africa": "🇿🇦", "Scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "Tunisia": "🇹🇳",
  "Paraguay": "🇵🇾", "Saudi Arabia": "🇸🇦", "Norway": "🇳🇴", "Uzbekistan": "🇺🇿",
  "Sweden": "🇸🇪", "Iraq": "🇮🇶", "Ghana": "🇬🇭", "Bosnia & Herzegovina": "🇧🇦",
  "New Zealand": "🇳🇿", "Haiti": "🇭🇹", "Curaçao": "🇨🇼", "DR Congo": "🇨🇩",
  "Türkiye": "🇹🇷", "Jordan": "🇯🇴", "Cape Verde": "🇨🇻", "Czechia": "🇨🇿",
};

export const TEAMS: Record<string, Team> = {};
for (const p of PLAYERS) {
  for (const { pot, team } of p.teams) {
    TEAMS[team] = { name: team, flag: FLAGS[team] ?? "🏳️", pot };
  }
}

export function teamOwner(teamName: string): string | undefined {
  return PLAYERS.find((p) => p.teams.some((t) => t.team === teamName))?.name;
}

// Confirmed FIFA World Cup 2026 groups
export const GROUP_LETTERS = ["A","B","C","D","E","F","G","H","I","J","K","L"] as const;
export type GroupLetter = (typeof GROUP_LETTERS)[number];

export const GROUPS: Record<GroupLetter, string[]> = {
  A: ["Mexico", "South Korea", "South Africa", "Czechia"],
  B: ["Canada", "Switzerland", "Qatar", "Bosnia & Herzegovina"],
  C: ["Brazil", "Morocco", "Scotland", "Haiti"],
  D: ["United States", "Australia", "Paraguay", "Türkiye"],
  E: ["Germany", "Ecuador", "Côte d'Ivoire", "Curaçao"],
  F: ["Netherlands", "Japan", "Tunisia", "Sweden"],
  G: ["Belgium", "Iran", "Egypt", "New Zealand"],
  H: ["Spain", "Uruguay", "Saudi Arabia", "Cape Verde"],
  I: ["France", "Senegal", "Norway", "Iraq"],
  J: ["Argentina", "Austria", "Algeria", "Jordan"],
  K: ["Portugal", "Colombia", "Uzbekistan", "DR Congo"],
  L: ["England", "Croatia", "Panama", "Ghana"],
};

export function teamGroup(teamName: string): GroupLetter | undefined {
  for (const g of GROUP_LETTERS) if (GROUPS[g].includes(teamName)) return g;
  return undefined;
}

export interface Match {
  id: string;
  stage: "group" | "R32" | "R16" | "QF" | "SF" | "3rd" | "Final";
  group?: GroupLetter;
  date: string; // ISO with explicit ET offset
  venue: string;
  city: string;
  home: string;
  away: string;
}

// All 72 confirmed group-stage fixtures. Times are ET (EDT, UTC-4 in June).
type FixtureRow = [GroupLetter, string, string, string, string, string]; // group, home, away, ISO date, venue, city

const F: FixtureRow[] = [
  // Thu Jun 11
  ["A", "Mexico", "South Africa", "2026-06-11T15:00:00-04:00", "Estadio Azteca", "Mexico City"],
  ["A", "South Korea", "Czechia", "2026-06-11T22:00:00-04:00", "Estadio Akron", "Zapopan"],
  // Fri Jun 12
  ["B", "Canada", "Bosnia & Herzegovina", "2026-06-12T15:00:00-04:00", "BMO Field", "Toronto"],
  ["D", "United States", "Paraguay", "2026-06-12T21:00:00-04:00", "SoFi Stadium", "Inglewood"],
  // Sat Jun 13
  ["B", "Qatar", "Switzerland", "2026-06-13T15:00:00-04:00", "Levi's Stadium", "Santa Clara"],
  ["C", "Brazil", "Morocco", "2026-06-13T18:00:00-04:00", "MetLife Stadium", "East Rutherford"],
  ["C", "Haiti", "Scotland", "2026-06-13T21:00:00-04:00", "Gillette Stadium", "Foxborough"],
  // Sun Jun 14
  ["D", "Australia", "Türkiye", "2026-06-14T00:00:00-04:00", "BC Place", "Vancouver"],
  ["E", "Germany", "Curaçao", "2026-06-14T13:00:00-04:00", "NRG Stadium", "Houston"],
  ["F", "Netherlands", "Japan", "2026-06-14T16:00:00-04:00", "AT&T Stadium", "Arlington"],
  ["E", "Côte d'Ivoire", "Ecuador", "2026-06-14T19:00:00-04:00", "Lincoln Financial Field", "Philadelphia"],
  ["F", "Sweden", "Tunisia", "2026-06-14T22:00:00-04:00", "Estadio BBVA", "Monterrey"],
  // Mon Jun 15
  ["H", "Spain", "Cape Verde", "2026-06-15T12:00:00-04:00", "Mercedes-Benz Stadium", "Atlanta"],
  ["G", "Belgium", "Egypt", "2026-06-15T15:00:00-04:00", "Lumen Field", "Seattle"],
  ["H", "Saudi Arabia", "Uruguay", "2026-06-15T18:00:00-04:00", "Hard Rock Stadium", "Miami Gardens"],
  ["G", "Iran", "New Zealand", "2026-06-15T21:00:00-04:00", "SoFi Stadium", "Inglewood"],
  // Tue Jun 16
  ["I", "France", "Senegal", "2026-06-16T15:00:00-04:00", "MetLife Stadium", "East Rutherford"],
  ["I", "Iraq", "Norway", "2026-06-16T18:00:00-04:00", "Gillette Stadium", "Foxborough"],
  ["J", "Argentina", "Algeria", "2026-06-16T21:00:00-04:00", "Arrowhead Stadium", "Kansas City"],
  // Wed Jun 17
  ["J", "Austria", "Jordan", "2026-06-17T00:00:00-04:00", "Levi's Stadium", "Santa Clara"],
  ["K", "Portugal", "DR Congo", "2026-06-17T13:00:00-04:00", "NRG Stadium", "Houston"],
  ["L", "England", "Croatia", "2026-06-17T16:00:00-04:00", "AT&T Stadium", "Arlington"],
  ["L", "Ghana", "Panama", "2026-06-17T19:00:00-04:00", "BMO Field", "Toronto"],
  ["K", "Uzbekistan", "Colombia", "2026-06-17T22:00:00-04:00", "Estadio Azteca", "Mexico City"],
  // Thu Jun 18
  ["A", "Czechia", "South Africa", "2026-06-18T12:00:00-04:00", "Mercedes-Benz Stadium", "Atlanta"],
  ["B", "Switzerland", "Bosnia & Herzegovina", "2026-06-18T15:00:00-04:00", "SoFi Stadium", "Inglewood"],
  ["B", "Canada", "Qatar", "2026-06-18T18:00:00-04:00", "BC Place", "Vancouver"],
  ["A", "Mexico", "South Korea", "2026-06-18T21:00:00-04:00", "Estadio Akron", "Zapopan"],
  // Fri Jun 19
  ["D", "United States", "Australia", "2026-06-19T15:00:00-04:00", "Lumen Field", "Seattle"],
  ["C", "Scotland", "Morocco", "2026-06-19T18:00:00-04:00", "Gillette Stadium", "Foxborough"],
  ["C", "Brazil", "Haiti", "2026-06-19T20:30:00-04:00", "Lincoln Financial Field", "Philadelphia"],
  ["D", "Türkiye", "Paraguay", "2026-06-19T23:00:00-04:00", "Levi's Stadium", "Santa Clara"],
  // Sat Jun 20
  ["F", "Netherlands", "Sweden", "2026-06-20T13:00:00-04:00", "NRG Stadium", "Houston"],
  ["E", "Germany", "Côte d'Ivoire", "2026-06-20T16:00:00-04:00", "BMO Field", "Toronto"],
  ["E", "Ecuador", "Curaçao", "2026-06-20T20:00:00-04:00", "Arrowhead Stadium", "Kansas City"],
  // Sun Jun 21
  ["F", "Tunisia", "Japan", "2026-06-21T00:00:00-04:00", "Estadio BBVA", "Monterrey"],
  ["H", "Spain", "Saudi Arabia", "2026-06-21T12:00:00-04:00", "Mercedes-Benz Stadium", "Atlanta"],
  ["G", "Belgium", "Iran", "2026-06-21T15:00:00-04:00", "SoFi Stadium", "Inglewood"],
  ["H", "Uruguay", "Cape Verde", "2026-06-21T18:00:00-04:00", "Hard Rock Stadium", "Miami Gardens"],
  ["G", "New Zealand", "Egypt", "2026-06-21T21:00:00-04:00", "BC Place", "Vancouver"],
  // Mon Jun 22
  ["J", "Argentina", "Austria", "2026-06-22T13:00:00-04:00", "AT&T Stadium", "Arlington"],
  ["I", "France", "Iraq", "2026-06-22T17:00:00-04:00", "Lincoln Financial Field", "Philadelphia"],
  ["I", "Norway", "Senegal", "2026-06-22T20:00:00-04:00", "MetLife Stadium", "East Rutherford"],
  ["J", "Jordan", "Algeria", "2026-06-22T23:00:00-04:00", "Levi's Stadium", "Santa Clara"],
  // Tue Jun 23
  ["K", "Portugal", "Uzbekistan", "2026-06-23T13:00:00-04:00", "NRG Stadium", "Houston"],
  ["L", "England", "Ghana", "2026-06-23T16:00:00-04:00", "Gillette Stadium", "Foxborough"],
  ["L", "Panama", "Croatia", "2026-06-23T19:00:00-04:00", "BMO Field", "Toronto"],
  ["K", "Colombia", "DR Congo", "2026-06-23T22:00:00-04:00", "Estadio Akron", "Zapopan"],
  // Wed Jun 24
  ["B", "Switzerland", "Canada", "2026-06-24T15:00:00-04:00", "BC Place", "Vancouver"],
  ["B", "Bosnia & Herzegovina", "Qatar", "2026-06-24T15:00:00-04:00", "Lumen Field", "Seattle"],
  ["C", "Scotland", "Brazil", "2026-06-24T18:00:00-04:00", "Hard Rock Stadium", "Miami Gardens"],
  ["C", "Morocco", "Haiti", "2026-06-24T18:00:00-04:00", "Mercedes-Benz Stadium", "Atlanta"],
  ["A", "Czechia", "Mexico", "2026-06-24T21:00:00-04:00", "Estadio Azteca", "Mexico City"],
  ["A", "South Africa", "South Korea", "2026-06-24T21:00:00-04:00", "Estadio BBVA", "Monterrey"],
  // Thu Jun 25
  ["E", "Curaçao", "Côte d'Ivoire", "2026-06-25T16:00:00-04:00", "Lincoln Financial Field", "Philadelphia"],
  ["E", "Ecuador", "Germany", "2026-06-25T16:00:00-04:00", "MetLife Stadium", "East Rutherford"],
  ["F", "Japan", "Sweden", "2026-06-25T19:00:00-04:00", "AT&T Stadium", "Arlington"],
  ["F", "Tunisia", "Netherlands", "2026-06-25T19:00:00-04:00", "Arrowhead Stadium", "Kansas City"],
  ["D", "Türkiye", "United States", "2026-06-25T22:00:00-04:00", "SoFi Stadium", "Inglewood"],
  ["D", "Paraguay", "Australia", "2026-06-25T22:00:00-04:00", "Levi's Stadium", "Santa Clara"],
  // Fri Jun 26
  ["I", "Norway", "France", "2026-06-26T15:00:00-04:00", "Gillette Stadium", "Foxborough"],
  ["I", "Senegal", "Iraq", "2026-06-26T15:00:00-04:00", "BMO Field", "Toronto"],
  ["H", "Cape Verde", "Saudi Arabia", "2026-06-26T20:00:00-04:00", "NRG Stadium", "Houston"],
  ["H", "Uruguay", "Spain", "2026-06-26T20:00:00-04:00", "Estadio Akron", "Zapopan"],
  ["G", "Egypt", "Iran", "2026-06-26T23:00:00-04:00", "Lumen Field", "Seattle"],
  ["G", "New Zealand", "Belgium", "2026-06-26T23:00:00-04:00", "BC Place", "Vancouver"],
  // Sat Jun 27
  ["L", "Panama", "England", "2026-06-27T17:00:00-04:00", "MetLife Stadium", "East Rutherford"],
  ["L", "Croatia", "Ghana", "2026-06-27T17:00:00-04:00", "Lincoln Financial Field", "Philadelphia"],
  ["K", "Colombia", "Portugal", "2026-06-27T19:30:00-04:00", "Hard Rock Stadium", "Miami Gardens"],
  ["K", "DR Congo", "Uzbekistan", "2026-06-27T19:30:00-04:00", "Mercedes-Benz Stadium", "Atlanta"],
  ["J", "Algeria", "Austria", "2026-06-27T22:00:00-04:00", "Arrowhead Stadium", "Kansas City"],
  ["J", "Jordan", "Argentina", "2026-06-27T22:00:00-04:00", "AT&T Stadium", "Arlington"],
];

export const GROUP_MATCHES: Match[] = F.map(([group, home, away, date, venue, city], i) => ({
  id: `G${String(i + 1).padStart(2, "0")}`,
  stage: "group",
  group,
  date,
  venue,
  city,
  home,
  away,
}));

// Knockout placeholder matches – user fills team slots as teams advance.
const VENUES = [
  { city: "Atlanta", stadium: "Mercedes-Benz Stadium" },
  { city: "Boston", stadium: "Gillette Stadium" },
  { city: "Dallas", stadium: "AT&T Stadium" },
  { city: "Houston", stadium: "NRG Stadium" },
  { city: "Kansas City", stadium: "Arrowhead Stadium" },
  { city: "Los Angeles", stadium: "SoFi Stadium" },
  { city: "Miami Gardens", stadium: "Hard Rock Stadium" },
  { city: "East Rutherford", stadium: "MetLife Stadium" },
  { city: "Philadelphia", stadium: "Lincoln Financial Field" },
  { city: "San Francisco", stadium: "Levi's Stadium" },
  { city: "Seattle", stadium: "Lumen Field" },
  { city: "Toronto", stadium: "BMO Field" },
  { city: "Vancouver", stadium: "BC Place" },
  { city: "Mexico City", stadium: "Estadio Azteca" },
  { city: "Guadalajara", stadium: "Estadio Akron" },
  { city: "Monterrey", stadium: "Estadio BBVA" },
];

function genKnockouts(): Match[] {
  const list: Match[] = [];
  const make = (
    stage: Match["stage"],
    count: number,
    dates: string[],
    prefix: string,
    fixedVenue?: { city: string; stadium: string },
  ) => {
    for (let i = 0; i < count; i++) {
      const v = fixedVenue ?? VENUES[i % VENUES.length];
      list.push({
        id: `${prefix}-${i + 1}`,
        stage,
        date: dates[i % dates.length],
        venue: v.stadium,
        city: v.city,
        home: "",
        away: "",
      });
    }
  };
  // R32: Jun 28 – Jul 3 (6 days, ~16 matches => ~2.5/day)
  make("R32", 16, [
    "2026-06-28T16:00:00-04:00", "2026-06-28T20:00:00-04:00",
    "2026-06-29T16:00:00-04:00", "2026-06-29T20:00:00-04:00",
    "2026-06-30T16:00:00-04:00", "2026-06-30T20:00:00-04:00",
    "2026-07-01T16:00:00-04:00", "2026-07-01T20:00:00-04:00",
    "2026-07-02T16:00:00-04:00", "2026-07-02T20:00:00-04:00",
    "2026-07-03T12:00:00-04:00", "2026-07-03T16:00:00-04:00",
    "2026-07-03T20:00:00-04:00", "2026-06-28T12:00:00-04:00",
    "2026-06-30T12:00:00-04:00", "2026-07-01T12:00:00-04:00",
  ], "R32");
  make("R16", 8, [
    "2026-07-04T15:00:00-04:00", "2026-07-04T19:00:00-04:00",
    "2026-07-05T15:00:00-04:00", "2026-07-05T19:00:00-04:00",
    "2026-07-06T15:00:00-04:00", "2026-07-06T19:00:00-04:00",
    "2026-07-07T15:00:00-04:00", "2026-07-07T19:00:00-04:00",
  ], "R16");
  make("QF", 4, [
    "2026-07-09T16:00:00-04:00", "2026-07-09T20:00:00-04:00",
    "2026-07-11T16:00:00-04:00", "2026-07-11T20:00:00-04:00",
  ], "QF");
  make("SF", 2, [
    "2026-07-14T20:00:00-04:00", "2026-07-15T20:00:00-04:00",
  ], "SF");
  make("3rd", 1, ["2026-07-18T15:00:00-04:00"], "3rd",
    { city: "Miami Gardens", stadium: "Hard Rock Stadium" });
  make("Final", 1, ["2026-07-19T15:00:00-04:00"], "Final",
    { city: "East Rutherford", stadium: "MetLife Stadium" });
  return list;
}

export const KNOCKOUT_MATCHES: Match[] = genKnockouts();

export const ALL_MATCHES: Match[] = [...GROUP_MATCHES, ...KNOCKOUT_MATCHES];

export const POT_LABEL_CLASS: Record<Pot, string> = {
  1: "bg-[var(--pot1)] text-white",
  2: "bg-[var(--pot2)] text-white",
  3: "bg-[var(--pot3)] text-[#1a1100]",
  4: "bg-[var(--pot4)] text-white",
};
