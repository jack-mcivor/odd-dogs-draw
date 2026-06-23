import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { nextUpcoming, useAppState, effectiveTeams } from "@/lib/wc-store";
import { computeTeamPower } from "@/lib/wc-power";
import { PLAYERS as OWNERS, TEAMS, ALL_MATCHES } from "@/lib/wc-data";
import {
  predictForFixture,
  MAX_GOALS,
} from "./PredictionBoard";
import {
  initBetting,
  usePlayers,
  useBets,
  useIdentity,
  ensurePlayer,
  placeBet,
  settleBet,
  priceToOdds,
  STARTING_BANKROLL,
  MIN_STAKE,
  type Bet,
} from "@/lib/wc-betting";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const RESULT_LABELS: Record<string, string> = {
  home: "Home win",
  draw: "Draw",
  away: "Away win",
};

function fmtCoins(n: number): string {
  return Math.round(n).toLocaleString();
}

// =========== Identity picker ===========
function IdentityPicker({ onPicked }: { onPicked: (name: string) => void }) {
  const players = usePlayers();
  const ownerNames = OWNERS.map((p) => p.name);
  const [guest, setGuest] = useState("");
  const [busy, setBusy] = useState(false);

  async function pick(name: string, isGuest: boolean) {
    if (busy) return;
    setBusy(true);
    const ok = await ensurePlayer(name, isGuest);
    setBusy(false);
    if (ok) onPicked(name.trim());
    else toast.error("Couldn't register that name");
  }

  return (
    <div className="rounded-lg border border-cyan-300/15 bg-slate-950/60 p-4">
      <h4 className="text-sm font-bold text-cyan-100 mb-1">Who's playing?</h4>
      <p className="text-xs text-muted-foreground mb-3">
        Pick your name to claim your bankroll of {STARTING_BANKROLL} play coins.
      </p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {ownerNames.map((n) => {
          const exists = players.find((p) => p.name === n);
          return (
            <Button
              key={n}
              size="sm"
              variant="outline"
              onClick={() => pick(n, false)}
              disabled={busy}
              className="h-8 text-xs"
            >
              {n}
              {exists && exists.balance !== STARTING_BANKROLL && (
                <span className="ml-1.5 text-[10px] text-cyan-300">
                  {fmtCoins(exists.balance)}
                </span>
              )}
            </Button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Or add a guest name…"
          value={guest}
          onChange={(e) => setGuest(e.target.value)}
          className="h-8 text-xs"
          maxLength={20}
        />
        <Button
          size="sm"
          onClick={() => guest.trim() && pick(guest, true)}
          disabled={busy || !guest.trim()}
          className="h-8 text-xs"
        >
          + Add me
        </Button>
      </div>
    </div>
  );
}

// =========== Bet slip ===========
function BetSlip({
  fixtureId,
  home,
  away,
  homeProb,
  drawProb,
  awayProb,
  grid,
  playerName,
  balance,
  locked,
}: {
  fixtureId: string;
  home: string;
  away: string;
  homeProb: number;
  drawProb: number;
  awayProb: number;
  grid: number[][];
  playerName: string;
  balance: number;
  locked: boolean;
}) {
  const [resultPick, setResultPick] = useState<"home" | "draw" | "away" | "">("");
  const [stake, setStake] = useState(50);
  const [scoreH, setScoreH] = useState(1);
  const [scoreA, setScoreA] = useState(1);
  const [scoreStake, setScoreStake] = useState(20);
  const [busy, setBusy] = useState(false);

  const resultProb =
    resultPick === "home" ? homeProb : resultPick === "draw" ? drawProb : resultPick === "away" ? awayProb : 0;
  const resultOdds = resultPick ? priceToOdds(resultProb) : 0;
  const scoreProb = grid?.[scoreH]?.[scoreA] ?? 0;
  const scoreOdds = priceToOdds(scoreProb);

  async function submitResult() {
    if (!resultPick || busy) return;
    setBusy(true);
    const sel =
      resultPick === "home" ? home : resultPick === "draw" ? "draw" : away;
    const res = await placeBet({
      playerName,
      fixtureId,
      betType: "result",
      selection: resultPick,
      stake,
      lockedOdds: resultOdds,
    });
    setBusy(false);
    if (!res.ok) toast.error(res.error ?? "Bet failed");
    else toast.success(`Locked: ${stake} on ${sel} @ ${resultOdds.toFixed(2)}x`);
  }
  async function submitScore() {
    if (busy) return;
    setBusy(true);
    const sel = `${scoreH}-${scoreA}`;
    const res = await placeBet({
      playerName,
      fixtureId,
      betType: "score",
      selection: sel,
      stake: scoreStake,
      lockedOdds: scoreOdds,
    });
    setBusy(false);
    if (!res.ok) toast.error(res.error ?? "Bet failed");
    else toast.success(`Locked: ${scoreStake} on ${sel} @ ${scoreOdds.toFixed(2)}x`);
  }

  if (locked) {
    return (
      <div className="text-[11px] text-muted-foreground italic">
        🔒 Betting locked (kickoff reached).
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 text-xs">
      {/* Result */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-cyan-200/80 font-bold uppercase tracking-wide text-[10px] w-12">
          Result
        </span>
        <Select value={resultPick} onValueChange={(v) => setResultPick(v as "home" | "draw" | "away" | "")}>
          <SelectTrigger className="h-7 w-32 text-xs">
            <SelectValue placeholder="Pick…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="home">{home} ({priceToOdds(homeProb).toFixed(2)}x)</SelectItem>
            <SelectItem value="draw">Draw ({priceToOdds(drawProb).toFixed(2)}x)</SelectItem>
            <SelectItem value="away">{away} ({priceToOdds(awayProb).toFixed(2)}x)</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="number"
          min={MIN_STAKE}
          max={balance}
          value={stake}
          onChange={(e) => setStake(Number(e.target.value) || 0)}
          className="h-7 w-16 text-xs"
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={!resultPick || busy || stake < MIN_STAKE || stake > balance}
          onClick={submitResult}
          className="h-7 text-[11px] px-2"
        >
          Bet {resultOdds > 0 ? `→ ${fmtCoins(stake * resultOdds)}` : ""}
        </Button>
      </div>
      {/* Score */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-cyan-200/80 font-bold uppercase tracking-wide text-[10px] w-12">
          Score
        </span>
        <Select value={String(scoreH)} onValueChange={(v) => setScoreH(Number(v))}>
          <SelectTrigger className="h-7 w-12 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Array.from({ length: MAX_GOALS + 1 }, (_, i) => (
              <SelectItem key={i} value={String(i)}>{i}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-cyan-300/60">–</span>
        <Select value={String(scoreA)} onValueChange={(v) => setScoreA(Number(v))}>
          <SelectTrigger className="h-7 w-12 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Array.from({ length: MAX_GOALS + 1 }, (_, i) => (
              <SelectItem key={i} value={String(i)}>{i}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-[10px] text-cyan-300/80 font-mono">
          {scoreOdds.toFixed(2)}x
        </span>
        <Input
          type="number"
          min={MIN_STAKE}
          max={balance}
          value={scoreStake}
          onChange={(e) => setScoreStake(Number(e.target.value) || 0)}
          className="h-7 w-16 text-xs"
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || scoreStake < MIN_STAKE || scoreStake > balance}
          onClick={submitScore}
          className="h-7 text-[11px] px-2"
        >
          Bet → {fmtCoins(scoreStake * scoreOdds)}
        </Button>
      </div>
    </div>
  );
}

// =========== Auto-settlement ===========
function useAutoSettle(bets: Bet[]) {
  const state = useAppState();
  useEffect(() => {
    const pending = bets.filter((b) => b.status === "pending");
    if (pending.length === 0) return;
    for (const bet of pending) {
      const match = ALL_MATCHES.find((m) => m.id === bet.fixture_id);
      if (!match) continue;
      const score = state.scores[bet.fixture_id];
      if (!score || !score.played) continue;
      const { home, away } = effectiveTeams(match);
      if (!home || !away) continue;

      let won = false;
      if (bet.bet_type === "result") {
        const actual = score.home > score.away ? "home" : score.home === score.away ? "draw" : "away";
        won = bet.selection === actual;
      } else {
        won = bet.selection === `${score.home}-${score.away}`;
      }

      // Fire and forget — settleBet is race-safe via WHERE status='pending'
      settleBet(bet, won).then((res) => {
        if (!res.settled) return;
        const teamLabel =
          bet.bet_type === "result"
            ? bet.selection === "home" ? home : bet.selection === "away" ? away : "Draw"
            : `${bet.selection} (${home} v ${away})`;
        if (won) {
          toast.success(
            `✅ ${bet.player_name} won ${fmtCoins(res.payout)} on ${teamLabel}!`,
            { duration: 6000 },
          );
        } else {
          toast(`❌ ${bet.player_name} missed ${teamLabel}`, { duration: 4000 });
        }
      });
    }
  }, [bets, state.scores]);
}

// =========== Leaderboard ===========
function Leaderboard({ currentName }: { currentName: string | null }) {
  const players = usePlayers();
  const ranked = useMemo(
    () => [...players].sort((a, b) => b.balance - a.balance),
    [players],
  );
  if (ranked.length === 0) return null;
  return (
    <div className="rounded-lg border border-cyan-300/15 bg-slate-950/60 p-3">
      <h4 className="text-xs font-bold uppercase tracking-wide text-cyan-200/80 mb-2">
        🏅 Oracle Slayer Leaderboard
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="text-left font-semibold py-1">#</th>
              <th className="text-left font-semibold py-1">Name</th>
              <th className="text-right font-semibold py-1">Balance</th>
              <th className="text-right font-semibold py-1">Net</th>
              <th className="text-right font-semibold py-1">Best win</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((p, i) => {
              const net = p.balance - STARTING_BANKROLL;
              const isMe = p.name === currentName;
              return (
                <tr
                  key={p.name}
                  className={`border-t border-cyan-300/5 ${isMe ? "bg-cyan-400/10" : ""}`}
                >
                  <td className="py-1 font-mono">{i + 1}</td>
                  <td className="py-1 font-semibold">
                    {p.name}
                    {i === 0 && <span className="ml-1.5 text-[10px]">🏆 Oracle Slayer</span>}
                    {p.is_guest && <span className="ml-1.5 text-[10px] text-muted-foreground">(guest)</span>}
                  </td>
                  <td className="py-1 text-right font-mono tabular-nums">{fmtCoins(p.balance)}</td>
                  <td
                    className={`py-1 text-right font-mono tabular-nums ${
                      net > 0 ? "text-emerald-400" : net < 0 ? "text-rose-400" : "text-muted-foreground"
                    }`}
                  >
                    {net > 0 ? "+" : ""}{fmtCoins(net)}
                  </td>
                  <td className="py-1 text-right font-mono tabular-nums">{fmtCoins(p.best_win)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =========== Main panel ===========
export function BettingPanel() {
  useEffect(() => {
    initBetting();
  }, []);

  const [identity, setIdentityName] = useIdentity();
  const players = usePlayers();
  const me = identity ? players.find((p) => p.name === identity) ?? null : null;
  const bets = useBets();
  useAutoSettle(bets);

  useAppState(); // re-render on score changes
  const fixtures = nextUpcoming(3);

  const eloMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of computeTeamPower()) map[t.team] = t.liveElo;
    return map;
  }, [fixtures.map((f) => f.id).join(",")]);

  const now = Date.now();

  return (
    <div
      className="prediction-board relative my-4 rounded-xl border border-fuchsia-400/30 bg-gradient-to-br from-fuchsia-950/30 via-slate-950/70 to-cyan-950/30 p-4 overflow-hidden"
      style={{ contain: "layout paint" }}
    >
      <div className="relative flex items-center justify-between mb-3 flex-wrap gap-2 z-10">
        <h3 className="text-base font-bold text-fuchsia-100 tracking-wide">
          🎲 Beat the Oracle
        </h3>
        <div className="flex items-center gap-2">
          {me && (
            <span className="text-[11px] font-bold text-cyan-200 font-mono">
              {me.name}: {fmtCoins(me.balance)} coins
            </span>
          )}
          {identity && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[10px]"
              onClick={() => setIdentityName("")}
            >
              Switch
            </Button>
          )}
        </div>
      </div>

      {!identity || !me ? (
        <IdentityPicker onPicked={(n) => setIdentityName(n)} />
      ) : (
        <div className="relative z-10 flex flex-col gap-3">
          <div className="grid gap-3 lg:grid-cols-3">
            {fixtures.map((m) => {
              const { home, away } = effectiveTeams(m);
              if (!home || !away) return null;
              const p = predictForFixture(home, away, eloMap);
              const locked = new Date(m.date).getTime() <= now;
              const myBets = bets.filter(
                (b) => b.fixture_id === m.id && b.player_name === me.name,
              );
              return (
                <div
                  key={m.id}
                  className="rounded-lg border border-fuchsia-300/15 bg-slate-950/60 p-3 flex flex-col gap-2"
                >
                  <div className="text-[11px] font-bold text-fuchsia-200/90">
                    {TEAMS[home]?.flag} {home} vs {away} {TEAMS[away]?.flag}
                  </div>
                  <BetSlip
                    fixtureId={m.id}
                    home={home}
                    away={away}
                    homeProb={p.homeWin}
                    drawProb={p.draw}
                    awayProb={p.awayWin}
                    grid={p.grid}
                    playerName={me.name}
                    balance={me.balance}
                    locked={locked}
                  />
                  {myBets.length > 0 && (
                    <div className="border-t border-fuchsia-300/10 pt-1.5 mt-0.5 flex flex-col gap-0.5">
                      {myBets.map((b) => {
                        const label =
                          b.bet_type === "result"
                            ? b.selection === "home" ? home : b.selection === "away" ? away : "Draw"
                            : `${b.selection}`;
                        const tag =
                          b.status === "won" ? "✅" : b.status === "lost" ? "❌" : "⏳";
                        return (
                          <div key={b.id} className="text-[10px] font-mono text-muted-foreground flex justify-between gap-2">
                            <span>{tag} {b.bet_type === "score" ? "Score " : ""}{label} · {fmtCoins(b.stake)} @ {b.locked_odds.toFixed(2)}x</span>
                            <span className={b.status === "won" ? "text-emerald-400" : ""}>
                              {b.status === "won" ? `+${fmtCoins(b.payout)}` : b.status === "lost" ? "—" : ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Leaderboard currentName={me.name} />
        </div>
      )}

      <div className="relative z-10 mt-3 text-center text-[10px] uppercase tracking-widest text-fuchsia-300/70 font-bold">
        Play money only — just for fun, no real betting.
      </div>
    </div>
  );
}
