/** Bounded URL filters and complete pagination, with a deadline for the whole read.
 * Errors must not masquerade as successful empty analytics. */
export async function readCampaignRows<T>(
  keys: string[],
  query: (keys: string[], from: number, to: number, signal: AbortSignal) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
    count?: number | null;
  }>,
): Promise<T[]> {
  const unique = [...new Set(keys.filter(Boolean))];
  const rows: T[] = [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    for (let i = 0; i < unique.length; i += 50) {
      let total: number | null = null;
      for (let offset = 0; ;) {
        const { data, error, count } = await query(unique.slice(i, i + 50), offset, offset + 499, controller.signal);
        if (error) throw new Error(`Campaign data read failed: ${error.message}`);
        if (controller.signal.aborted) throw new Error("Campaign data read timed out");
        if (offset === 0) total = count ?? null;
        rows.push(...(data ?? []));
        if (!data?.length) break;
        offset += data.length;
        // The first page's count avoids an extra empty-page round trip, even
        // when PostgREST caps responses below the requested size. Without a
        // count, continue until empty instead of silently truncating.
        if (total !== null && offset >= total) break;
      }
    }
    return rows;
  } finally {
    clearTimeout(timeout);
  }
}
