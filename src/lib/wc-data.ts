// Sweepstakes player assignments and World Cup 2026 data.
// Note: Group distribution and match schedule are plausible/illustrative.
// All 48 real teams from the user's sweepstakes spec are included.

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

// Build all teams with pot info
export const TEAMS: Record<string, Team> = {};
for (const p of PLAYERS) {
  for (const { pot, team } of p.teams) {
    TEAMS[team] = { name: team, flag: FLAGS[team] ?? "🏳️", pot };
  }
}

export function teamOwner(teamName: string): string | undefined {
  return PLAYERS.find((p) => p.teams.some((t) => t.team === teamName))?.name;
}

// Group distribution: one team from each pot per group. Groups A-L.
const POT1 = PLAYERS.map((p) => p.teams.find((t) => t.pot === 1)!.team);
const POT2 = PLAYERS.map((p) => p.teams.find((t) => t.pot === 2)!.team);
const POT3 = PLAYERS.map((p) => p.teams.find((t) => t.pot === 3)!.team);
const POT4 = PLAYERS.map((p) => p.teams.find((t) => t.pot === 4)!.team);

export const GROUP_LETTERS = ["A","B","C","D","E","F","G","H","I","J","K","L"] as const;
export type GroupLetter = (typeof GROUP_LETTERS)[number];

export const GROUPS: Record<GroupLetter, string[]> = {} as never;
GROUP_LETTERS.forEach((g, i) => {
  GROUPS[g] = [POT1[i], POT2[i], POT3[i], POT4[i]];
});

export function teamGroup(teamName: string): GroupLetter | undefined {
  for (const g of GROUP_LETTERS) if (GROUPS[g].includes(teamName)) return g;
  return undefined;
}

// Venues
const VENUES = [
  { city: "Mexico City", stadium: "Estadio Azteca" },
  { city: "Guadalajara", stadium: "Estadio Akron" },
  { city: "Monterrey", stadium: "Estadio BBVA" },
  { city: "Toronto", stadium: "BMO Field" },
  { city: "Vancouver", stadium: "BC Place" },
  { city: "Atlanta", stadium: "Mercedes-Benz Stadium" },
  { city: "Boston", stadium: "Gillette Stadium" },
  { city: "Dallas", stadium: "AT&T Stadium" },
  { city: "Houston", stadium: "NRG Stadium" },
  { city: "Kansas City", stadium: "Arrowhead Stadium" },
  { city: "Los Angeles", stadium: "SoFi Stadium" },
  { city: "Miami", stadium: "Hard Rock Stadium" },
  { city: "New York/NJ", stadium: "MetLife Stadium" },
  { city: "Philadelphia", stadium: "Lincoln Financial Field" },
  { city: "San Francisco", stadium: "Levi's Stadium" },
  { city: "Seattle", stadium: "Lumen Field" },
];

export interface Match {
  id: string;
  stage: "group" | "R32" | "R16" | "QF" | "SF" | "3rd" | "Final";
  group?: GroupLetter;
  date: string; // ISO
  venue: string;
  city: string;
  home: string; // team name OR placeholder slot id for knockouts
  away: string;
}

// Generate 48 group matches: 6 per group, round-robin.
// Spread across June 11 – June 27, 2026.
function genGroupMatches(): Match[] {
  const matches: Match[] = [];
  const startDay = new Date("2026-06-11T16:00:00Z");
  let dayOffset = 0;
  let matchesToday = 0;
  let venueIdx = 0;
  const times = [16, 19, 22, 1]; // UTC hours (rough)
  let timeIdx = 0;

  // Round-robin: for 4 teams [0,1,2,3], pairings:
  const pairings: [number, number][] = [
    [0, 1], [2, 3], // matchday 1
    [0, 2], [1, 3], // matchday 2
    [0, 3], [1, 2], // matchday 3
  ];

  for (let md = 0; md < 3; md++) {
    for (let gi = 0; gi < GROUP_LETTERS.length; gi++) {
      const g = GROUP_LETTERS[gi];
      const teams = GROUPS[g];
      for (let pi = md * 2; pi < md * 2 + 2; pi++) {
        const [a, b] = pairings[pi];
        const d = new Date(startDay);
        d.setUTCDate(d.getUTCDate() + dayOffset);
        d.setUTCHours(times[timeIdx % times.length]);
        const venue = VENUES[venueIdx % VENUES.length];
        matches.push({
          id: `G-${g}-${md + 1}-${pi}`,
          stage: "group",
          group: g,
          date: d.toISOString(),
          venue: venue.stadium,
          city: venue.city,
          home: teams[a],
          away: teams[b],
        });
        venueIdx++;
        timeIdx++;
        matchesToday++;
        if (matchesToday >= 4) {
          matchesToday = 0;
          dayOffset++;
          timeIdx = 0;
        }
      }
    }
    // gap day between matchdays
    dayOffset += 1;
  }
  return matches.sort((x, y) => x.date.localeCompare(y.date));
}

export const GROUP_MATCHES: Match[] = genGroupMatches();

// Knockout placeholder matches (team names empty, user fills)
function genKnockouts(): Match[] {
  const list: Match[] = [];
  const make = (
    stage: Match["stage"],
    count: number,
    startDate: string,
    prefix: string,
  ) => {
    const start = new Date(startDate);
    for (let i = 0; i < count; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + Math.floor(i / 2));
      d.setUTCHours(i % 2 === 0 ? 18 : 22);
      list.push({
        id: `${prefix}-${i + 1}`,
        stage,
        date: d.toISOString(),
        venue: VENUES[i % VENUES.length].stadium,
        city: VENUES[i % VENUES.length].city,
        home: "",
        away: "",
      });
    }
  };
  make("R32", 16, "2026-06-28T18:00:00Z", "R32");
  make("R16", 8, "2026-07-04T18:00:00Z", "R16");
  make("QF", 4, "2026-07-09T18:00:00Z", "QF");
  make("SF", 2, "2026-07-14T20:00:00Z", "SF");
  make("3rd", 1, "2026-07-18T18:00:00Z", "3rd");
  make("Final", 1, "2026-07-19T18:00:00Z", "Final");
  return list;
}

export const KNOCKOUT_MATCHES: Match[] = genKnockouts();

export const ALL_MATCHES: Match[] = [...GROUP_MATCHES, ...KNOCKOUT_MATCHES];

export const POT_COLORS: Record<Pot, string> = {
  1: "var(--pot1)",
  2: "var(--pot2)",
  3: "var(--pot3)",
  4: "var(--pot4)",
};

export const POT_LABEL_CLASS: Record<Pot, string> = {
  1: "bg-[var(--pot1)] text-white",
  2: "bg-[var(--pot2)] text-white",
  3: "bg-[var(--pot3)] text-[#1a1100]",
  4: "bg-[var(--pot4)] text-white",
};
