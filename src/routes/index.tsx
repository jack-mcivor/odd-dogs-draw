import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { fetchAndApply, initApi, useApiMeta, WILDCARD_ASSIGNMENTS } from "@/lib/wc-api";
import { initLive, useLiveMatch, useLiveState } from "@/lib/wc-live";
import {
  ALL_MATCHES, GROUP_MATCHES, GROUPS, GROUP_LETTERS, KNOCKOUT_MATCHES,
  PLAYERS, POT_LABEL_CLASS, TEAMS, teamOwner, type GroupLetter, type Match, type Pot,
} from "@/lib/wc-data";
import {
  computeAllTotals, displayScore, effectiveTeams, getState, isMatchLive,
  isTeamEliminated, loadFromStorage, nextUpcoming, recentResults, useAppState,
} from "@/lib/wc-store";
import { knockoutAdvanceProbability, priceMatch, teamElo } from "@/lib/wc-probability";
import { computeTeamPower } from "@/lib/wc-power";
import { simulateTournament, type TeamSimProbs } from "@/lib/wc-simulation";
import {
  loadContextFromStorage, useContextState, getTeamContext, getVenueContext,
  setTeamContext, setVenueContext, resetAllContext,
} from "@/lib/wc-context";
import { MatchDetailProvider, useMatchDetail } from "@/components/MatchDetailModal";
import { PredictionBoard } from "@/components/PredictionBoard";
import { BettingPanel } from "@/components/BettingPanel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Trophy, Download, Flame, Calendar, RefreshCw, Info, Zap } from "lucide-react";


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
  useLiveState();
  const apiMeta = useApiMeta();
  const [tab, setTab] = useState("dashboard");
  const [refreshing, setRefreshing] = useState(false);
  const [focusPlayer, setFocusPlayer] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { loadFromStorage(); loadContextFromStorage(); initApi(); initLive(); setMounted(true); }, []);

  if (!mounted) return null;


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
    <MatchDetailProvider>
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
          <div className="hidden min-[600px]:block flex-shrink-0 self-center" aria-hidden="true">
            <img
              src="/footballer.svg"
              width="90"
              height="44"
              alt="Footballer doing keepie-uppie drills"
              className="block"
            />
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
          <TabsList className="w-full grid grid-cols-3 md:grid-cols-6 h-auto bg-card border border-border">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="fixtures">Fixtures</TabsTrigger>
            <TabsTrigger value="players">Players</TabsTrigger>
            <TabsTrigger value="wildcards">Wildcards</TabsTrigger>
            <TabsTrigger value="bracket">Bracket</TabsTrigger>
            <TabsTrigger value="power" className="gap-1 whitespace-nowrap px-1 py-1 text-center text-xs leading-tight sm:gap-0 sm:px-3 sm:text-sm">
              <span className="hidden sm:inline">Live Rankings</span>
              <span className="sm:hidden">Rankings</span>
              <span className="inline-flex items-center rounded-full border border-purple-400/30 bg-purple-500/20 px-1 py-0.5 text-[8px] font-black leading-none tracking-wide text-purple-300 shadow-[0_0_8px_rgba(168,85,247,0.5)] sm:ml-1 sm:px-1.5 sm:text-[10px]">
                <span className="hidden sm:inline">&amp; Oracle Game</span>
                <span className="sm:hidden">Oracle</span>
              </span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard" className="mt-6"><Dashboard onSelectPlayer={goToPlayer} /></TabsContent>
          <TabsContent value="fixtures" className="mt-6"><Fixtures /></TabsContent>
          <TabsContent value="players" className="mt-6"><PlayersTab focusPlayer={focusPlayer} onConsumeFocus={() => setFocusPlayer(null)} /></TabsContent>
          <TabsContent value="wildcards" className="mt-6"><WildcardsTab /></TabsContent>
          <TabsContent value="bracket" className="mt-6"><Bracket /></TabsContent>
          <TabsContent value="power" className="mt-6"><PowerIndexTab /></TabsContent>

        </Tabs>
      </main>
      <footer className="text-center text-xs text-muted-foreground py-8 space-y-1">
        <div>Shared tracker — live scores from openfootball/worldcup.json, refreshed every 60s.</div>
        {apiMeta.offline && <div className="text-amber-400">⚠ Using offline fallback data — live API unavailable.</div>}
      </footer>
    </div>
    </MatchDetailProvider>
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
                <div className="font-bold truncate flex items-center gap-1.5">
                  {p.player}
                  {p.hasLive && (
                    <span className="inline-flex items-center gap-1 rounded bg-red-500 text-white px-1 py-0 text-[9px] font-black animate-pulse">● LIVE</span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Win {p.winPts} · Goals {p.goalPts}{p.wildcardBonus ? ` · WC +${p.wildcardBonus}` : ""}
                  {p.livePts > 0 && <span className="text-amber-400"> · +{p.livePts} live</span>}
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-primary tabular-nums">{p.total}</div>
                {p.livePts > 0 && (
                  <div className="text-[10px] text-amber-400 italic tabular-nums">→ {p.projectedTotal}</div>
                )}
              </div>
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
  const live = useLiveMatch(match.id);
  const isLive = live?.liveStatus === "LIVE";
  const { open } = useMatchDetail();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => open(match.id)}
      onKeyDown={(ev) => { if (ev.key === "Enter") open(match.id); }}
      className="rounded-md bg-secondary/40 px-3 py-2 text-sm cursor-pointer hover:bg-secondary/70 transition"
    >
      <div className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-2">
        {isLive ? (
          <span className="inline-flex items-center gap-1 rounded bg-red-500 text-white px-1 py-0 font-black text-[9px] animate-pulse">
            ● LIVE{live?.timeElapsed === "HT" ? " HT" : /^\d+(\+\d+)?$/.test(live?.timeElapsed ?? "") ? ` ${live!.timeElapsed}'` : ""}
          </span>
        ) : (
          <span><LocalTime iso={match.date} /></span>
        )}
        <span className="text-muted-foreground/70">· {match.city}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <TeamChip team={e.home} />
        {isLive && live ? (
          <span className="font-black text-primary tabular-nums">{live.liveScoreHome}–{live.liveScoreAway}</span>
        ) : (
          <span className="text-muted-foreground text-xs">vs</span>
        )}
        <TeamChip team={e.away} />
      </div>
    </div>
  );
}

