'use client';

import { createContext, useContext } from 'react';

/**
 * Whether the panel a component sits in is the one currently arrived at.
 *
 * Needed because the arrival panels stay mounted and are hidden with
 * `visibility: hidden`, which IntersectionObserver still counts as
 * intersecting. So `useInView({ once: true })` fires for every panel the moment
 * the page loads: all six gauges sweep, all at once, invisibly — and by the
 * time you actually fly into a district its needle is already parked.
 *
 * Defaults to `true` so the stacked fallback layout (and any component used
 * outside the journey) animates on scroll as normal.
 */
const ArrivalContext = createContext(true);

export function ArrivalProvider({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return <ArrivalContext.Provider value={active}>{children}</ArrivalContext.Provider>;
}

/** True when this component's district is the one being viewed. */
export function useArrived(): boolean {
  return useContext(ArrivalContext);
}
