import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { fetchAndApply, initApi, useApiMeta, WILDCARD_ASSIGNMENTS } from "@/lib/wc-api";
import {
  ALL_MATCHES, GROUP_MATCHES, GROUPS, GROUP_LETTERS, KNOCKOUT_MATCHES,
  PLAYERS, POT_LABEL_CLASS, TEAMS, teamGroup, teamOwner, type Match, type Pot,
} from "@/lib/wc-data";
import {
  computeAllTotals, effectiveTeams, getState, isTeamEliminated, loadFromStorage,
  nextUpcoming, recentResults, setKnockoutSlot, setScore, useAppState,
} from "@/lib/wc-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Trophy, Download, Flame, Calendar, RefreshCw } from "lucide-react";

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
  const content = (
    <>
      <span className="text-lg leading-none">{t?.flag ?? "🏳️"}</span>
      <span className="font-semibold">{team}</span>
      {t && <PotBadge pot={t.pot} />}
      {showOwner && owner && <span className="text-xs text-muted-foreground">· {owner}</span>}
    </>
  );
  if (!t) {
    return <span className="inline-flex items-center gap-1.5">{content}</span>;
  }
  return (
    <Link
      to="/team/$team"
      params={{ team }}
      className="inline-flex items-center gap-1.5 hover:text-primary transition"
      onClick={(e) => e.stopPropagation()}
    >
      {content}
    </Link>
  );
}

function formatDate(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);

  let month = "";
  let day = "";
  let hour = "";
  let minute = "";
  let dayPeriod = "";
  for (const part of parts) {
    if (part.type === "month") month = part.value;
    if (part.type === "day") day = part.value;
    if (part.type === "hour") hour = part.value;
    if (part.type === "minute") minute = part.value;
    if (part.type === "dayPeriod") dayPeriod = part.value.toLowerCase();
  }
  return `${day} ${month}, ${hour}:${minute} ${dayPeriod}`;
}