function MiniResult({ match }: { match: Match }) {
  const ds = displayScore(match.id);
  const e = effectiveTeams(match);
  const live = useLiveMatch(match.id);
  const { open } = useMatchDetail();
  const homeScorers = live?.homeScorers ?? [];
  const awayScorers = live?.awayScorers ?? [];
  const hasScorers = homeScorers.length + awayScorers.length > 0;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => open(match.id)}
      onKeyDown={(ev) => { if (ev.key === "Enter") open(match.id); }}
      className="rounded-md bg-secondary/40 px-3 py-2 text-sm cursor-pointer hover:bg-secondary/70 transition"
    >
      <div className="text-[10px] text-muted-foreground mb-0.5"><LocalTime iso={match.date} /></div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 gap-y-0.5">
        <TeamChip team={e.home} />
        <span className="font-black text-primary tabular-nums row-span-2 self-center">{ds?.home ?? 0}–{ds?.away ?? 0}</span>
        <div className="justify-self-end"><TeamChip team={e.away} /></div>
        {hasScorers && (
          <>
            <div className="text-[10px] text-muted-foreground truncate">⚽ {homeScorers.join(" · ")}</div>
            <div className="text-[10px] text-muted-foreground truncate text-right">⚽ {awayScorers.join(" · ")}</div>
          </>
        )}
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
  const liveState = useLiveState();

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
      const ds = displayScore(m.id);
      if (!showCompleted && ds?.played) return false;
      return true;
    });
  }, [stage, player, team, showCompleted, liveState]);

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
      <div className="flex items-center gap-2 mb-4">
        <Switch
          id="show-completed"
          checked={showCompleted}
          onCheckedChange={setShowCompleted}
        />
        <Label htmlFor="show-completed" className="text-sm cursor-pointer">
          Show completed fixtures
        </Label>
      </div>
      <div className="flex items-center justify-between mb-2 text-[11px] text-muted-foreground min-h-[18px]">
        <span>{filtered.length} match{filtered.length === 1 ? "" : "es"}</span>
        {liveState.loading && (
          <span className="inline-flex items-center gap-1.5 opacity-70">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live data loading…
          </span>
        )}
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
  // Which teams have a wildcard applied to this match (by pot match on each side)
  const wildcardTeams: string[] = [];
  if (match.stage === "group") {
    for (const uses of Object.values(state.wildcards)) {
      for (const u of uses) {
        if (u.matchId !== match.id) continue;
        for (const side of [e.home, e.away]) {
          if (side && TEAMS[side]?.pot === u.pot && !wildcardTeams.includes(side)) {
            wildcardTeams.push(side);
          }
        }
      }
    }
  }
  const live = useLiveMatch(match.id);
  const isLive = (live?.liveStatus === "LIVE") || (apiMeta.liveMatchIds.has(match.id) && !score?.played);
  const ds = displayScore(match.id);
  const ukTv = apiMeta.ukChannels.map((c) => c.name).join(" / ");
  const { open } = useMatchDetail();

  const ownerH = teamOwner(e.home);
  const ownerA = teamOwner(e.away);

  const stageLabel = match.stage === "group" ? `Group ${match.group}` : match.stage;

  return (
    <Card
      className="p-3 md:p-4 bg-card border-border cursor-pointer hover:ring-2 hover:ring-primary/30 transition"
      onClick={() => open(match.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(ev) => { if (ev.key === "Enter") open(match.id); }}
    >
      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-2 gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="border-primary/40 text-primary">{stageLabel}</Badge>
          <span><LocalTime iso={match.date} /></span>
          <span className="hidden sm:inline">· {match.venue}, {match.city}</span>
          {ukTv && match.stage === "group" && (
            <span className="hidden md:inline">· 📺 UK: {ukTv}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {isLive && (
            <span className="inline-flex items-center gap-1 rounded bg-red-500 text-white px-1.5 py-0.5 font-black text-[10px] animate-pulse">
              ● LIVE{live?.timeElapsed === "HT" ? " HT" : /^\d+(\+\d+)?$/.test(live?.timeElapsed ?? "") ? ` ${live!.timeElapsed}'` : ""}
            </span>
          )}
          {wildcardTeams.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded bg-primary text-primary-foreground px-1.5 py-0.5 font-black text-[10px]">
              WC ×2 · {TEAMS[t]?.flag} {t}
            </span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="text-right">
          <TeamChip team={e.home} />
          {ownerH && <div className="text-[10px] text-muted-foreground mt-0.5">{ownerH}</div>}
        </div>
        <div className="flex items-center justify-center gap-2 font-black tabular-nums text-lg min-w-[80px]">
          {ds ? (
            <>
              <span>{ds.home}</span>
              <span className="text-muted-foreground">–</span>
              <span>{ds.away}</span>
            </>
          ) : (
            <span className="text-muted-foreground text-xs font-normal">vs</span>
          )}
        </div>
        <div className="text-left">
          <TeamChip team={e.away} />
          {ownerA && <div className="text-[10px] text-muted-foreground mt-0.5">{ownerA}</div>}
        </div>
      </div>
      {ds?.played && (
        <div className="text-[10px] text-muted-foreground mt-2">Full time</div>
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
                        {t.matches.map(({ match, points, live }) => {
                          const e = effectiveTeams(match);
                          const opp = e.home === team ? e.away : e.home;
                          const ds = displayScore(match.id);
                          const my = ds ? (e.home === team ? ds.home : ds.away) : 0;
                          const th = ds ? (e.home === team ? ds.away : ds.home) : 0;
                          return (
                            <MatchRow
                              key={`${match.id}-${live ? "L" : "F"}`}
                              matchId={match.id}
                              label={`vs ${TEAMS[opp]?.flag ?? ""} ${opp} · ${my}–${th}`}
                              points={points.total}
                              hasWC={points.wildcardBonus > 0}
                              live={!!live}
                            />
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

function MatchRow({ matchId, label, points, hasWC, live }: { matchId: string; label: string; points: number; hasWC: boolean; live: boolean }) {
  const { open } = useMatchDetail();
  return (
    <button
      type="button"
      onClick={() => open(matchId)}
      className="w-full flex items-center justify-between gap-2 text-[11px] text-muted-foreground hover:text-foreground transition text-left"
    >
      <span className="truncate flex items-center gap-1">
        {live && (
          <span className="inline-flex items-center gap-0.5 rounded bg-red-500 text-white px-1 py-0 text-[9px] font-black animate-pulse">●LIVE</span>
        )}
        {label}
      </span>
      <span className={`font-bold ${live ? "italic text-amber-400" : "text-primary"}`}>
        {live ? "~" : "+"}{points}{hasWC ? " ⚡" : ""}
      </span>
    </button>
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

// ---------- FIFA 2026 group-stage tiebreakers ----------
// 1) points 2) head-to-head points/result 3) GD 4) GF 5) FIFA ranking (Elo fallback)
type TStat = { p: number; gf: number; ga: number; pts: number };
type MatchOutcome = { home: string; away: string; hs: number; as: number };

function rankBuckets(teams: string[], stats: Record<string, TStat>, results: MatchOutcome[]): string[][] {
  if (teams.length <= 1) return teams.length === 1 ? [[teams[0]]] : [];
  const cmpPoints = (a: string, b: string) => stats[b].pts - stats[a].pts;
  const sorted = [...teams].sort(cmpPoints);
  const out: string[][] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && cmpPoints(sorted[i], sorted[j]) === 0) j++;
    const tied = sorted.slice(i, j);
    if (tied.length === 1) out.push(tied);
    else out.push(...resolvePointTie(tied, stats, results));
    i = j;
  }
  return out;
}

function resolvePointTie(
  tied: string[],
  stats: Record<string, TStat>,
  results: MatchOutcome[],
): string[][] {
  const h: Record<string, TStat> = {};
  tied.forEach((t) => h[t] = { p: 0, gf: 0, ga: 0, pts: 0 });
  const set = new Set(tied);
  for (const r of results) {
    if (!set.has(r.home) || !set.has(r.away)) continue;
    h[r.home].p++; h[r.away].p++;
    h[r.home].gf += r.hs; h[r.home].ga += r.as;
    h[r.away].gf += r.as; h[r.away].ga += r.hs;
    if (r.hs > r.as) h[r.home].pts += 3;
    else if (r.hs < r.as) h[r.away].pts += 3;
    else { h[r.home].pts++; h[r.away].pts++; }
  }
  const cmpHeadToHead = (a: string, b: string) => h[b].pts - h[a].pts;
  const sorted = [...tied].sort(cmpHeadToHead);
  const out: string[][] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && cmpHeadToHead(sorted[i], sorted[j]) === 0) j++;
    const sub = sorted.slice(i, j);
    if (sub.length === 1) out.push(sub);
    else if (sub.length === tied.length) out.push(...resolveOverallTie(sub, stats));
    else out.push(...resolvePointTie(sub, stats, results));
    i = j;
  }
  return out;
}

function resolveOverallTie(teams: string[], stats: Record<string, TStat>): string[][] {
  const cmp = (a: string, b: string) =>
    (stats[b].gf - stats[b].ga) - (stats[a].gf - stats[a].ga) ||
    stats[b].gf - stats[a].gf ||
    teamElo(b) - teamElo(a);
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

function bucketCredit(buckets: string[][], targetPositions: number[]): Record<string, number> {
  const credit: Record<string, number> = {};
  let pos = 1;
  for (const bk of buckets) {
    const overlap = targetPositions.filter((p) => p >= pos && p < pos + bk.length).length;
    if (overlap > 0) {
      const frac = overlap / bk.length;
      for (const t of bk) credit[t] = (credit[t] ?? 0) + frac;
    }
    pos += bk.length;
  }
  return credit;
}

// Build {stats, results} for a group from currently-played/live scores only (best-estimate snapshot).
function liveGroupStats(letter: GroupLetter): { stats: Record<string, TStat>; results: MatchOutcome[]; allPlayed: boolean } {
  const teams = GROUPS[letter];
  const stats: Record<string, TStat> = {};
  teams.forEach((t) => stats[t] = { p: 0, gf: 0, ga: 0, pts: 0 });
  const results: MatchOutcome[] = [];
  const ms = GROUP_MATCHES.filter((m) => m.group === letter);
  let played = 0;
  for (const m of ms) {
    const s = getState().scores[m.id];
    if (!s?.played) continue;
    played++;
    stats[m.home].p++; stats[m.away].p++;
    stats[m.home].gf += s.home; stats[m.home].ga += s.away;
    stats[m.away].gf += s.away; stats[m.away].ga += s.home;
    if (s.home > s.away) stats[m.home].pts += 3;
    else if (s.home < s.away) stats[m.away].pts += 3;
    else { stats[m.home].pts++; stats[m.away].pts++; }
    results.push({ home: m.home, away: m.away, hs: s.home, as: s.away });
  }
  return { stats, results, allPlayed: played === ms.length };
}

interface PlacementProbs {
  first: number;
  second: number;
  third: number;
  thirdThrough: number;
  thirdOut: number;
  fourth: number;
  q: number;
  t: number;
  e: number;
}

type GroupProbs = Record<string, PlacementProbs>;
type ThirdRecord = { team: string; group: GroupLetter; pts: number; gd: number; gf: number; elo: number };
type GroupScenario = {
  group: GroupLetter;
  weight: number;
  buckets: string[][];
  third: ThirdRecord;
};

function emptyPlacementProbs(): PlacementProbs {
  return {
    first: 0,
    second: 0,
    third: 0,
    thirdThrough: 0,
    thirdOut: 0,
    fourth: 0,
    q: 0,
    t: 0,
    e: 0,
  };
}

function compareThirdRecords(a: ThirdRecord, b: ThirdRecord): number {
  return b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || b.elo - a.elo;
}

function probabilityThirdRanksTop8(
  target: ThirdRecord,
  scenariosByGroup: Record<GroupLetter, GroupScenario[]>,
): number {
  let dist = [1];
  for (const g of GROUP_LETTERS) {
    if (g === target.group) continue;
    const pAbove = scenariosByGroup[g].reduce(
      (sum, scenario) => sum + (compareThirdRecords(scenario.third, target) < 0 ? scenario.weight : 0),
      0,
    );
    const next = Array(dist.length + 1).fill(0);
    for (let i = 0; i < dist.length; i++) {
      next[i] += dist[i] * (1 - pAbove);
      next[i + 1] += dist[i] * pAbove;
    }
    dist = next;
  }
  return dist.slice(0, 8).reduce((sum, prob) => sum + prob, 0);
}

// Per-group exhaustive enumeration of remaining unplayed matches (3^n).
// Each unplayed match → home win 1-0, draw 1-1, away win 0-1.
function enumerateGroupScenarios(letter: GroupLetter): GroupScenario[] {
  const teams = GROUPS[letter];
  const matches = GROUP_MATCHES.filter((m) => m.group === letter);
  type K = { m: Match; hs: number; as: number };
  type Unknown = { m: Match; homeWin: number; draw: number; awayWin: number };
  const known: K[] = [];
  const unknown: Unknown[] = [];
  for (const m of matches) {
    const s = getState().scores[m.id];
    if (s?.played) known.push({ m, hs: s.home, as: s.away });
    else {
      const price = priceMatch(m.home, m.away);
      unknown.push({
        m,
        homeWin: price?.homeWin ?? 1 / 3,
        draw: price?.draw ?? 1 / 3,
        awayWin: price?.awayWin ?? 1 / 3,
      });
    }
  }
  const scenarios: GroupScenario[] = [];
  const N = Math.pow(3, unknown.length);
  let totalWeight = 0;
  for (let idx = 0; idx < N; idx++) {
    const stats: Record<string, TStat> = {};
    teams.forEach((t) => stats[t] = { p: 0, gf: 0, ga: 0, pts: 0 });
    const results: MatchOutcome[] = [];
    const apply = (hm: string, aw: string, hs: number, as: number) => {
      stats[hm].p++; stats[aw].p++;
      stats[hm].gf += hs; stats[hm].ga += as;
      stats[aw].gf += as; stats[aw].ga += hs;
      if (hs > as) stats[hm].pts += 3;
      else if (hs < as) stats[aw].pts += 3;
      else { stats[hm].pts++; stats[aw].pts++; }
      results.push({ home: hm, away: aw, hs, as });
    };
    for (const k of known) apply(k.m.home, k.m.away, k.hs, k.as);
    let id = idx;
    let scenarioWeight = 1;
    for (const { m, homeWin, draw, awayWin } of unknown) {
      const o = id % 3; id = Math.floor(id / 3);
      if (o === 0) {
        scenarioWeight *= homeWin;
        apply(m.home, m.away, 1, 0);
      } else if (o === 1) {
        scenarioWeight *= draw;
        apply(m.home, m.away, 1, 1);
      } else {
        scenarioWeight *= awayWin;
        apply(m.home, m.away, 0, 1);
      }
    }
    const buckets = rankBuckets(teams, stats, results);
    const thirdTeam = buckets.flat()[2];
    const thirdStats = stats[thirdTeam];
    totalWeight += scenarioWeight;
    scenarios.push({
      group: letter,
      weight: scenarioWeight,
      buckets,
      third: {
        team: thirdTeam,
        group: letter,
        pts: thirdStats.pts,
        gd: thirdStats.gf - thirdStats.ga,
        gf: thirdStats.gf,
        elo: teamElo(thirdTeam),
      },
    });
  }
  for (const scenario of scenarios) {
    scenario.weight /= totalWeight || 1;
  }
  return scenarios;
}

function computeAllGroupProbs(): GroupProbs {
  const all: GroupProbs = {};
  for (const team of Object.keys(TEAMS)) all[team] = emptyPlacementProbs();
  const scenariosByGroup = {} as Record<GroupLetter, GroupScenario[]>;
  for (const g of GROUP_LETTERS) scenariosByGroup[g] = enumerateGroupScenarios(g);

  for (const g of GROUP_LETTERS) {
    for (const scenario of scenariosByGroup[g]) {
      const first = bucketCredit(scenario.buckets, [1]);
      const second = bucketCredit(scenario.buckets, [2]);
      const fourth = bucketCredit(scenario.buckets, [4]);
      for (const team of GROUPS[g]) {
        all[team].first += (first[team] ?? 0) * scenario.weight;
        all[team].second += (second[team] ?? 0) * scenario.weight;
        all[team].fourth += (fourth[team] ?? 0) * scenario.weight;
      }

      const pThrough = probabilityThirdRanksTop8(scenario.third, scenariosByGroup);
      const third = all[scenario.third.team];
      third.third += scenario.weight;
      third.thirdThrough += scenario.weight * pThrough;
      third.thirdOut += scenario.weight * (1 - pThrough);
    }
  }

  for (const probs of Object.values(all)) {
    probs.q = probs.first + probs.second;
    probs.t = probs.third;
    probs.e = probs.fourth;
  }
  return all;
}

// ---------- Best estimate standings (live snapshot, FIFA tiebreakers) ----------
type GroupStanding = {
  letter: GroupLetter;
  order: string[];           // flat order (within tied bucket: input order)
  buckets: string[][];
  stats: Record<string, TStat>;
  allPlayed: boolean;
};

function bestEstimateStandings(): Record<GroupLetter, GroupStanding> {
  const out = {} as Record<GroupLetter, GroupStanding>;
  for (const g of GROUP_LETTERS) {
    const { stats, results, allPlayed } = liveGroupStats(g);
    const buckets = rankBuckets(GROUPS[g], stats, results);
    out[g] = { letter: g, order: buckets.flat(), buckets, stats, allPlayed };
  }
  return out;
}

// Rank third-place teams across groups: pts, GD, GF, FIFA ranking (Elo fallback).
function rankThirds(standings: Record<GroupLetter, GroupStanding>): { team: string; group: GroupLetter; complete: boolean }[] {
  const arr = GROUP_LETTERS.map((g) => {
    const s = standings[g];
    const t = s.order[2];
    const st = s.stats[t];
    return { team: t, group: g, complete: s.allPlayed, pts: st.pts, gd: st.gf - st.ga, gf: st.gf };
  });
  arr.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || teamElo(b.team) - teamElo(a.team));
  return arr.map(({ team, group, complete }) => ({ team, group, complete }));
}

// ---------- FIFA confirmed R32 bracket structure (Matches 73–88) ----------
type R32Slot =
  | { kind: "w"; g: GroupLetter }
  | { kind: "ru"; g: GroupLetter }
  | { kind: "b3"; cluster: GroupLetter[] };

const R32_STRUCTURE: Array<[R32Slot, R32Slot]> = [
  [{ kind: "ru", g: "A" }, { kind: "ru", g: "B" }],                                   // 73
  [{ kind: "w",  g: "E" }, { kind: "b3", cluster: ["A","B","C","D","F"] }],          // 74
  [{ kind: "w",  g: "F" }, { kind: "ru", g: "C" }],                                   // 75
  [{ kind: "w",  g: "C" }, { kind: "ru", g: "F" }],                                   // 76
  [{ kind: "w",  g: "I" }, { kind: "b3", cluster: ["C","D","F","G","H"] }],          // 77
  [{ kind: "ru", g: "E" }, { kind: "ru", g: "I" }],                                   // 78
  [{ kind: "w",  g: "A" }, { kind: "b3", cluster: ["C","E","F","H","I"] }],          // 79
  [{ kind: "w",  g: "L" }, { kind: "b3", cluster: ["E","H","I","J","K"] }],          // 80
  [{ kind: "w",  g: "D" }, { kind: "b3", cluster: ["B","E","F","I","J"] }],          // 81
  [{ kind: "w",  g: "G" }, { kind: "b3", cluster: ["A","E","H","I","J"] }],          // 82
  [{ kind: "ru", g: "K" }, { kind: "ru", g: "L" }],                                   // 83
  [{ kind: "w",  g: "H" }, { kind: "ru", g: "J" }],                                   // 84
  [{ kind: "w",  g: "B" }, { kind: "b3", cluster: ["E","F","G","I","J"] }],          // 85
  [{ kind: "w",  g: "J" }, { kind: "ru", g: "H" }],                                   // 86
  [{ kind: "w",  g: "K" }, { kind: "b3", cluster: ["D","E","I","J","L"] }],          // 87
  [{ kind: "ru", g: "D" }, { kind: "ru", g: "G" }],                                   // 88
];

type ProjectedSlot =
  | {
      team: string;
      projected: boolean;
      group?: GroupLetter;
      role?: "winner" | "runner-up" | "3rd-place";
      viaMatchId?: string;
      confidence?: number; // 0..1 — probability this team occupies this slot
    }
  | { team: null; description: string; confidence?: number };


function projectR32Slots(
  probs: GroupProbs,
): ProjectedSlot[][] {

  const standings = bestEstimateStandings();
  const allGroupsComplete = GROUP_LETTERS.every((g) => standings[g].allPlayed);
  const thirds = rankThirds(standings); // already sorted
  // Top-8 third places (current best estimate)
  const top8 = new Set(thirds.slice(0, 8).map((t) => t.group));
  // Greedy assignment of 3rd-place teams to b3 slots
  const used = new Set<GroupLetter>();
  const slotRows: ProjectedSlot[][] = [];

  // We need to assign in the order of the FIFA b3 slots, picking the top-ranked
  // currently-top-8 third from each slot's cluster.
  const b3Assignments = new Map<number, { team: string; group: GroupLetter; projected: boolean } | { team: null; description: string }>();

  // First gather all b3 slot indices and clusters
  const b3List: { row: number; col: number; cluster: GroupLetter[] }[] = [];
  R32_STRUCTURE.forEach((pair, row) => {
    pair.forEach((slot, col) => {
      if (slot.kind === "b3") b3List.push({ row, col, cluster: slot.cluster });
    });
  });

  for (const { row, col, cluster } of b3List) {
    // candidates: groups in cluster, in current best-estimate top-8, not yet used
    const candidates = thirds.filter(
      (t) => cluster.includes(t.group) && top8.has(t.group) && !used.has(t.group),
    );
    if (candidates.length === 0) {
      b3Assignments.set(row * 10 + col, {
        team: null,
        description: `Best 3rd — Group ${cluster.join("/")}`,
      });
    } else {
      const pick = candidates[0];
      used.add(pick.group);
      b3Assignments.set(row * 10 + col, {
        team: pick.team,
        group: pick.group,
        projected: !allGroupsComplete || !pick.complete,
      });
    }
  }

  R32_STRUCTURE.forEach((pair, row) => {
    const rowOut: ProjectedSlot[] = [];
    pair.forEach((slot, col) => {
      if (slot.kind === "w") {
        const s = standings[slot.g];
        const team = s.order[0];
        const p = probs[team] ?? emptyPlacementProbs();
        rowOut.push({
          team,
          projected: !s.allPlayed,
          group: slot.g,
          role: "winner",
          confidence: s.allPlayed ? 1 : p.first,
        });
      } else if (slot.kind === "ru") {
        const s = standings[slot.g];
        const team = s.order[1];
        const p = probs[team] ?? emptyPlacementProbs();
        rowOut.push({
          team,
          projected: !s.allPlayed,
          group: slot.g,
          role: "runner-up",
          confidence: s.allPlayed ? 1 : p.second,
        });
      } else {
        const a = b3Assignments.get(row * 10 + col)!;
        if (a.team !== null) {
          const p = probs[a.team] ?? emptyPlacementProbs();
          rowOut.push({
            team: a.team,
            projected: a.projected,
            group: a.group,
            role: "3rd-place",
            confidence: a.projected ? p.thirdThrough : 1,
          });
        } else {
          rowOut.push({ team: null, description: a.description });
        }
      }
    });
    slotRows.push(rowOut);
  });

  return slotRows;
}

// ---------- Later-round projection ----------
// If a knockout match has been played AND its slots are filled, return the
// actual winner / loser so confirmed teams cascade through later rounds.
function knockoutActualPair(
  matchId: string,
  scores: Record<string, { home: number; away: number; played: boolean }>,
  knockoutSlots: Record<string, { home?: string; away?: string }>,
): { winner: string; loser: string } | null {
  const s = scores[matchId];
  if (!s?.played) return null;
  const ko = knockoutSlots[matchId];
  if (!ko?.home || !ko?.away) return null;
  if (s.home > s.away) return { winner: ko.home, loser: ko.away };
  if (s.away > s.home) return { winner: ko.away, loser: ko.home };
  return null; // tie — assume penalty shoot-out result not yet known
}

function projectMatchOutcome(
  a: ProjectedSlot,
  b: ProjectedSlot,
  matchId: string,
  scores: Record<string, { home: number; away: number; played: boolean }>,
  knockoutSlots: Record<string, { home?: string; away?: string }>,
): { winner: ProjectedSlot; loser: ProjectedSlot } {
  const actual = knockoutActualPair(matchId, scores, knockoutSlots);
  if (actual) {
    return {
      winner: { team: actual.winner, projected: false, viaMatchId: matchId, confidence: 1 },
      loser: { team: actual.loser, projected: false, viaMatchId: matchId, confidence: 1 },
    };
  }
  type HasTeam = { team: string; group?: GroupLetter; confidence: number };
  const aHas: HasTeam | null = a.team === null ? null : { team: a.team, group: a.group, confidence: a.confidence ?? 1 };
  const bHas: HasTeam | null = b.team === null ? null : { team: b.team, group: b.group, confidence: b.confidence ?? 1 };
  if (!aHas && !bHas) {
    return {
      winner: { team: null, description: `Winner ${matchId}` },
      loser: { team: null, description: `Loser ${matchId}` },
    };
  }
  if (!aHas && bHas) {
    return {
      winner: { team: bHas.team, projected: true, group: bHas.group, viaMatchId: matchId, confidence: bHas.confidence * 0.5 },
      loser: { team: null, description: `Loser ${matchId}` },
    };
  }
  if (!bHas && aHas) {
    return {
      winner: { team: aHas.team, projected: true, group: aHas.group, viaMatchId: matchId, confidence: aHas.confidence * 0.5 },
      loser: { team: null, description: `Loser ${matchId}` },
    };
  }
  const aAdvanceProb = knockoutAdvanceProbability(aHas!.team, bHas!.team) ?? 0.5;
  const pBoth = aHas!.confidence * bHas!.confidence;
  const winnerIsA = aAdvanceProb >= 0.5;
  const w = winnerIsA ? aHas! : bHas!;
  const l = winnerIsA ? bHas! : aHas!;
  const wMatch = winnerIsA ? aAdvanceProb : 1 - aAdvanceProb;
  const lMatch = 1 - wMatch;
  return {
    winner: { team: w.team, projected: true, group: w.group, viaMatchId: matchId, confidence: pBoth * wMatch },
    loser: { team: l.team, projected: true, group: l.group, viaMatchId: matchId, confidence: pBoth * lMatch },
  };
}

type RoundProjection = {
  R32: ProjectedSlot[][];
  R16: ProjectedSlot[][];
  QF: ProjectedSlot[][];
  SF: ProjectedSlot[][];
  "3rd": ProjectedSlot[][];
  Final: ProjectedSlot[][];
};

function projectAllRounds(
  probs: GroupProbs,
  scores: Record<string, { home: number; away: number; played: boolean }>,
  knockoutSlots: Record<string, { home?: string; away?: string }>,
): RoundProjection {
  const R32 = projectR32Slots(probs);

  const r32Winners: ProjectedSlot[] = R32.map((pair, i) =>
    projectMatchOutcome(pair[0], pair[1], `R32-${i + 1}`, scores, knockoutSlots).winner,
  );

  const R16: ProjectedSlot[][] = [];
  const r16Winners: ProjectedSlot[] = [];
  for (let i = 0; i < 8; i++) {
    const a = r32Winners[i * 2];
    const b = r32Winners[i * 2 + 1];
    R16.push([a, b]);
    r16Winners.push(
      projectMatchOutcome(a, b, `R16-${i + 1}`, scores, knockoutSlots).winner,
    );
  }

  const QF: ProjectedSlot[][] = [];
  const qfWinners: ProjectedSlot[] = [];
  for (let i = 0; i < 4; i++) {
    const a = r16Winners[i * 2];
    const b = r16Winners[i * 2 + 1];
    QF.push([a, b]);
    qfWinners.push(
      projectMatchOutcome(a, b, `QF-${i + 1}`, scores, knockoutSlots).winner,
    );
  }

  const SF: ProjectedSlot[][] = [];
  const sfWinners: ProjectedSlot[] = [];
  const sfLosers: ProjectedSlot[] = [];
  for (let i = 0; i < 2; i++) {
    const a = qfWinners[i * 2];
    const b = qfWinners[i * 2 + 1];
    SF.push([a, b]);
    const out = projectMatchOutcome(a, b, `SF-${i + 1}`, scores, knockoutSlots);
    sfWinners.push(out.winner);
    sfLosers.push(out.loser);
  }

  return {
    R32,
    R16,
    QF,
    SF,
    "3rd": [[sfLosers[0], sfLosers[1]]],
    Final: [[sfWinners[0], sfWinners[1]]],
  };
}


// ---------- UI ----------

function PlayerTag({ team }: { team: string }) {
  const owner = teamOwner(team);
  if (!owner) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1 py-0 text-[9px] font-bold"
      style={{ background: PLAYER_COLOR[owner], color: "#0a0a0a" }}
      title={`Owned by ${owner}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-black/40" />
      {owner}
    </span>
  );
}

function BracketTeam({ team, projected }: { team: string; projected: boolean }) {
  const t = TEAMS[team];
  return (
    <span className={`inline-flex items-center gap-1 ${projected ? "italic text-muted-foreground" : ""}`}>
      <span className="text-base leading-none">{t?.flag ?? "🏳️"}</span>
      <span className="font-semibold">{team}</span>
      {t && <PotBadge pot={t.pot} />}
      <PlayerTag team={team} />
    </span>
  );
}

function Bracket() {
  const state = useAppState();
  // recompute on score / knockout-slot changes
  const { groupProbs, standings, rounds } = useMemo(() => {
    void state;
    const standings = bestEstimateStandings();
    const groupProbs = computeAllGroupProbs();
    return {
      groupProbs,
      standings,
      rounds: projectAllRounds(groupProbs, state.scores, state.knockoutSlots),
    };
  }, [state.scores, state.knockoutSlots]);


  const laterStages = [
    { key: "R16", label: "Round of 16" },
    { key: "QF", label: "Quarter-finals" },
    { key: "SF", label: "Semi-finals" },
    { key: "3rd", label: "Third-place play-off" },
    { key: "Final", label: "Final" },
  ] as const;

  return (
    <div className="space-y-6">
      <Card className="p-4 bg-card border-border">
        <h2 className="text-lg font-bold mb-1">Group standings (live)</h2>
        <p className="text-[11px] text-muted-foreground mb-2">
          Model-weighted group-finish probabilities from enumerating every possible result
          class of remaining group matches, using official FIFA 2026 tiebreakers
          (pts → head-to-head → GD → GF → Elo ranking). Third-place teams still need a top-8 cross-group ranking.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {GROUP_LETTERS.map((g) => (
            <GroupTable key={g} letter={g} probs={groupProbs} standing={standings[g]} />
          ))}
        </div>
      </Card>

      <Card className="p-4 bg-card border-border">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold">Round of 32 — projected bracket</h3>
          <span className="text-[10px] text-muted-foreground italic">
            Confidence-based: % next to each team = probability they fill that slot. Confirmed when their group(s) finish.
          </span>

        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {KNOCKOUT_MATCHES.filter((m) => m.stage === "R32").map((m, i) => (
            <ProjectedKnockoutCard key={m.id} match={m} slots={rounds.R32[i]} label={`M${73 + i}`} />
          ))}
        </div>
      </Card>

      {laterStages.map(({ key, label }) => {
        const matches = KNOCKOUT_MATCHES.filter((m) => m.stage === key);
        const slotsByMatch = rounds[key];
        return (
          <Card key={key} className="p-4 bg-card border-border">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold">{label} — projected matchups</h3>
              <span className="text-[10px] text-muted-foreground italic">
                Confidence-based: % combines group progression × Elo-xG matchup probability. Updates live as scores come in.
              </span>

            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {matches.map((m, i) => (
                <ProjectedKnockoutCard
                  key={m.id}
                  match={m}
                  slots={slotsByMatch[i] ?? [
                    { team: null, description: "TBD" },
                    { team: null, description: "TBD" },
                  ]}
                  label={m.id}
                />
              ))}
            </div>
          </Card>
        );
      })}

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

function GroupTable({
  letter,
  probs,
  standing,
}: {
  letter: GroupLetter;
  probs: GroupProbs;
  standing: GroupStanding;
}) {
  const formatPlacementChance = (chance: number) => {
    if (chance <= 0.0001) return "";
    if (chance >= 0.9995) return "✓";
    const pct = chance * 100;
    if (pct < 0.1) return "<0.1%";
    if (pct < 10) return `${pct.toFixed(1)}%`;
    return `${pct.toFixed(0)}%`;
  };

  return (
    <div className="rounded-md bg-secondary/30 p-2">
      <div className="text-xs font-black text-primary mb-1">Group {letter}</div>
      <table className="w-full table-fixed text-[10px]">
        <colgroup>
          <col className="w-[42%]" />
          <col className="w-[11.6%]" />
          <col className="w-[11.6%]" />
          <col className="w-[11.6%]" />
          <col className="w-[11.6%]" />
          <col className="w-[11.6%]" />
        </colgroup>
        <thead>
          <tr className="text-muted-foreground">
            <th className="pb-1 pr-1 text-left font-semibold">Team</th>
            <th className="pb-1 text-right font-semibold" title="Chance of finishing 1st">1st</th>
            <th className="pb-1 text-right font-semibold" title="Chance of finishing 2nd">2nd</th>
            <th className="pb-1 text-right font-semibold" title="Chance of finishing 3rd and qualifying as a best third-place team">3T</th>
            <th className="pb-1 text-right font-semibold" title="Chance of finishing 3rd and going out">3O</th>
            <th className="pb-1 text-right font-semibold" title="Chance of finishing 4th">4th</th>
          </tr>
        </thead>
        <tbody>
          {standing.order.map((t) => {
            const p = probs[t] ?? emptyPlacementProbs();
            const title = `1st ${(p.first*100).toFixed(1)}% · 2nd ${(p.second*100).toFixed(1)}% · 3rd & thru ${(p.thirdThrough*100).toFixed(1)}% · 3rd & out ${(p.thirdOut*100).toFixed(1)}% · 4th ${(p.fourth*100).toFixed(1)}%`;
            return (
              <tr key={t} title={title} className="border-t border-border/30 first:border-t-0">
                <td className="py-1 pr-1">
                  <span className="flex min-w-0 items-center gap-1">
                    <span>{TEAMS[t].flag}</span>
                    <span className="truncate">{t}</span>
                    <PlayerTag team={t} />
                  </span>
                </td>
                <td className="py-1 text-right font-semibold tabular-nums text-emerald-400">{formatPlacementChance(p.first)}</td>
                <td className="py-1 text-right font-semibold tabular-nums text-emerald-400">{formatPlacementChance(p.second)}</td>
                <td className="py-1 text-right font-semibold tabular-nums text-emerald-400">{formatPlacementChance(p.thirdThrough)}</td>
                <td className="py-1 text-right font-semibold tabular-nums text-amber-400">{formatPlacementChance(p.thirdOut)}</td>
                <td className="py-1 text-right font-semibold tabular-nums text-destructive">{formatPlacementChance(p.fourth)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProjectedKnockoutCard({
  match,
  slots,
  label,
}: {
  match: Match;
  slots: ProjectedSlot[];
  label: string;
}) {
  const anyProjected = slots.some((s) => s.team === null || s.projected);
  // Overall matchup confidence = product of both slot confidences
  const matchConf = slots.reduce<number | null>((acc, s) => {
    const c = s.confidence;
    if (c === undefined) return acc;
    return acc === null ? c : acc * c;
  }, null);
  const showMatchConf = anyProjected && matchConf !== null && matchConf < 0.9999;
  return (
    <div
      className={`rounded-md p-2 space-y-1 ${anyProjected ? "border border-dashed border-muted-foreground/40 bg-secondary/20" : "bg-secondary/40 border border-transparent"}`}
    >
      <div className="text-[10px] text-muted-foreground flex items-center justify-between gap-1">
        <span>{label} · <LocalTime iso={match.date} /></span>
        {anyProjected && (
          <span
            className="rounded bg-amber-400/15 text-amber-400 px-1 py-0 text-[9px] font-bold tracking-wide"
            title="Confidence-based projection"
          >
            {showMatchConf ? `~${formatConfidence(matchConf!)} CONF` : "PROJECTED"}
          </span>
        )}
      </div>
      <div className="text-[10px] text-muted-foreground">{match.city}</div>
      <div className="space-y-1">
        {slots.map((s, i) => <ProjectedSlotRow key={i} slot={s} />)}
      </div>
    </div>
  );
}

function formatConfidence(c: number): string {
  const pct = c * 100;
  if (pct >= 99.5) return "99%";
  if (pct < 1) return `${pct.toFixed(1)}%`;
  if (pct < 10) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(0)}%`;
}

function ProjectedSlotRow({ slot }: { slot: ProjectedSlot }) {
  if (slot.team === null) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-5 rounded bg-muted-foreground/30" />
        <span className="text-xs italic text-muted-foreground">{slot.description}</span>
      </div>
    );
  }
  const owner = teamOwner(slot.team);
  const color = owner ? PLAYER_COLOR[owner] : "transparent";
  const roleLabel =
    slot.role === "winner" ? `1${slot.group}`
    : slot.role === "runner-up" ? `2${slot.group}`
    : slot.role === "3rd-place" ? `3${slot.group}`
    : "";
  const conf = slot.confidence;
  const showConf = slot.projected && conf !== undefined;
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-1.5 h-5 rounded" style={{ background: color }} />
      {roleLabel && (
        <span className="text-[9px] text-muted-foreground w-6 tabular-nums">{roleLabel}</span>
      )}
      <BracketTeam team={slot.team} projected={slot.projected} />
      {showConf && (
        <span
          className="ml-auto text-[9px] tabular-nums text-amber-400/90 font-semibold"
          title={`Confidence this team fills this slot: ${(conf! * 100).toFixed(1)}%`}
        >
          {formatConfidence(conf!)}
        </span>
      )}
    </div>
  );
}


function MatchContextEditor() {
  useContextState();
  const [open, setOpen] = useState(false);
  const allTeams = useMemo(() => Object.keys(TEAMS).sort(), []);
  const allVenues = useMemo(() => {
    const set = new Set<string>();
    for (const m of ALL_MATCHES) if (m.venue) set.add(m.venue);
    return Array.from(set).sort();
  }, []);
  const [teamQuery, setTeamQuery] = useState("");
  const filteredTeams = useMemo(() => {
    const q = teamQuery.trim().toLowerCase();
    if (!q) return allTeams;
    return allTeams.filter((t) => t.toLowerCase().includes(q));
  }, [allTeams, teamQuery]);

  return (
    <div className="mb-4 rounded-md border border-border/60 bg-secondary/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[11px] font-semibold text-primary hover:bg-secondary/40 transition rounded-md"
      >
        <span className="inline-flex items-center gap-1">
          <Info className="w-3 h-3" />
          Match-context adjustments (sim only)
        </span>
        <span className="text-muted-foreground">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="p-3 pt-0 space-y-4 text-[11px]">
          <p className="text-muted-foreground">
            These tweak the per-match expected-goals inside the 10 000-run simulation only.
            They never touch stored Elo, Power Index, or group-table tiebreaks. Defaults are
            neutral — nothing changes until you fill values in. The simulation also adds a fresh
            ±25-Elo referee variance to every match every run (always on).
          </p>

          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] uppercase tracking-wide font-bold text-primary">Per-team</div>
              <input
                type="text"
                value={teamQuery}
                onChange={(e) => setTeamQuery(e.target.value)}
                placeholder="Filter teams…"
                className="h-7 w-40 rounded border border-border bg-background px-2 text-[11px]"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="text-left font-bold py-1 pr-2">Team</th>
                    <th className="text-right font-bold py-1 pr-2" title="Days since last match">Rest d</th>
                    <th className="text-right font-bold py-1 pr-2" title="km travelled to this venue since last match">Travel km</th>
                    <th className="text-center font-bold py-1 pr-2" title="Acclimatised to altitude">Alt-team</th>
                    <th className="text-center font-bold py-1 pr-2" title="Style relies on high pressing">High press</th>
                    <th className="text-right font-bold py-1" title="Elite players missing (0–3)">Stars out</th>
                  </tr>
                </thead>
                <tbody className="max-h-64">
                  {filteredTeams.map((team) => {
                    const ctx = getTeamContext(team);
                    const dirty =
                      ctx.restDays !== 0 || ctx.travelKm !== 0 ||
                      ctx.altitudeTeam || ctx.highPress || ctx.starsMissing !== 0;
                    return (
                      <tr key={team} className={`border-b border-border/30 ${dirty ? "bg-primary/5" : ""}`}>
                        <td className="py-1 pr-2 whitespace-nowrap">
                          <span className="mr-1">{TEAMS[team]?.flag ?? "🏳️"}</span>
                          {team}
                        </td>
                        <td className="py-1 pr-2 text-right">
                          <input
                            type="number"
                            value={ctx.restDays}
                            onChange={(e) => setTeamContext(team, { restDays: Number(e.target.value) || 0 })}
                            className="h-7 w-14 rounded border border-border bg-background px-1 text-right tabular-nums"
                          />
                        </td>
                        <td className="py-1 pr-2 text-right">
                          <input
                            type="number"
                            value={ctx.travelKm}
                            onChange={(e) => setTeamContext(team, { travelKm: Number(e.target.value) || 0 })}
                            className="h-7 w-20 rounded border border-border bg-background px-1 text-right tabular-nums"
                          />
                        </td>
                        <td className="py-1 pr-2 text-center">
                          <Switch
                            checked={ctx.altitudeTeam}
                            onCheckedChange={(v) => setTeamContext(team, { altitudeTeam: v })}
                          />
                        </td>
                        <td className="py-1 pr-2 text-center">
                          <Switch
                            checked={ctx.highPress}
                            onCheckedChange={(v) => setTeamContext(team, { highPress: v })}
                          />
                        </td>
                        <td className="py-1 text-right">
                          <input
                            type="number" min={0} max={3} step={1}
                            value={ctx.starsMissing}
                            onChange={(e) => {
                              const n = Math.max(0, Math.min(3, Math.round(Number(e.target.value) || 0)));
                              setTeamContext(team, { starsMissing: n });
                            }}
                            className="h-7 w-14 rounded border border-border bg-background px-1 text-right tabular-nums"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wide font-bold text-primary mb-1">Per-venue</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="text-left font-bold py-1 pr-2">Venue</th>
                    <th className="text-right font-bold py-1 pr-2" title="Altitude (m). Bites above 1500 m.">Altitude m</th>
                    <th className="text-center font-bold py-1" title="Harsh heat at kickoff">Harsh heat</th>
                  </tr>
                </thead>
                <tbody>
                  {allVenues.map((venue) => {
                    const v = getVenueContext(venue);
                    const dirty = v.altitude !== 0 || v.harshHeat;
                    return (
                      <tr key={venue} className={`border-b border-border/30 ${dirty ? "bg-primary/5" : ""}`}>
                        <td className="py-1 pr-2">{venue}</td>
                        <td className="py-1 pr-2 text-right">
                          <input
                            type="number"
                            value={v.altitude}
                            onChange={(e) => setVenueContext(venue, { altitude: Number(e.target.value) || 0 })}
                            className="h-7 w-20 rounded border border-border bg-background px-1 text-right tabular-nums"
                          />
                        </td>
                        <td className="py-1 text-center">
                          <Switch
                            checked={v.harshHeat}
                            onCheckedChange={(b) => setVenueContext(venue, { harshHeat: b })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { if (confirm("Reset all match-context values to neutral?")) resetAllContext(); }}
            >
              Reset all to neutral
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- POWER INDEX ---------------- */




function useSimProbs(): { probs: Record<string, TeamSimProbs> | null; loading: boolean } {
  const app = useAppState();
  const live = useLiveState();
  const ctx = useContextState();
  const [probs, setProbs] = useState<Record<string, TeamSimProbs> | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      // Defer to next frame so React paints the loading state first.
      const id = (typeof requestIdleCallback === "function"
        ? requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 0))(() => {
        if (cancelled) return;
        const next = simulateTournament();
        if (cancelled) return;
        setProbs(next);
        setLoading(false);
      });
      void id;
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [app, live, ctx]);
  return { probs, loading };
}

function PowerIndexTab() {
  useAppState();
  useLiveState();
  const rows = useMemo(
    () => [...computeTeamPower()].sort((a, b) => b.liveElo - a.liveElo || b.powerIndex - a.powerIndex),
    [getState(), useLiveState()], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showMethod, setShowMethod] = useState(false);
  const { probs: simProbs, loading: simLoading } = useSimProbs();

  return (
    <TooltipProvider delayDuration={150}>
      <Card className="p-5 bg-card border-border">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold">Power Index</h2>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label="What is the Power Index?" className="text-muted-foreground hover:text-foreground transition">
                <Info className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[280px] text-center">
              A live strength rating. Each team starts from its FIFA ranking and rises or falls after every match based on the result, the goal margin, and how strong the opponent was.
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="text-xs text-muted-foreground">
          Live Elo seeded from FIFA rank (11 Jun 2026), replayed from every played match.
        </p>
        <p className="text-[11px] text-muted-foreground italic">
          Adv % and Title % from a 10 000-run Elo-driven Monte Carlo simulation. Updates after every result.{simLoading ? " · simulating…" : ""}
        </p>
        <button
          type="button"
          onClick={() => setShowMethod((v) => !v)}
          className="mt-2 mb-4 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
        >
          <Info className="w-3 h-3" />
          {showMethod ? "Hide odds methodology" : "Show odds methodology"}
          <span className="text-muted-foreground">{showMethod ? "▾" : "▸"}</span>
        </button>
        {showMethod && (
          <div className="mb-4 rounded-md border border-border/60 bg-secondary/30 p-3 text-[11px] leading-relaxed space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide font-bold text-primary mb-1">Goal model (Poisson)</div>
              <p className="text-muted-foreground">
                For each simulated match we turn the Elo gap into an expected-goals (xG) pair, then sample independent Poisson scorelines:
              </p>
              <pre className="mt-1 text-[10px] font-mono bg-background/60 rounded p-2 overflow-x-auto whitespace-pre">{`supremacy = (eloA − eloB + hostAdjDiff) / 200
λA = max(0.2, 1.35 + supremacy/2)
λB = max(0.2, 1.35 − supremacy/2)
goalsA = Poisson(λA);  goalsB = Poisson(λB)`}</pre>
              <p className="text-muted-foreground mt-1">
                1.35 is the baseline goals-per-team for an even matchup; the floor of 0.2 keeps every team a live underdog.
              </p>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wide font-bold text-primary mb-1">Host adjustment (hostAdj)</div>
              <p className="text-muted-foreground">
                Tournament hosts <span className="font-semibold text-foreground">United States, Canada, and Mexico</span> get a fixed <span className="font-semibold text-foreground">+80 Elo</span> bonus that is applied <em>only</em> inside a match's expected-score calculation, never to the stored Elo. If both sides are hosts, the bonuses cancel; if neither is, it's zero. Same rule used by the live Elo updater.
              </p>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wide font-bold text-primary mb-1">Tie-break logic</div>
              <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                <li>
                  <span className="text-foreground font-semibold">Group tables:</span> points → goal difference → goals for → higher live Elo. Top 2 from each group qualify directly.
                </li>
                <li>
                  <span className="text-foreground font-semibold">Best-third ranking:</span> the 12 third-place teams are sorted by points → GD → GF → Elo, and the top 8 advance. They're slotted into the FIFA bracket's b3 clusters using the same greedy "first eligible third in cluster" rule the bracket page uses.
                </li>
                <li>
                  <span className="text-foreground font-semibold">Knockout level after 90/extra-time:</span> a shootout is decided by an Elo-weighted coin flip:
                  <pre className="mt-1 text-[10px] font-mono bg-background/60 rounded p-2 overflow-x-auto whitespace-pre">{`P(A wins) = 1 / (1 + 10^((eloB − eloA − hostAdj)/400))`}</pre>
                </li>
                <li>
                  <span className="text-foreground font-semibold">Already-played matches:</span> real scorelines override the sim. Played knockouts whose slots are filled lock the winner in every run.
                </li>
              </ul>
            </div>

            <p className="text-[10px] text-muted-foreground/80">
              Elo is held fixed at its current live value across all 10 000 runs — the simulation answers "given today's strengths, what's likely to happen?" rather than projecting future Elo movements.
            </p>
          </div>
        )}



        <MatchContextEditor />

        <PredictionBoard />

        <BettingPanel />


        <div className="overflow-x-auto -mx-5 px-5">
          <table className="text-sm table-fixed" style={{ width: "100%", minWidth: 760 }}>
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                <th className="py-2" style={{ width: 32 }}></th>
                <th className="text-left font-bold py-2 pr-2" style={{ width: 40 }}>#</th>
                <th className="text-left font-bold py-2 pr-2" style={{ width: 200 }}>Team</th>
                <th className="w-16 text-right font-bold py-2 pr-2">Elo</th>
                <th className="w-16 text-right font-bold py-2 pr-2">Power</th>
                <th className="w-12 text-right font-bold py-2 pr-2">GP</th>
                <th className="w-16 text-right font-bold py-2 pr-2">W-D-L</th>
                <th className="w-20 text-right font-bold py-2 pr-2">GF-GA</th>
                <th className="w-16 text-right font-bold py-2 pr-2" title="Simulated chance of qualifying from the group (top 2 or best third)">Adv %</th>
                <th className="w-24 text-right font-bold py-2" title="Simulated chance of winning the tournament">Title %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const eliminated = isTeamEliminated(r.team);
                const isOpen = !!expanded[r.team];
                const hasBreakdown = r.breakdown.length > 0;
                const sim = simProbs?.[r.team];
                const advPct = eliminated ? null : sim ? sim.qualify : null;
                const titlePct = eliminated ? null : sim ? sim.win : null;
                const t = TEAMS[r.team];
                const owner = teamOwner(r.team);
                const teamColor = t?.teamColor ?? "#94a3b8";
                const fmtPct = (p: number) => {
                  if (p >= 0.995) return "99%";
                  if (p >= 0.1) return `${(p * 100).toFixed(0)}%`;
                  if (p >= 0.01) return `${(p * 100).toFixed(1)}%`;
                  if (p > 0) return "<1%";
                  return "0%";
                };
                // Adv %: green saturation/lightness scales with probability
                const advColor = advPct === null
                  ? undefined
                  : `hsl(142 ${Math.round(advPct * 70)}% ${Math.round(75 - advPct * 30)}%)`;
                return (
                  <Fragment key={r.team}>
                    <tr
                      className={`team-row border-b border-border/40 ${eliminated ? "opacity-50" : ""}`}
                      style={{ ["--team-color" as string]: teamColor }}
                      onClick={() => hasBreakdown && setExpanded((p) => ({ ...p, [r.team]: !p[r.team] }))}
                    >
                      <td className="relative py-2 text-center text-muted-foreground">
                        {hasBreakdown ? (isOpen ? "▾" : "▸") : ""}
                      </td>
                      <td className="py-2 pr-2 pl-3 tabular-nums font-bold text-muted-foreground">{i + 1}</td>
                      <td className="py-2 pr-2">
                        <Link
                          to="/team/$team"
                          params={{ team: r.team }}
                          className="inline-flex items-center gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-sm leading-none opacity-60">{t?.flag ?? "🏳️"}</span>
                          <span className="team-name font-semibold">{r.team}</span>
                          {owner && <span className="text-xs text-muted-foreground/70">· {owner}</span>}
                        </Link>
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums font-semibold text-foreground/90">{Math.round(r.liveElo)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">{r.powerIndex.toFixed(1)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{r.played}</td>
                      <td className="py-2 pr-2 text-right tabular-nums whitespace-nowrap">{r.wins}-{r.draws}-{r.losses}</td>
                      <td className="py-2 pr-2 text-right tabular-nums whitespace-nowrap">{r.goalsFor}-{r.goalsAgainst}</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-sm font-bold" style={advColor ? { color: advColor } : undefined}>
                        {eliminated ? <span className="text-destructive">OUT</span>
                          : advPct === null ? <span className="text-muted-foreground">—</span>
                          : fmtPct(advPct)}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums text-xs">
                        {eliminated ? <span className="text-destructive">—</span>
                          : titlePct === null ? <span className="text-muted-foreground">—</span>
                          : (
                            <div className="relative inline-block w-20 h-5 rounded-sm overflow-hidden bg-white/[0.04] border border-white/5">
                              <div
                                className="absolute inset-y-0 left-0 transition-all"
                                style={{
                                  width: `${Math.max(2, titlePct * 100)}%`,
                                  background: "linear-gradient(90deg, #b8860b, #f5c542)",
                                  boxShadow: titlePct > 0.05 ? "0 0 6px rgba(245,197,66,0.4)" : undefined,
                                }}
                              />
                              <span className="relative z-10 inline-flex items-center justify-end w-full h-full pr-1.5 font-bold text-foreground mix-blend-luminosity">
                                {fmtPct(titlePct)}
                              </span>
                            </div>
                          )}
                      </td>
                    </tr>

                    {isOpen && hasBreakdown && (
                      <tr className="border-b border-border/40 bg-muted/20">
                        <td></td>
                        <td colSpan={9} className="py-3 pr-2">
                          <div className="overflow-x-auto">

                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                  <th className="text-left font-bold py-1 pr-2">Date</th>
                                  <th className="text-left font-bold py-1 pr-2">Opponent</th>
                                  <th className="text-left font-bold py-1 pr-2">Stage</th>
                                  <th className="text-right font-bold py-1 pr-2">Score</th>
                                  <th className="text-right font-bold py-1 pr-2">Result pts</th>
                                  <th className="text-right font-bold py-1 pr-2">Goal bonus</th>
                                  <th className="text-right font-bold py-1 pr-2">Difficulty</th>
                                  <th className="text-right font-bold py-1 pr-2">Upset bonus</th>
                                  <th className="text-right font-bold py-1 pr-2">Stage ×</th>
                                  <th className="text-right font-bold py-1">Match score</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.breakdown.map((b, idx) => (
                                  <tr key={idx} className="border-t border-border/30">
                                    <td className="py-1 pr-2 text-muted-foreground whitespace-nowrap">{new Date(b.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</td>
                                    <td className="py-1 pr-2"><TeamChip team={b.opponent} /></td>
                                    <td className="py-1 pr-2 text-muted-foreground">{b.stage}</td>
                                    <td className="py-1 pr-2 text-right tabular-nums whitespace-nowrap">{b.gf}-{b.ga}</td>
                                    <td className="py-1 pr-2 text-right tabular-nums">{b.resultPoints}</td>
                                    <td className="py-1 pr-2 text-right tabular-nums">{b.goalBonus >= 0 ? "+" : ""}{b.goalBonus.toFixed(2)}</td>
                                    <td className="py-1 pr-2 text-right tabular-nums">{b.difficulty.toFixed(2)}</td>
                                    <td className="py-1 pr-2 text-right tabular-nums">{b.upsetBonus >= 0 ? "+" : ""}{b.upsetBonus.toFixed(2)}</td>
                                    <td className="py-1 pr-2 text-right tabular-nums">{b.stageFactor.toFixed(2)}</td>
                                    <td className="py-1 text-right tabular-nums font-bold">{b.matchScore.toFixed(2)}</td>
                                  </tr>
                                ))}
                                <tr className="border-t border-border/60">
                                  <td colSpan={9} className="py-1 pr-2 text-right text-muted-foreground uppercase text-[10px] tracking-wide font-bold">Total Power Index</td>
                                  <td className="py-1 text-right tabular-nums font-black text-primary">{r.powerIndex.toFixed(1)}</td>
                                </tr>

                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </TooltipProvider>
  );
}

