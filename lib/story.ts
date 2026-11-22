/**
 * The story spine.
 *
 * One ordered list of chapters drives everything: the floating nav, the scroll
 * mapping, the WebGL background's mood, and which panel is on screen. Anything
 * that needs to know "where are we" reads from here, so the nav, the shader and
 * the content can never disagree about the current chapter.
 */

export type ChapterId =
  | 'overview'
  | 'panel'
  | 'survival'
  | 'models'
  | 'brands'
  | 'impact';

export interface Chapter {
  id: ChapterId;
  /** Nav label — short, one word where possible. */
  label: string;
  /** Big display headline for the section. */
  headline: string;
  /** One-line subhead under the headline. */
  sub: string;
  /** Accent that the whole scene tints toward while this chapter is active. */
  accent: string;
  /** Secondary accent for gradients. */
  accent2: string;
  /** Relative scroll weight — how long this chapter holds. */
  weight: number;
}

export const CHAPTERS: Chapter[] = [
  {
    id: 'overview',
    label: 'Overview',
    headline: 'How long does it actually last?',
    sub: 'Survival analysis on budget consumer hardware, updating live.',
    accent: '#00c2d1',
    accent2: '#7c5cff',
    weight: 1.0,
  },
  {
    id: 'panel',
    label: 'Panel',
    headline: 'The panel',
    sub: 'Every response, every category, every hour of exposure on record.',
    accent: '#7c5cff',
    accent2: '#00c2d1',
    weight: 1.15,
  },
  {
    id: 'survival',
    label: 'Survival',
    headline: 'Survival',
    sub: 'Kaplan–Meier estimates, stepped at each observed failure.',
    accent: '#00c2d1',
    accent2: '#22d07a',
    weight: 1.35,
  },
  {
    id: 'models',
    label: 'Models',
    headline: 'Can we predict it?',
    sub: 'Cox proportional hazards against a random survival forest.',
    accent: '#ffb020',
    accent2: '#7c5cff',
    weight: 1.2,
  },
  {
    id: 'brands',
    label: 'Brands',
    headline: 'Does the badge matter?',
    sub: 'Failure rate by brand, and whether paying for a name buys anything.',
    accent: '#ff4fa3',
    accent2: '#ffb020',
    weight: 1.25,
  },
  {
    id: 'impact',
    label: 'Impact',
    headline: 'What it costs',
    sub: 'Replacement mass, and what a longer service life would avert.',
    accent: '#22d07a',
    accent2: '#00c2d1',
    weight: 1.05,
  },
];

/** Fraction of scroll spent moving between chapters rather than resting in one. */
const TRANSIT_SHARE = 0.34;

interface Band {
  s0: number;
  s1: number;
  index: number;
  transit: boolean;
}

function buildBands(): Band[] {
  const total = CHAPTERS.reduce((a, c) => a + c.weight, 0);
  const restTotal = 1 - TRANSIT_SHARE;
  const legs = Math.max(1, CHAPTERS.length - 1);
  const legSpan = TRANSIT_SHARE / legs;

  const bands: Band[] = [];
  let s = 0;
  CHAPTERS.forEach((c, i) => {
    const span = (c.weight / total) * restTotal;
    bands.push({ s0: s, s1: s + span, index: i, transit: false });
    s += span;
    if (i < CHAPTERS.length - 1) {
      bands.push({ s0: s, s1: s + legSpan, index: i, transit: true });
      s += legSpan;
    }
  });
  if (bands.length) bands[bands.length - 1].s1 = 1;
  return bands;
}

export const BANDS = buildBands();

/** Smootherstep — zero first and second derivative at both ends. */
function ease(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export interface StoryState {
  /** Chapter being rested in, or null mid-transition. */
  restingAt: number | null;
  /** Chapter being approached (or rested in). */
  index: number;
  /** Chapter we are leaving, during a transition. */
  from: number;
  /** 0-1 across the current transition; 1 while resting. */
  progress: number;
  /** 0 at rest, peaking at 1 mid-transition. Drives motion intensity. */
  velocity: number;
  /** Continuous position along the chapter list, for interpolation. */
  t: number;
}

export function scrollToStory(scroll: number): StoryState {
  const s = Math.min(1, Math.max(0, scroll));
  const last = BANDS[BANDS.length - 1];

  for (const band of BANDS) {
    if (s > band.s1 && band !== last) continue;
    const span = band.s1 - band.s0;
    const local = span <= 0 ? 1 : (s - band.s0) / span;

    if (!band.transit) {
      return {
        restingAt: band.index,
        index: band.index,
        from: band.index,
        progress: 1,
        velocity: 0,
        t: band.index,
      };
    }
    const e = ease(local);
    return {
      restingAt: null,
      index: Math.min(band.index + 1, CHAPTERS.length - 1),
      from: band.index,
      progress: local,
      // Peaks mid-leg — the same shape the shader and the panels use.
      velocity: Math.sin(local * Math.PI),
      t: band.index + e,
    };
  }
  const i = CHAPTERS.length - 1;
  return { restingAt: i, index: i, from: i, progress: 1, velocity: 0, t: i };
}

/** Scroll position that centres a chapter's resting band. */
export function scrollForChapter(index: number): number {
  const b = BANDS.find((x) => !x.transit && x.index === index);
  return b ? (b.s0 + b.s1) / 2 : 0;
}

/** Total scroll height, in viewports. */
export const SCROLL_VIEWPORTS = 10;
