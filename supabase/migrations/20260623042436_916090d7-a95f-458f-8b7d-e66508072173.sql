
CREATE TABLE public.betting_players (
  name TEXT PRIMARY KEY,
  balance NUMERIC NOT NULL DEFAULT 1000,
  best_win NUMERIC NOT NULL DEFAULT 0,
  is_guest BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.betting_players TO anon, authenticated;
GRANT ALL ON public.betting_players TO service_role;

ALTER TABLE public.betting_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view players"
  ON public.betting_players FOR SELECT
  USING (true);
CREATE POLICY "Anyone can add players"
  ON public.betting_players FOR INSERT
  WITH CHECK (true);
CREATE POLICY "Anyone can update players"
  ON public.betting_players FOR UPDATE
  USING (true) WITH CHECK (true);

CREATE TABLE public.bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name TEXT NOT NULL REFERENCES public.betting_players(name) ON DELETE CASCADE,
  fixture_id TEXT NOT NULL,
  bet_type TEXT NOT NULL CHECK (bet_type IN ('result','score')),
  selection TEXT NOT NULL,
  stake NUMERIC NOT NULL CHECK (stake >= 10),
  locked_odds NUMERIC NOT NULL CHECK (locked_odds > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','won','lost')),
  payout NUMERIC NOT NULL DEFAULT 0,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ
);

CREATE INDEX bets_fixture_idx ON public.bets(fixture_id);
CREATE INDEX bets_player_idx ON public.bets(player_name);
CREATE INDEX bets_status_idx ON public.bets(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bets TO anon, authenticated;
GRANT ALL ON public.bets TO service_role;

ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view bets"
  ON public.bets FOR SELECT
  USING (true);
CREATE POLICY "Anyone can place bets"
  ON public.bets FOR INSERT
  WITH CHECK (true);
CREATE POLICY "Anyone can settle bets"
  ON public.bets FOR UPDATE
  USING (true) WITH CHECK (true);

INSERT INTO public.betting_players (name, balance, is_guest) VALUES
  ('Jash', 1000, false),
  ('Ed', 1000, false),
  ('Xavier', 1000, false),
  ('Neil', 1000, false),
  ('Jess', 1000, false),
  ('Gigi', 1000, false),
  ('Landy', 1000, false),
  ('Bandy', 1000, false),
  ('Vic', 1000, false),
  ('Dana', 1000, false),
  ('Mikki', 1000, false),
  ('Violet', 1000, false)
ON CONFLICT (name) DO NOTHING;