function utcOffsetLabel(iso: string): string {
  const mins = -new Date(iso).getTimezoneOffset();
  const sign = mins >= 0 ? "+" : "−";
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${String(m).padStart(2, "0")}`;
}

function LocalTime({ iso }: { iso: string }) {
  const [formatted, setFormatted] = useState<string | null>(null);
  const [offset, setOffset] = useState<string | null>(null);
  useEffect(() => {
    setFormatted(formatDate(iso, Intl.DateTimeFormat().resolvedOptions().timeZone));
    setOffset(utcOffsetLabel(iso));
  }, [iso]);
  return (
    <span>
      {formatted ?? formatDate(iso, "America/New_York")}
      {offset && <span className="text-muted-foreground/70"> ({offset})</span>}
    </span>
  );
}



function App() {
  useAppState();
  const apiMeta = useApiMeta();
  const [tab, setTab] = useState("dashboard");
  const [refreshing, setRefreshing] = useState(false);
  const [focusPlayer, setFocusPlayer] = useState<string | null>(null);

  useEffect(() => { loadFromStorage(); initApi(); }, []);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await fetchAndApply(); } finally { setRefreshing(false); }
  };

  const goToPlayer = (name: string) => {
    setFocusPlayer(name);
    setTab("players");
  };

  return (
    <div className="min-h-screen text-foreground">
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
            <Trophy className="w-5 h-5 text-primary-foreground" />
          </div>
          <div
            className="flex-1 min-w-0 cursor-pointer hover:opacity-80 transition"
            onClick={() => setTab("dashboard")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setTab("dashboard"); }}
            aria-label="Go to dashboard"
          >
            <h1 className="text-lg md:text-2xl font-black tracking-tight">
              Odd Dogs: <span className="text-primary">It's Claude's World Cup!</span>
            </h1>
            <p className="text-xs text-muted-foreground">FIFA World Cup 2026 · USA · Canada · Mexico</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-bold">
              {apiMeta.offline ? (
                <span className="rounded bg-amber-400/15 text-amber-400 px-2 py-1">⚠ FALLBACK DATA</span>
              ) : apiMeta.loaded ? (
                <span className="rounded bg-emerald-500/15 text-emerald-400 px-2 py-1">● LIVE API</span>
              ) : (
                <span className="rounded bg-secondary text-muted-foreground px-2 py-1">… loading</span>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Re-fetch openfootball matches"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              <span className="hidden md:inline ml-1.5">Refresh live data</span>
            </Button>
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
          <TabsContent value="dashboard" className="mt-6"><Dashboard onSelectPlayer={goToPlayer} /></TabsContent>
          <TabsContent value="fixtures" className="mt-6"><Fixtures /></TabsContent>
          <TabsContent value="players" className="mt-6"><PlayersTab focusPlayer={focusPlayer} onConsumeFocus={() => setFocusPlayer(null)} /></TabsContent>
          <TabsContent value="wildcards" className="mt-6"><WildcardsTab /></TabsContent>
          <TabsContent value="bracket" className="mt-6"><Bracket /></TabsContent>
        </Tabs>
      </main>
      <footer className="text-center text-xs text-muted-foreground py-8 space-y-1">
        <div>Shared tracker — live scores from openfootball/worldcup.json, refreshed every 60s.</div>
        {apiMeta.offline && <div className="text-amber-400">⚠ Using offline fallback data — live API unavailable.</div>}
      </footer>
    </div>
  );
}

/* ---------------- DASHBOARD ---------------- */

function Dashboard({ onSelectPlayer }: { onSelectPlayer: (name: string) => void }) {
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
            <button
              key={p.player}
              type="button"
              onClick={() => onSelectPlayer(p.player)}
              className={`w-full text-left flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:ring-2 hover:ring-primary/50 ${i === 0 ? "bg-primary/15 border border-primary/40" : "bg-secondary/40"}`}
            >
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
            </button>
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
      <div className="text-[10px] text-muted-foreground mb-0.5"><LocalTime iso={match.date} /> · {match.city}</div>
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
      <div className="text-[10px] text-muted-foreground mb-0.5"><LocalTime iso={match.date} /></div>
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
  const [showCompleted, setShowCompleted] = useState(false);
  const state = getState();

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
      if (!showCompleted && state.scores[m.id]?.played) return false;
      return true;
    });
  }, [stage, player, team, showCompleted]);

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
  const apiMeta = useApiMeta();
  const score = state.scores[match.id];
  const e = effectiveTeams(match);
  const [home, setHome] = useState(score?.home?.toString() ?? "");
  const [away, setAway] = useState(score?.away?.toString() ?? "");
  const wildcardApplied = match.stage === "group" && Object.values(state.wildcards).some((arr) =>
    arr.some((u) => u.matchId === match.id)
  );
  const isLive = apiMeta.liveMatchIds.has(match.id) && !score?.played;
  const ukTv = apiMeta.ukChannels.map((c) => c.name).join(" / ");

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
          <span><LocalTime iso={match.date} /></span>
          <span className="hidden sm:inline">· {match.venue}, {match.city}</span>
          {ukTv && match.stage === "group" && (
            <span className="hidden md:inline">· 📺 UK: {ukTv}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {isLive && (
            <span className="inline-flex items-center gap-1 rounded bg-red-500 text-white px-1.5 py-0.5 font-black text-[10px] animate-pulse">
              ● LIVE
            </span>
          )}
          {wildcardApplied && (
            <span className="inline-flex items-center gap-1 rounded bg-primary text-primary-foreground px-1.5 py-0.5 font-black text-[10px]">
              WC ×2
            </span>
          )}
        </div>
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
            onBlur={save}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="number" min={0} value={away} onChange={(ev) => setAway(ev.target.value)}
            className="w-12 h-9 text-center font-bold p-1"
            disabled={!e.away}
            onBlur={save}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          />
        </div>
        <div className="text-left">
          <TeamChip team={e.away} />
          {ownerA && <div className="text-[10px] text-muted-foreground mt-0.5">{ownerA}</div>}
        </div>
      </div>
      {score?.played && (
        <div className="flex items-center justify-end gap-2 mt-2">
          <span className="text-[10px] text-muted-foreground mr-auto">Saved (live API)</span>
        </div>
      )}
    </Card>
  );
}

/* ---------------- PLAYERS ---------------- */

function PlayersTab({ focusPlayer, onConsumeFocus }: { focusPlayer: string | null; onConsumeFocus: () => void }) {
  const totals = computeAllTotals();
  const state = getState();
  useEffect(() => {
    if (!focusPlayer) return;
    const el = document.getElementById(`player-card-${focusPlayer}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    const t = setTimeout(onConsumeFocus, 2000);
    return () => clearTimeout(t);
  }, [focusPlayer, onConsumeFocus]);
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {totals.map((p, i) => {
        const player = PLAYERS.find((x) => x.name === p.player)!;
        const used = state.wildcards[p.player] ?? [];
        const isFocused = focusPlayer === p.player;
        return (
          <Card
            key={p.player}
            id={`player-card-${p.player}`}
            className={`p-4 bg-card border-border transition ${isFocused ? "ring-2 ring-primary" : ""}`}
          >

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
                const wcUse = used.find((u) => u.pot === pot);
                const wcMatch = wcUse ? GROUP_MATCHES.find((m) => m.id === wcUse.matchId) : undefined;
                const wcUsed = !!wcMatch
                  && (wcMatch.home === team || wcMatch.away === team)
                  && !!state.scores[wcMatch.id]?.played;
                return (
                  <div key={team} className="rounded-md bg-secondary/40 px-3 py-2">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <TeamChip team={team} />
                      <div className="flex items-center gap-2 text-[11px]">
                        {(pot === 3 || pot === 4) && (
                          <span className={`px-1.5 py-0.5 rounded ${wcUsed ? "bg-primary text-primary-foreground font-bold" : "bg-muted text-muted-foreground"}`}>
                            WC {wcUsed ? "used" : "pending"}
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

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-card border-border">
        <h2 className="text-lg font-bold mb-1">Pre-assigned wildcards</h2>
        <p className="text-xs text-muted-foreground">
          Each player has 2 wildcards: one on a Pot 3 team's group match, one on a Pot 4 team's group match.
          The chosen match's points are doubled automatically once it finishes. Assignments are locked.
        </p>
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {PLAYERS.map((p) => {
          const assign = WILDCARD_ASSIGNMENTS[p.name];
          const used = state.wildcards[p.name] ?? [];
          const pot3Team = p.teams.find((t) => t.pot === 3)!.team;
          const pot4Team = p.teams.find((t) => t.pot === 4)!.team;
          return (
            <Card key={p.name} className="p-4 bg-card border-border">
              <div className="font-black text-base mb-2">{p.name}</div>
              <div className="space-y-2">
                <WildcardRow
                  pot={3}
                  team={pot3Team}
                  pair={assign?.pot3}
                  matchId={used.find((u) => u.pot === 3)?.matchId}
                />
                <WildcardRow
                  pot={4}
                  team={pot4Team}
                  pair={assign?.pot4}
                  matchId={used.find((u) => u.pot === 4)?.matchId}
                />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function WildcardRow({
  pot, team, pair, matchId,
}: {
  pot: 3 | 4;
  team: string;
  pair?: [string, string];
  matchId?: string;
}) {
  const match = matchId ? ALL_MATCHES.find((m) => m.id === matchId) : undefined;
  const score = match ? getState().scores[match.id] : undefined;
  const played = !!score?.played;
  return (
    <div className="rounded-md bg-secondary/40 p-2.5 text-xs">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="flex items-center gap-1.5">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${pot === 3 ? "bg-[var(--pot3)] text-[#1a1100]" : "bg-[var(--pot4)] text-white"}`}>P{pot}</span>
          <span className="font-semibold">{TEAMS[team]?.flag} {team}</span>
        </span>
        <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${played ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
          {played ? "DOUBLED ✓" : "pending"}
        </span>
      </div>
      {pair && match ? (
        <div className="text-muted-foreground">
          {pair[0]} vs {pair[1]} · <LocalTime iso={match.date} />
          {played && score && (
            <span className="ml-1 text-primary font-bold">
              · {score.home}–{score.away}
            </span>
          )}
        </div>
      ) : (
        <div className="text-destructive">Match not found in fixtures.</div>
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
  const canSave = home !== "" && away !== "" && e.home && e.away;
  function save() {
    if (!canSave) return;
    setScore(match.id, Number(home) || 0, Number(away) || 0, true);
  }

  return (
    <div className="rounded-md bg-secondary/40 p-2 space-y-1.5">
      <div className="text-[10px] text-muted-foreground"><LocalTime iso={match.date} /> · {match.city}</div>
      <SlotRow team={e.home} onChange={(t) => setKnockoutSlot(match.id, "home", t)} allTeams={allTeams} />
      <SlotRow team={e.away} onChange={(t) => setKnockoutSlot(match.id, "away", t)} allTeams={allTeams} />
      {e.home && e.away && (
        <div className="flex items-center gap-1 pt-1">
          <Input type="number" min={0} value={home} onChange={(ev) => setHome(ev.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") save(); }} className="h-7 w-10 text-center p-1 text-xs" />
          <span className="text-xs">–</span>
          <Input type="number" min={0} value={away} onChange={(ev) => setAway(ev.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") save(); }} className="h-7 w-10 text-center p-1 text-xs" />
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
