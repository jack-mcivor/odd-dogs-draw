import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ALL_MATCHES, GROUP_MATCHES, PLAYERS, TEAMS, teamOwner, type Match, type Pot } from "@/lib/wc-data";
import { effectiveTeams, pointsForMatch, pointsForMatchLive, useAppState, getState } from "@/lib/wc-store";
import { useLiveMatch } from "@/lib/wc-live";

interface MatchDetailContextValue {
  open: (matchId: string) => void;
}

const MatchDetailContext = createContext<MatchDetailContextValue | null>(null);

export function useMatchDetail(): MatchDetailContextValue {
  return useContext(MatchDetailContext) ?? { open: () => {} };
}

export function MatchDetailProvider({ children }: { children: ReactNode }) {
  const [matchId, setMatchId] = useState<string | null>(null);
  return (
    <MatchDetailContext.Provider value={{ open: setMatchId }}>
      {children}
      <MatchDetailModal matchId={matchId} onClose={() => setMatchId(null)} />
    </MatchDetailContext.Provider>
  );
}

function PotBadge({ pot }: { pot: Pot }) {
  const cls = pot === 3
    ? "bg-[var(--pot3)] text-[#1a1100]"
    : pot === 4 ? "bg-[var(--pot4)] text-white"
    : pot === 1 ? "bg-[var(--pot1)] text-white"
    : "bg-[var(--pot2)] text-white";
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>Pot {pot}</span>;
}

