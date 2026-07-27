import type Database from "better-sqlite3";
import type { TokenUsage } from "../providers/types.js";

// What produced the call: an examiner turn, or the end-of-sidang assessment.
export type UsageKind = "turn" | "assessment";

export interface UsageTotals {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  calls: number;
}

export interface UsageView {
  total: UsageTotals;
  by_kind: { kind: UsageKind; totals: UsageTotals }[];
  since: string | null;
}

const EMPTY: UsageTotals = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  cost_usd: 0,
  calls: 0,
};

const SUMS = `
  COALESCE(SUM(input_tokens), 0) AS input_tokens,
  COALESCE(SUM(output_tokens), 0) AS output_tokens,
  COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
  COALESCE(SUM(cache_write_tokens), 0) AS cache_write_tokens,
  COALESCE(SUM(cost_usd), 0) AS cost_usd,
  COUNT(*) AS calls
`;

/**
 * Records one provider call. Never throws: token accounting must not be able to
 * fail a sidang turn, so callers can fire this without a try/catch of their own.
 */
export function recordUsage(
  db: Database.Database,
  userId: number,
  at: string,
  provider: string,
  model: string,
  kind: UsageKind,
  usage: TokenUsage | undefined,
): void {
  if (!usage) return;
  try {
    db.prepare(
      `INSERT INTO usage_events
         (user_id, created_at, provider, model, kind, input_tokens, output_tokens,
          cache_read_tokens, cache_write_tokens, cost_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId,
      at,
      provider,
      model,
      kind,
      usage.input_tokens,
      usage.output_tokens,
      usage.cache_read_tokens,
      usage.cache_write_tokens,
      usage.cost_usd,
    );
  } catch (err) {
    console.error("[usage record failed]", (err as Error).message);
  }
}

export function getUsageView(db: Database.Database, userId: number): UsageView {
  const total =
    (db.prepare(`SELECT ${SUMS} FROM usage_events WHERE user_id = ?`).get(userId) as UsageTotals) ?? EMPTY;

  const rows = db
    .prepare(`SELECT kind, ${SUMS} FROM usage_events WHERE user_id = ? GROUP BY kind ORDER BY kind`)
    .all(userId) as (UsageTotals & { kind: UsageKind })[];

  const since = db
    .prepare("SELECT MIN(created_at) AS since FROM usage_events WHERE user_id = ?")
    .get(userId) as { since: string | null };

  return {
    total,
    by_kind: rows.map(({ kind, ...totals }) => ({ kind, totals })),
    since: since?.since ?? null,
  };
}

export function resetUsage(db: Database.Database, userId: number): void {
  db.prepare("DELETE FROM usage_events WHERE user_id = ?").run(userId);
}
