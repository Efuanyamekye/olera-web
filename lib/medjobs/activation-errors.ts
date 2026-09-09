/**
 * Turning a database error into something the person looking at the screen
 * can act on.
 *
 * The activation tables ship in a migration. Until it is applied every read
 * comes back empty and every write fails, and the two look nothing alike
 * from the outside: the workspace renders a confident "5 not yet" and then
 * refuses to tick a box. Naming that case is most of the value here.
 */

interface PgLike {
  code?: string;
  message?: string;
  details?: string;
}

/** Postgres and PostgREST codes for "that table is not there". */
const MISSING_TABLE = new Set(["42P01", "PGRST205", "PGRST202"]);

export function isMissingTable(err: unknown): boolean {
  const e = err as PgLike | null;
  if (!e) return false;
  if (e.code && MISSING_TABLE.has(e.code)) return true;
  return /does not exist|schema cache/i.test(e.message ?? "");
}

export const MIGRATION_HINT =
  "The University Activation tables are not in this database yet. " +
  "Apply migration 219_university_activation.sql, then reload.";

/**
 * A message for an admin surface. These routes are already behind the admin
 * guard, so the underlying error is worth showing rather than hiding: a
 * database message is what makes this diagnosable at all.
 */
export function activationError(err: unknown, doing: string): string {
  if (isMissingTable(err)) return MIGRATION_HINT;
  const e = err as PgLike | null;
  const detail = e?.message?.trim();
  return detail ? `Could not ${doing}: ${detail}` : `Could not ${doing}.`;
}
