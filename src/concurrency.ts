/**
 * concurrency.ts
 * --------------
 * Lo swarm lancia molti agenti in parallelo, ma non vogliamo aprire N
 * richieste tutte insieme: si rischia di superare i rate limit dell'API.
 *
 * `mapWithConcurrency` esegue una funzione su una lista di elementi
 * mantenendo al massimo `limit` esecuzioni attive contemporaneamente, e
 * restituisce i risultati NELLO STESSO ORDINE degli input. E' un pool di
 * worker: ogni worker pesca il prossimo indice libero finche' non finiscono.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    // Ogni worker continua a pescare task finche' ce ne sono.
    for (;;) {
      const current = nextIndex++;
      if (current >= items.length) return;
      const item = items[current] as T;
      results[current] = await fn(item, current);
    }
  }

  const poolSize = Math.max(1, Math.min(limit, items.length));
  const pool = Array.from({ length: poolSize }, () => worker());
  await Promise.all(pool);
  return results;
}
