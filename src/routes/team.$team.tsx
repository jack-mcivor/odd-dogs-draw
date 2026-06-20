import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ALL_MATCHES, GROUP_MATCHES, GROUPS, TEAMS, teamGroup, teamOwner, type Match,
} from "@/lib/wc-data";
import {
  effectiveTeams, getState, isTeamEliminated, loadFromStorage, useAppState,
} from "@/lib/wc-store";
import { teamMatchProbabilities } from "@/lib/wc-probability";
import { fetchAndApply, initApi } from "@/lib/wc-api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trophy } from "lucide-react";

export const Route = createFileRoute("/team/$team")({
  head: ({ params }) => {
    const name = decodeURIComponent(params.team);
    return {
      meta: [
        { title: `${name} — Odd Dogs World Cup` },
        { name: "description", content: `Fixtures, results and stats for ${name} at the FIFA World Cup 2026.` },
        { property: "og:title", content: `${name} — Odd Dogs World Cup` },
        { property: "og:description", content: `Fixtures, results and stats for ${name} at the FIFA World Cup 2026.` },
      ],
    };
  },
  component: TeamPage,
});

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
  let month = "", day = "", hour = "", minute = "", dayPeriod = "";
  for (const p of parts) {
    if (p.type === "month") month = p.value;
    if (p.type === "day") day = p.value;
    if (p.type === "hour") hour = p.value;
    if (p.type === "minute") minute = p.value;
    if (p.type === "dayPeriod") dayPeriod = p.value.toLowerCase();
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

function TeamPage() {
  useAppState();
  const { team: rawTeam } = Route.useParams();
  const team = decodeURIComponent(rawTeam);

  useEffect(() => { loadFromStorage(); initApi(); }, []);

  const meta = TEAMS[team];
  if (!meta) {
    throw notFound();
  }
  const group = teamGroup(team);
  const owner = teamOwner(team);
  const elim = isTeamEliminated(team);

  // Find all matches involving this team (group or knockout)
  const matches = useMemo(() => {
    return ALL_MATCHES.filter((m) => {
      const e = effectiveTeams(m);
      return e.home === team || e.away === team;
    }).sort((a, b) => a.date.localeCompare(b.date));
  }, [team]);

  // Aggregate stats from played matches
  const stats = useMemo(() => {
    let p = 0, w = 0, d = 0, l = 0, gf = 0, ga = 0;
    for (const m of matches) {
      const s = getState().scores[m.id];
      if (!s?.played) continue;
      const e = effectiveTeams(m);
      const my = e.home === team ? s.home : s.away;
      const op = e.home === team ? s.away : s.home;
      p++; gf += my; ga += op;
      if (my > op) w++;
      else if (my === op) d++;
      else l++;
    }
    return { p, w, d, l, gf, ga, gd: gf - ga, pts: w * 3 + d };
  }, [matches, team]);

  const groupTeams = group ? GROUPS[group] : [];

  return (
    <div className="min-h-screen text-foreground">
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to="/">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          </Link>
          <Link to="/" className="flex items-center gap-2 min-w-0 hover:opacity-80 transition">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <Trophy className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold truncate hidden sm:inline">Odd Dogs</span>
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <Card className="p-5 bg-card border-border">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="text-5xl leading-none">{meta.flag}</div>
              <div>
                <h1 className="text-2xl md:text-3xl font-black">{team}</h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
                  <Badge variant="outline" className="border-primary/40 text-primary">Pot {meta.pot}</Badge>
                  {group && <Badge variant="outline">Group {group}</Badge>}
                  {owner && <Badge variant="outline">Owner: {owner}</Badge>}
                  {elim && <Badge className="bg-destructive/20 text-destructive border-destructive/40">Eliminated</Badge>}
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-card border-border">
          <h2 className="text-lg font-bold mb-3">Tournament stats</h2>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-center">
            <Stat label="Played" value={stats.p} />
            <Stat label="Won" value={stats.w} />
            <Stat label="Drawn" value={stats.d} />
            <Stat label="Lost" value={stats.l} />
            <Stat label="GF" value={stats.gf} />
            <Stat label="GA" value={stats.ga} />
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3 text-center">
            <Stat label="Goal difference" value={stats.gd >= 0 ? `+${stats.gd}` : stats.gd} accent />
            <Stat label="Points (3/1/0)" value={stats.pts} accent />
          </div>
        </Card>

        {group && (
          <Card className="p-5 bg-card border-border">
            <h2 className="text-lg font-bold mb-3">Group {group}</h2>
            <div className="space-y-1.5 text-sm">
              {groupTeams.map((t) => (
                <Link
                  key={t}
                  to="/team/$team"
                  params={{ team: t }}
                  className={`flex items-center gap-2 rounded px-2 py-1.5 transition ${t === team ? "bg-primary/15 ring-1 ring-primary/40" : "bg-secondary/40 hover:bg-secondary/70"}`}
                >
                  <span className="text-lg">{TEAMS[t].flag}</span>
                  <span className={t === team ? "font-bold" : ""}>{t}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">{teamOwner(t) ?? "—"}</span>
                </Link>
              ))}
            </div>
          </Card>
        )}

        <Card className="p-5 bg-card border-border">
          <h2 className="text-lg font-bold mb-3">Fixtures &amp; results</h2>
          {matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No fixtures yet.</p>
          ) : (
            <div className="space-y-2">
              {matches.map((m) => <TeamFixture key={m.id} match={m} team={team} />)}
            </div>
          )}
          <div className="text-right mt-3">
            <Button size="sm" variant="ghost" onClick={() => fetchAndApply()}>
              Refresh live data
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className={`rounded-md py-3 ${accent ? "bg-primary/15" : "bg-secondary/40"}`}>
      <div className={`text-2xl font-black tabular-nums ${accent ? "text-primary" : ""}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  );
}

function TeamFixture({ match, team }: { match: Match; team: string }) {
  const e = effectiveTeams(match);
  const s = getState().scores[match.id];
  const isHome = e.home === team;
  const opponent = isHome ? e.away : e.home;
  const oppMeta = opponent ? TEAMS[opponent] : undefined;
  const my = s ? (isHome ? s.home : s.away) : undefined;
  const op = s ? (isHome ? s.away : s.home) : undefined;
  const played = !!s?.played;
  const result = played
    ? (my! > op! ? "W" : my! === op! ? "D" : "L")
    : null;

  const stageLabel = match.stage === "group" ? `Group ${match.group}` : match.stage;

  return (
    <div className="rounded-md bg-secondary/40 px-3 py-2.5">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1 gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="border-primary/40 text-primary text-[10px]">{stageLabel}</Badge>
          <span><LocalTime iso={match.date} /></span>
          <span className="hidden sm:inline">· {match.venue}, {match.city}</span>
        </div>
        {result && (
          <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-black ${
            result === "W" ? "bg-emerald-500 text-white"
            : result === "D" ? "bg-amber-400 text-[#1a1100]"
            : "bg-destructive text-white"
          }`}>{result}</span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">
          {isHome ? "vs" : "@"}{" "}
          {opponent ? (
            <Link to="/team/$team" params={{ team: opponent }} className="inline-flex items-center gap-1.5 hover:text-primary transition">
              <span className="text-lg leading-none">{oppMeta?.flag ?? "🏳️"}</span>
              <span>{opponent}</span>
            </Link>
          ) : (
            <span className="italic text-muted-foreground">TBD</span>
          )}
        </div>
        <div className="text-base font-black tabular-nums">
          {played ? `${my}–${op}` : <span className="text-muted-foreground text-xs font-normal">Scheduled</span>}
        </div>
      </div>
      {!played && opponent && (() => {
        const wp = teamMatchProbabilities(team, e.home, e.away);
        if (!wp) return null;
        const fmt = (n: number) => `${Math.round(n * 100)}%`;
        return (
          <div className="mt-2 pt-2 border-t border-border/50">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              <span>Win probability</span>
              <span className="normal-case tracking-normal">Elo-xG model</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-secondary">
              <div className="bg-emerald-500" style={{ width: `${wp.win * 100}%` }} />
              <div className="bg-amber-400" style={{ width: `${wp.draw * 100}%` }} />
              <div className="bg-destructive" style={{ width: `${wp.loss * 100}%` }} />
            </div>
            <div className="flex justify-between text-[11px] mt-1 tabular-nums">
              <span className="text-emerald-500 font-semibold">Win {fmt(wp.win)}</span>
              <span className="text-amber-400 font-semibold">Draw {fmt(wp.draw)}</span>
              <span className="text-destructive font-semibold">Loss {fmt(wp.loss)}</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
