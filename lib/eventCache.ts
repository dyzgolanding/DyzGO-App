/**
 * eventCache — in-memory store for optimistic event data.
 * Set the full event object before navigating; event-detail reads it instantly.
 * Keyed by event ID. Auto-cleared after 30s to avoid stale memory.
 */

const cache = new Map<string, any>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const eventCache = {
  set(id: string, data: any) {
    if (timers.has(id)) clearTimeout(timers.get(id)!);
    cache.set(id, data);
    timers.set(id, setTimeout(() => { cache.delete(id); timers.delete(id); }, 30_000));
  },
  get(id: string): any | undefined {
    return cache.get(id);
  },
};
