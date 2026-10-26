-- New enum values, in their own migration: a value added by ALTER TYPE cannot
-- be used in the transaction that adds it.

-- Booster sources: free daily themed booster, and the two shop formats
-- (bought with aces only, never real money).
alter type public.booster_source add value if not exists 'daily';
alter type public.booster_source add value if not exists 'box';
alter type public.booster_source add value if not exists 'qualifiers';

-- Ledger reasons. Credits must stay covered by the economy simulation
-- (tests/unit/economy-sources.test.ts reads these lines too).
alter type public.ledger_reason add value if not exists 'login_streak'; -- daily login reward (credit)
alter type public.ledger_reason add value if not exists 'grading';      -- grading fee (debit)