function MatchDetailModal({ matchId, onClose }: { matchId: string | null; onClose: () => void }) {
  useAppState();
  const live = useLiveMatch(matchId ?? "");
  // Force re-render every 30s while LIVE (no extra fetch)
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!live || live.liveStatus !== "LIVE") return;
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [live]);

  const match = matchId ? ALL_MATCHES.find((m) => m.id === matchId) : undefined;
  if (!match) {
    return <Dialog open={false} onOpenChange={onClose}><DialogContent /></Dialog>;
  }
  const e = effectiveTeams(match);
  const stored = getState().scores[match.id];

  const finishedScore = live?.liveStatus === "FINISHED"
    ? { home: live.liveScoreHome, away: live.liveScoreAway }
    : stored?.played ? { home: stored.home, away: stored.away } : undefined;
  const liveScore = live?.liveStatus === "LIVE"
    ? { home: live.liveScoreHome, away: live.liveScoreAway }
    : undefined;
  const score = finishedScore ?? liveScore;
  const isLive = live?.liveStatus === "LIVE";
  const isFinished = !!finishedScore;

  const stageLabel = match.stage === "group"
    ? `Group ${match.group}`
    : ({ R32: "Round of 32", R16: "Round of 16", QF: "Quarter-finals", SF: "Semi-finals", "3rd": "Third-place play-off", Final: "Final" } as Record<string, string>)[match.stage] ?? match.stage;

  const homeFlag = TEAMS[e.home]?.flag ?? "🏳️";
  const awayFlag = TEAMS[e.away]?.flag ?? "🏳️";

  const dateObj = new Date(match.date);
  const dateText = dateObj.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeText = dateObj.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const locationText = [match.venue, match.city].filter(Boolean).join(", ");

  const homeScorers = live?.homeScorers ?? [];
  const awayScorers = live?.awayScorers ?? [];
  const hasScorers = homeScorers.length > 0 || awayScorers.length > 0;

  // Sweepstakes players in this match
  const points = isFinished ? pointsForMatch(match) : isLive ? pointsForMatchLive(match) : [];
  const wildcards = getState().wildcards;
  const playersInMatch = [e.home, e.away]
    .filter(Boolean)
    .map((team) => {
      const owner = teamOwner(team);
      if (!owner) return null;
      const teamData = TEAMS[team];
      const pts = points.find((p) => p.team === team);
      const used = wildcards[owner] ?? [];
      const hasWC = used.some((u) => u.matchId === match.id && teamData && u.pot === teamData.pot);
      return { team, owner, pot: teamData?.pot, pts, hasWC };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  return (
    <Dialog open={!!matchId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogTitle className="sr-only">Match details</DialogTitle>
        <div className="space-y-4">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">{stageLabel}</div>
            <div className="flex items-center justify-center gap-3 text-lg font-bold">
              <span>{homeFlag} {e.home || "TBD"}</span>
              <span className="text-muted-foreground text-sm">vs</span>
              <span>{awayFlag} {e.away || "TBD"}</span>
            </div>
            <div>
              {isLive && (
                <span className="inline-flex items-center gap-1 rounded bg-red-500 text-white px-2 py-0.5 font-black text-xs animate-pulse">
                  ● LIVE{live?.timeElapsed === "HT" ? " HT" : /^\d+(\+\d+)?$/.test(live?.timeElapsed ?? "") ? ` ${live!.timeElapsed}'` : ""}
                </span>
              )}
              {isFinished && !isLive && (
                <span className="inline-flex items-center rounded bg-emerald-500/15 text-emerald-400 px-2 py-0.5 font-bold text-xs">FULL TIME</span>
              )}
              {!isFinished && !isLive && (
                <span className="inline-flex items-center rounded bg-secondary text-muted-foreground px-2 py-0.5 font-bold text-xs">UPCOMING</span>
              )}
            </div>
          </div>

          {/* Score */}
          {score && (
            <div className="flex items-center justify-center gap-4 py-2">
              <div className="text-4xl font-black tabular-nums">{score.home}</div>
              <div className="text-2xl text-muted-foreground">–</div>
              <div className="text-4xl font-black tabular-nums">{score.away}</div>
              {isLive && live?.timeElapsed && live.timeElapsed !== "finished" && (
                <span className="ml-2 text-sm text-muted-foreground">
                  {live.timeElapsed === "HT" ? "Half Time" : `${live.timeElapsed}'`}
                </span>
              )}
            </div>
          )}

          {/* Goal scorers */}
          {hasScorers && (
            <div className="grid grid-cols-2 gap-3 text-xs border-t border-border pt-3">
              <div>
                <div className="font-bold mb-1">{homeFlag} Goals</div>
                {homeScorers.length === 0 ? (
                  <div className="text-muted-foreground">—</div>
                ) : (
                  <ul className="space-y-0.5">
                    {homeScorers.map((s, i) => <li key={i}>⚽ {s}</li>)}
                  </ul>
                )}
              </div>
              <div>
                <div className="font-bold mb-1">{awayFlag} Goals</div>
                {awayScorers.length === 0 ? (
                  <div className="text-muted-foreground">—</div>
                ) : (
                  <ul className="space-y-0.5">
                    {awayScorers.map((s, i) => <li key={i}>⚽ {s}</li>)}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Match info */}
          <div className="space-y-1 text-sm border-t border-border pt-3">
            <div><span className="text-muted-foreground">Date:</span> {dateText}</div>
            <div><span className="text-muted-foreground">Kickoff:</span> {timeText}</div>
            <div><span className="text-muted-foreground">Location:</span> {locationText}</div>
          </div>

          {/* Sweepstakes */}
          {playersInMatch.length > 0 && (
            <div className="border-t border-border pt-3 space-y-2">
              <div className="text-sm font-bold">Players in this match</div>
              {playersInMatch.map((p) => (
                <div key={p.team} className="rounded-md bg-secondary/40 px-3 py-2 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{p.owner}</span>
                      <span className="text-muted-foreground">·</span>
                      <span>{TEAMS[p.team]?.flag} {p.team}</span>
                      {p.pot && <PotBadge pot={p.pot} />}
                      {p.hasWC && <span className="rounded bg-amber-400/20 text-amber-400 px-1.5 py-0.5 font-bold">⚡ WC</span>}
                    </div>
                    {p.pts && (
                      <span className={`font-black tabular-nums ${isLive ? "italic text-amber-400" : "text-primary"}`}>
                        {isLive ? "~" : "+"}{p.pts.total}
                      </span>
                    )}
                  </div>
                  {p.pts && (
                    <div className="text-[10px] text-muted-foreground">
                      Win {p.pts.winPts} · Goals {p.pts.goalPts}
                      {p.pts.wildcardBonus ? ` · WC +${p.pts.wildcardBonus}` : ""}
                      {isLive && " (projected)"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Silence unused import warnings — these may be referenced via tree-shaking.
void GROUP_MATCHES; void PLAYERS;
