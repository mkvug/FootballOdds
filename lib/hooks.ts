"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { POLL } from "./config";
import { gameInterval, withBackoff } from "./polling";
import { fetchGame, fetchGames } from "./transport";
import type { GameDetail, GamesResponse, League, ProbabilityPoint } from "./providers/types";

/** Whole-second clock. Null on the server so time-dependent text can't mismatch on hydration. */
export function useNow(): number | null {
  return useSyncExternalStore(
    (notify) => {
      const id = setInterval(notify, 1000);
      return () => clearInterval(id);
    },
    () => Math.floor(Date.now() / 1000) * 1000,
    () => null,
  );
}

export function useGames() {
  const failures = useRef(0);
  return useQuery<GamesResponse>({
    queryKey: ["games"],
    queryFn: async ({ signal }) => {
      try {
        const body = await fetchGames(signal);
        failures.current = 0;
        return body;
      } catch (err) {
        failures.current += 1;
        throw err;
      }
    },
    refetchInterval: () => withBackoff(POLL.listMs, failures.current),
    retry: false,
  });
}

function mergeHistory(prev: ProbabilityPoint[], next: ProbabilityPoint[]): ProbabilityPoint[] {
  if (next.length === 0) return prev;
  const bySeq = new Map(prev.map((p) => [p.seq, p]));
  for (const p of next) bySeq.set(p.seq, p);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

export function useGame(league: League, eventId: string, initial?: GameDetail) {
  const qc = useQueryClient();
  const failures = useRef(0);
  const key = ["game", league, eventId] as const;

  return useQuery<GameDetail>({
    queryKey: key,
    initialData: initial,
    initialDataUpdatedAt: initial ? Date.parse(initial.fetchedAt) : undefined,
    queryFn: async ({ signal }) => {
      const prev = qc.getQueryData<GameDetail>(key);
      const since = prev?.history.at(-1)?.seq ?? -1;
      try {
        const next = await fetchGame(league, eventId, since, signal);
        failures.current = 0;
        return { ...next, history: mergeHistory(prev?.history ?? [], next.history) };
      } catch (err) {
        failures.current += 1;
        throw err;
      }
    },
    refetchInterval: (query) => gameInterval(query.state.data, failures.current, Date.now()),
    retry: false,
  });
}

/**
 * Delivers `value` after it has been stable, but no more than once per `ms`.
 * Used so screen-reader announcements can't flood (spec N4).
 */
export function useThrottled<T>(value: T, ms: number): T {
  const [out, setOut] = useState(value);
  const lastAt = useRef(0);
  useEffect(() => {
    const wait = Math.max(0, lastAt.current + ms - Date.now());
    const id = setTimeout(() => {
      lastAt.current = Date.now();
      setOut(value);
    }, wait);
    return () => clearTimeout(id);
  }, [value, ms]);
  return out;
}

/** True after `ms` without pointer or key activity. */
export function useIdle(ms: number): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let timer = setTimeout(() => setIdle(true), ms);
    const wake = () => {
      clearTimeout(timer);
      setIdle(false);
      timer = setTimeout(() => setIdle(true), ms);
    };
    const events = ["mousemove", "mousedown", "keydown", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, wake));
    };
  }, [ms]);
  return idle;
}
