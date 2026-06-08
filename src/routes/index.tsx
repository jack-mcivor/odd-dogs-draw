import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ALL_MATCHES, GROUP_MATCHES, GROUPS, GROUP_LETTERS, KNOCKOUT_MATCHES,
  PLAYERS, POT_LABEL_CLASS, TEAMS, teamGroup, teamOwner, type Match, type Pot,
} from "@/lib/wc-data";
import {
  computeAllTotals, effectiveTeams, getState, isTeamEliminated, nextUpcoming,
  pointsForMatch, recentResults, setKnockoutSlot, setScore, useAppState,
  useWildcard,
} from "@/lib/wc-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Trophy, Download, Flame, Calendar } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Odd Dogs: It's Claude's World Cup!" },
      { name: "description", content: "FIFA World Cup 2026 sweepstakes tracker for the Odd Dogs — 12 players, 48 teams, live leaderboard." },
      { property: "og:title", content: "Odd Dogs: It's Claude's World Cup!" },
      { property: "og:description", content: "FIFA World Cup 2026 sweepstakes tracker for the Odd Dogs — 12 players, 48 teams, live leaderboard." },
    ],
  }),
  component: App,
});

function PotBadge({ pot, className = "" }: { pot: Pot; className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${POT_LABEL_CLASS[pot]} ${className}`}>
      P{pot}
    </span>
  );
}

function TeamChip({ team, showOwner = false }: { team: string; showOwner?: boolean }) {
  const t = TEAMS[team];
  const owner = teamOwner(team);
  if (!team) return <span className="text-muted-foreground italic">TBD</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-lg leading-none">{t?.flag ?? "🏳️"}</span>
      <span className="font-semibold">{team}</span>
      {t && <PotBadge pot={t.pot} />}
      {showOwner && owner && <span className="text-xs text-muted-foreground">· {owner}</span>}
    </span>
  );
}

function fmtDate(iso: string) {
  // Fixed locale + timezone so SSR and client agree.
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }) + " ET";
}

function App() {
  useAppState();
  const [tab, setTab] = useState("dashboard");
  return (
    <div className="min-h-screen text-foreground">
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
            <Trophy className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg md:text-2xl font-black tracking-tight">
              Odd Dogs: <span className="text-primary">It's Claude's World Cup!</span>
            </h1>
            <p className="text-xs text-muted-foreground">FIFA World Cup 2026 · USA · Canada · Mexico</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full grid grid-cols-2 md:grid-cols-5 h-auto bg-card border border-border">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="fixtures">Fixtures</TabsTrigger>
            <TabsTrigger value="players">Players</TabsTrigger>
            <TabsTrigger value="wildcards">Wildcards</TabsTrigger>
            <TabsTrigger value="bracket">Bracket</TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard" className="mt-6"><Dashboard /></TabsContent>
          <TabsContent value="fixtures" className="mt-6"><Fixtures /></TabsContent>
          <TabsContent value="players" className="mt-6"><PlayersTab /></TabsContent>
          <TabsContent value="wildcards" className="mt-6"><WildcardsTab /></TabsContent>
          <TabsContent value="bracket" className="mt-6"><Bracket /></TabsContent>
        </Tabs>
      </main>
      <footer className="text-center text-xs text-muted-foreground py-8">
        Shared tracker — anyone with the link can update. Data lives in your browser.
      </footer>
    </div>
  );
}

/* ---------------- DASHBOARD ---------------- */

function Dashboard() {
  const totals = computeAllTotals();
  const upcoming = nextUpcoming(3);
  const recent = recentResults(5);

  function exportCsv() {
    const rows = [
      ["Rank", "Player", "Win Pts", "Goal Pts", "Wildcard Bonus", "Total"],
      ...totals.map((p, i) => [
        String(i + 1), p.player, String(p.winPts), String(p.goalPts),
        String(p.wildcardBonus), String(p.total),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "odd-dogs-leaderboard.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2 p-5 bg-card border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" /> Leaderboard
          </h2>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="w-4 h-4 mr-1" /> CSV
          </Button>
        </div>
        <div className="space-y-1.5">
          {totals.map((p, i) => (
            <div key={p.player} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${i === 0 ? "bg-primary/15 border border-primary/40" : "bg-secondary/40"}`}>
              <div className={`w-7 h-7 rounded-full grid place-items-center text-sm font-black ${i === 0 ? "bg-primary text-primary-foreground" : "bg-background/60 text-muted-foreground"}`}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{p.player}</div>
                <div className="text-[11px] text-muted-foreground">
                  Win {p.winPts} · Goals {p.goalPts}{p.wildcardBonus ? ` · WC +${p.wildcardBonus}` : ""}
                </div>
              </div>
              <div className="text-2xl font-black text-primary tabular-nums">{p.total}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="space-y-6">
        <Card className="p-5 bg-card border-border">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" /> Next up
          </h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming fixtures.</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map((m) => <MiniFixture key={m.id} match={m} />)}
            </div>
          )}
        </Card>
        <Card className="p-5 bg-card border-border">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <Flame className="w-4 h-4 text-primary" /> Latest results
          </h2>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matches played yet.</p>
          ) : (
            <div className="space-y-2">
              {recent.map((m) => <MiniResult key={m.id} match={m} />)}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function MiniFixture({ match }: { match: Match }) {
  const e = effectiveTeams(match);
  return (
    <div className="rounded-md bg-secondary/40 px-3 py-2 text-sm">
      <div className="text-[10px] text-muted-foreground mb-0.5">{fmtDate(match.date)} · {match.city}</div>
      <div className="flex items-center justify-between">
        <TeamChip team={e.home} />
        <span className="text-muted-foreground text-xs">vs</span>
        <TeamChip team={e.away} />
      </div>
    </div>
  );
}

function MiniResult({ match }: { match: Match }) {
  const s = getState().scores[match.id];
  const e = effectiveTeams(match);
  return (
    <div className="rounded-md bg-secondary/40 px-3 py-2 text-sm">
      <div className="text-[10px] text-muted-foreground mb-0.5">{fmtDate(match.date)}</div>
      <div className="flex items-center justify-between">
        <TeamChip team={e.home} />
        <span className="font-black text-primary tabular-nums">{s?.home ?? 0}–{s?.away ?? 0}</span>
        <TeamChip team={e.away} />
      </div>
    </div>
  );
}

/* ---------------- FIXTURES ---------------- */

function Fixtures() {
  const [stage, setStage] = useState<string>("all");
  const [player, setPlayer] = useState<string>("all");
  const [team, setTeam] = useState<string>("all");

  const filtered = useMemo(() => {
    return ALL_MATCHES.filter((m) => {
      const e = effectiveTeams(m);
      if (stage !== "all" && m.stage !== stage) return false;
      if (team !== "all" && e.home !== team && e.away !== team) return false;
      if (player !== "all") {
        const ownerH = teamOwner(e.home);
        const ownerA = teamOwner(e.away);
        if (ownerH !== player && ownerA !== player) return false;
      }
      return true;
    });
  }, [stage, player, team]);

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger><SelectValue placeholder="Stage" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            <SelectItem value="group">Group</SelectItem>
            <SelectItem value="R32">Round of 32</SelectItem>
            <SelectItem value="R16">Round of 16</SelectItem>
            <SelectItem value="QF">Quarter-finals</SelectItem>
            <SelectItem value="SF">Semi-finals</SelectItem>
            <SelectItem value="3rd">Third-place</SelectItem>
            <SelectItem value="Final">Final</SelectItem>
          </SelectContent>
        </Select>
        <Select value={player} onValueChange={setPlayer}>
          <SelectTrigger><SelectValue placeholder="Player" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All players</SelectItem>
            {PLAYERS.map((p) => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={team} onValueChange={setTeam}>
          <SelectTrigger><SelectValue placeholder="Team" /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">All teams</SelectItem>
            {Object.keys(TEAMS).sort().map((t) => (
              <SelectItem key={t} value={t}>{TEAMS[t].flag} {t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        {filtered.map((m) => <FixtureRow key={m.id} match={m} />)}
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-12">No matches match those filters.</p>}
      </div>
    </div>
  );
}

function FixtureRow({ match }: { match: Match }) {
  const state = getState();
  const score = state.scores[match.id];
  const e = effectiveTeams(match);
  const [home, setHome] = useState(score?.home?.toString() ?? "");
  const [away, setAway] = useState(score?.away?.toString() ?? "");
  const wildcardApplied = match.stage === "group" && Object.values(state.wildcards).some((arr) =>
    arr.some((u) => u.matchId === match.id)
  );

  const ownerH = teamOwner(e.home);
  const ownerA = teamOwner(e.away);
  const canSave = home !== "" && away !== "" && e.home && e.away;

  function save() {
    if (!canSave) return;
    setScore(match.id, Number(home) || 0, Number(away) || 0, true);
  }

  const stageLabel = match.stage === "group" ? `Group ${match.group}` : match.stage;

  return (
    <Card className="p-3 md:p-4 bg-card border-border">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-2 gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="border-primary/40 text-primary">{stageLabel}</Badge>
          <span>{fmtDate(match.date)}</span>
          <span className="hidden sm:inline">· {match.venue}, {match.city}</span>
        </div>
        {wildcardApplied && (
          <span className="inline-flex items-center gap-1 rounded bg-primary text-primary-foreground px-1.5 py-0.5 font-black text-[10px]">
            WC ×2
          </span>
        )}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="text-right">
          <TeamChip team={e.home} />
          {ownerH && <div className="text-[10px] text-muted-foreground mt-0.5">{ownerH}</div>}
        </div>
        <div className="flex items-center gap-1">
          <Input
            type="number" min={0} value={home} onChange={(ev) => setHome(ev.target.value)}
            className="w-12 h-9 text-center font-bold p-1"
            disabled={!e.home}
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="number" min={0} value={away} onChange={(ev) => setAway(ev.target.value)}
            className="w-12 h-9 text-center font-bold p-1"
            disabled={!e.away}
          />
        </div>
        <div className="text-left">
          <TeamChip team={e.away} />
          {ownerA && <div className="text-[10px] text-muted-foreground mt-0.5">{ownerA}</div>}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 mt-2">
        {score?.played && <span className="text-[10px] text-muted-foreground mr-auto">Saved</span>}
        <Button size="sm" onClick={save} disabled={!canSave}>Save score</Button>
      </div>
    </Card>
  );
}

/* ---------------- PLAYERS ---------------- */

function PlayersTab() {
  const totals = computeAllTotals();
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {totals.map((p, i) => {
        const player = PLAYERS.find((x) => x.name === p.player)!;
        const used = getState().wildcards[p.player] ?? [];
        return (
          <Card key={p.player} className="p-4 bg-card border-border">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[11px] text-muted-foreground">Rank #{i + 1}</div>
                <h3 className="text-xl font-black">{p.player}</h3>
              </div>
              <div className="text-right">
                <div className="text-3xl font-black text-primary tabular-nums">{p.total}</div>
                <div className="text-[10px] text-muted-foreground">total pts</div>
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground mb-3">
              Win {p.winPts} · Goals {p.goalPts} · WC bonus {p.wildcardBonus}
            </div>
            <div className="space-y-2">
              {player.teams.map(({ team, pot }) => {
                const t = p.perTeam[team];
                const elim = isTeamEliminated(team);
                const wcUsed = used.find((u) => u.pot === pot);
                return (
                  <div key={team} className="rounded-md bg-secondary/40 px-3 py-2">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <TeamChip team={team} />
                      <div className="flex items-center gap-2 text-[11px]">
                        {(pot === 3 || pot === 4) && (
                          <span className={`px-1.5 py-0.5 rounded ${wcUsed ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground font-bold"}`}>
                            WC {wcUsed ? "used" : "available"}
                          </span>
                        )}
                        {elim && <span className="px-1.5 py-0.5 rounded bg-destructive/20 text-destructive">Eliminated</span>}
                        <span className="font-bold text-primary tabular-nums">{t?.total ?? 0}</span>
                      </div>
                    </div>
                    {t && t.matches.length > 0 && (
                      <div className="mt-1.5 space-y-0.5">
                        {t.matches.map(({ match, points }) => {
                          const e = effectiveTeams(match);
                          const opp = e.home === team ? e.away : e.home;
                          const s = getState().scores[match.id]!;
                          const my = e.home === team ? s.home : s.away;
                          const th = e.home === team ? s.away : s.home;
                          return (
                            <div key={match.id} className="flex items-center justify-between text-[11px] text-muted-foreground">
                              <span>vs {TEAMS[opp]?.flag} {opp} · {my}–{th}</span>
                              <span className="text-primary font-bold">+{points.total}{points.wildcardBonus > 0 ? " ⚡" : ""}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ---------------- WILDCARDS ---------------- */

function WildcardsTab() {
  const state = useAppState();
  const [playerName, setPlayerName] = useState<string>(PLAYERS[0].name);
  const [pot, setPot] = useState<"3" | "4">("3");
  const [matchId, setMatchId] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const player = PLAYERS.find((p) => p.name === playerName)!;
  const teamForPot = player.teams.find((t) => t.pot === Number(pot))!.team;
  const used = state.wildcards[playerName] ?? [];
  const alreadyUsed = used.find((u) => u.pot === Number(pot));

  const availableMatches = useMemo(() => {
    return GROUP_MATCHES
      .filter((m) => m.home === teamForPot || m.away === teamForPot)
      .filter((m) => !state.scores[m.id]?.played)
      .filter((m) => new Date(m.date).getTime() > Date.now() - 1000 * 60 * 60);
  }, [teamForPot, state]);

  function commit() {
    if (!matchId) return;
    useWildcard(playerName, Number(pot) as 3 | 4, matchId);
    setConfirmOpen(false);
    setMatchId("");
  }

  return (
    <div className="grid lg:grid-cols-[1fr_1.2fr] gap-6">
      <Card className="p-5 bg-card border-border">
        <h2 className="text-lg font-bold mb-4">Play a wildcard</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Player</label>
            <Select value={playerName} onValueChange={(v) => { setPlayerName(v); setMatchId(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLAYERS.map((p) => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Wildcard</label>
            <Select value={pot} onValueChange={(v) => { setPot(v as "3" | "4"); setMatchId(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Pot 3 — {player.teams.find((t) => t.pot === 3)!.team}</SelectItem>
                <SelectItem value="4">Pot 4 — {player.teams.find((t) => t.pot === 4)!.team}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {alreadyUsed ? (
            <div className="rounded-md bg-muted/40 p-3 text-sm">
              This wildcard was already used on match <span className="font-mono">{alreadyUsed.matchId}</span>.
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs text-muted-foreground">Group stage match (must be upcoming)</label>
                <Select value={matchId} onValueChange={setMatchId}>
                  <SelectTrigger><SelectValue placeholder="Choose a match" /></SelectTrigger>
                  <SelectContent>
                    {availableMatches.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {fmtDate(m.date)} · {m.home} vs {m.away}
                      </SelectItem>
                    ))}
                    {availableMatches.length === 0 && <SelectItem value="none" disabled>No upcoming matches</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" disabled={!matchId} onClick={() => setConfirmOpen(true)}>
                Use wildcard
              </Button>
            </>
          )}
        </div>
      </Card>

      <Card className="p-5 bg-card border-border">
        <h2 className="text-lg font-bold mb-4">All wildcard statuses</h2>
        <div className="grid sm:grid-cols-2 gap-2">
          {PLAYERS.map((p) => {
            const u = state.wildcards[p.name] ?? [];
            const pot3 = u.find((x) => x.pot === 3);
            const pot4 = u.find((x) => x.pot === 4);
            return (
              <div key={p.name} className="rounded-md bg-secondary/40 p-3">
                <div className="font-bold mb-1">{p.name}</div>
                <div className="flex flex-col gap-1 text-[11px]">
                  <WildcardStatusRow label="P3" team={p.teams.find((t) => t.pot === 3)!.team} use={pot3} />
                  <WildcardStatusRow label="P4" team={p.teams.find((t) => t.pot === 4)!.team} use={pot4} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm wildcard</AlertDialogTitle>
            <AlertDialogDescription>
              Use {playerName}'s Pot {pot} wildcard ({teamForPot}) on this match? This is permanent — the wildcard cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={commit}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function WildcardStatusRow({ label, team, use }: { label: string; team: string; use?: { matchId: string } }) {
  const match = use ? ALL_MATCHES.find((m) => m.id === use.matchId) : undefined;
  return (
    <div className="flex items-center justify-between gap-1">
      <span className="text-muted-foreground">{label} · {TEAMS[team]?.flag} {team}</span>
      {use ? (
        <span className="text-primary">used {match ? `· ${fmtDate(match.date)}` : ""}</span>
      ) : (
        <span className="px-1.5 py-0.5 rounded bg-primary text-primary-foreground font-bold">available</span>
      )}
    </div>
  );
}

/* ---------------- BRACKET ---------------- */

const PLAYER_COLOR: Record<string, string> = {};
const PALETTE = ["#FFD700","#14b8a6","#3b82f6","#ec4899","#f59e0b","#a78bfa","#34d399","#fb7185","#60a5fa","#fbbf24","#22d3ee","#f472b6"];
PLAYERS.forEach((p, i) => { PLAYER_COLOR[p.name] = PALETTE[i]; });

function Bracket() {
  const groups = ["R32", "R16", "QF", "SF", "3rd", "Final"] as const;
  return (
    <div className="space-y-6">
      <Card className="p-4 bg-card border-border">
        <h2 className="text-lg font-bold mb-2">Group standings (live)</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {GROUP_LETTERS.map((g) => <GroupTable key={g} letter={g} />)}
        </div>
      </Card>

      {groups.map((stage) => (
        <Card key={stage} className="p-4 bg-card border-border">
          <h3 className="font-bold mb-3">{stageLabel(stage)}</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {KNOCKOUT_MATCHES.filter((m) => m.stage === stage).map((m) => (
              <KnockoutSlot key={m.id} match={m} />
            ))}
          </div>
        </Card>
      ))}

      <Card className="p-4 bg-card border-border">
        <h3 className="font-bold mb-2">Player colour key</h3>
        <div className="flex flex-wrap gap-2 text-[11px]">
          {PLAYERS.map((p) => (
            <span key={p.name} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-secondary/40">
              <span className="w-3 h-3 rounded" style={{ background: PLAYER_COLOR[p.name] }} />
              {p.name}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}

function stageLabel(s: string) {
  return ({ R32: "Round of 32", R16: "Round of 16", QF: "Quarter-finals", SF: "Semi-finals", "3rd": "Third-place play-off", Final: "Final" } as Record<string, string>)[s] ?? s;
}

function GroupTable({ letter }: { letter: typeof GROUP_LETTERS[number] }) {
  useAppState();
  const teams = GROUPS[letter];
  const stats: Record<string, { p: number; gf: number; ga: number; pts: number }> = {};
  teams.forEach((t) => stats[t] = { p: 0, gf: 0, ga: 0, pts: 0 });
  for (const m of GROUP_MATCHES.filter((m) => m.group === letter)) {
    const s = getState().scores[m.id];
    if (!s?.played) continue;
    stats[m.home].p++; stats[m.away].p++;
    stats[m.home].gf += s.home; stats[m.home].ga += s.away;
    stats[m.away].gf += s.away; stats[m.away].ga += s.home;
    if (s.home > s.away) stats[m.home].pts += 3;
    else if (s.home < s.away) stats[m.away].pts += 3;
    else { stats[m.home].pts++; stats[m.away].pts++; }
  }
  const sorted = [...teams].sort((a, b) => stats[b].pts - stats[a].pts || (stats[b].gf - stats[b].ga) - (stats[a].gf - stats[a].ga));
  return (
    <div className="rounded-md bg-secondary/30 p-2">
      <div className="text-xs font-black text-primary mb-1">Group {letter}</div>
      <table className="w-full text-[11px]">
        <tbody>
          {sorted.map((t) => (
            <tr key={t}>
              <td className="py-0.5">{TEAMS[t].flag} {t}</td>
              <td className="text-right tabular-nums text-muted-foreground">{stats[t].p}</td>
              <td className="text-right tabular-nums text-muted-foreground">{stats[t].gf}:{stats[t].ga}</td>
              <td className="text-right tabular-nums font-bold w-6">{stats[t].pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KnockoutSlot({ match }: { match: Match }) {
  const e = effectiveTeams(match);
  const allTeams = Object.keys(TEAMS).sort();
  const score = getState().scores[match.id];
  const [home, setHome] = useState(score?.home?.toString() ?? "");
  const [away, setAway] = useState(score?.away?.toString() ?? "");

  return (
    <div className="rounded-md bg-secondary/40 p-2 space-y-1.5">
      <div className="text-[10px] text-muted-foreground">{fmtDate(match.date)} · {match.city}</div>
      <SlotRow team={e.home} onChange={(t) => setKnockoutSlot(match.id, "home", t)} allTeams={allTeams} />
      <SlotRow team={e.away} onChange={(t) => setKnockoutSlot(match.id, "away", t)} allTeams={allTeams} />
      {e.home && e.away && (
        <div className="flex items-center gap-1 pt-1">
          <Input type="number" min={0} value={home} onChange={(ev) => setHome(ev.target.value)} className="h-7 w-10 text-center p-1 text-xs" />
          <span className="text-xs">–</span>
          <Input type="number" min={0} value={away} onChange={(ev) => setAway(ev.target.value)} className="h-7 w-10 text-center p-1 text-xs" />
          <Button size="sm" className="h-7 text-xs ml-auto" onClick={() => setScore(match.id, Number(home) || 0, Number(away) || 0, true)}>Save</Button>
        </div>
      )}
    </div>
  );
}

function SlotRow({ team, onChange, allTeams }: { team: string; onChange: (t: string) => void; allTeams: string[] }) {
  const owner = team ? teamOwner(team) : undefined;
  const color = owner ? PLAYER_COLOR[owner] : "transparent";
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-1.5 h-6 rounded" style={{ background: color }} />
      <Select value={team || "__"} onValueChange={(v) => onChange(v === "__" ? "" : v)}>
        <SelectTrigger className="h-7 text-xs flex-1">
          <SelectValue placeholder="TBD" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value="__">— TBD —</SelectItem>
          {allTeams.map((t) => {
            const o = teamOwner(t);
            const g = teamGroup(t);
            return <SelectItem key={t} value={t}>{TEAMS[t].flag} {t} · {g}{o ? ` · ${o}` : ""}</SelectItem>;
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
