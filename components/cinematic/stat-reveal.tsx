'use client';

/**
 * Editorial stat reveal.
 *
 * The number counts up while the label is unmasked line by line. Two details
 * carry it:
 *
 *  - The counter is driven by GSAP on a plain object, not by React state. A
 *    setState per frame would re-render the tree sixty times a second to change
 *    one text node; writing textContent directly costs nothing.
 *  - The mask is a clip-path wipe on the 'editorial' CustomEase — the brief's
 *    M0,0 C0.7,0 0.3,1 1,1 — which is slow at both ends and fast through the
 *    middle. That is what makes type feel unveiled rather than slid.
 *
 * Numbers use tabular figures. Proportional digits change width as they count
 * and the whole line jitters; it is the most common tell of a cheap counter.
 */

import { useEffect, useRef } from 'react';
import { gsap, ScrollTrigger } from '@/lib/scroll-engine';
import { SplitText } from 'gsap/dist/SplitText';

gsap.registerPlugin(SplitText);

export interface StatRevealProps {
  value: number | null;
  label: string;
  /** Appended to the number, e.g. '%' or 'mo'. */
  suffix?: string;
  /** Decimal places. */
  precision?: number;
  /** Shown instead of the number when value is null. */
  unavailable?: string;
  /** Small print under the label. */
  note?: string;
  align?: 'left' | 'center';
}

export default function StatReveal({
  value,
  label,
  suffix = '',
  precision = 0,
  unavailable = 'not reached',
  note,
  align = 'left',
}: StatRevealProps) {
  const root = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = root.current;
    const num = numRef.current;
    const lab = labelRef.current;
    if (!el || !lab) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const split = new SplitText(lab, { type: 'lines', linesClass: 'sr-line' });

    // Each line gets its own overflow-hidden parent so the wipe has something
    // to hide behind. SplitText gives the lines; the masks are ours.
    const masks: HTMLElement[] = split.lines.map((line) => {
      const wrap = document.createElement('span');
      wrap.style.display = 'block';
      wrap.style.overflow = 'hidden';
      line.parentNode?.insertBefore(wrap, line);
      wrap.appendChild(line);
      return wrap;
    });

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: el,
          start: 'top 82%',
          once: true,
        },
      });

      if (num && value !== null) {
        const counter = { v: 0 };
        tl.to(
          counter,
          {
            v: value,
            duration: reduced ? 0 : 1.5,
            ease: 'editorial',
            onUpdate: () => {
              num.textContent = counter.v.toFixed(precision);
            },
          },
          0,
        );
      }

      tl.from(
        split.lines,
        {
          yPercent: 118,
          duration: reduced ? 0 : 1.05,
          ease: 'editorial',
          stagger: 0.075,
        },
        // Slight overlap: the label starts unveiling before the number lands,
        // so the two read as one gesture rather than a queue.
        0.12,
      );
    }, el);

    return () => {
      ctx.revert();
      // Unwrap before SplitText reverts, or it restores into our wrappers and
      // leaves orphaned spans behind on every re-render.
      masks.forEach((wrap) => {
        const line = wrap.firstChild;
        if (line) wrap.parentNode?.insertBefore(line, wrap);
        wrap.remove();
      });
      split.revert();
      ScrollTrigger.refresh();
    };
  }, [value, precision]);

  return (
    <div ref={root} className={align === 'center' ? 'text-center' : 'text-left'}>
      <div className="flex items-baseline gap-1.5">
        {value === null ? (
          <span className="numeral text-[clamp(2rem,4vw,3.2rem)] font-semibold leading-none text-ink-600">
            {unavailable}
          </span>
        ) : (
          <>
            <span
              ref={numRef}
              className="numeral text-[clamp(2.6rem,6vw,5.2rem)] font-bold leading-[0.9] tracking-[-0.03em]"
              style={{ color: 'var(--accent)' }}
            >
              0
            </span>
            {suffix && (
              <span className="numeral text-[clamp(1rem,2vw,1.6rem)] font-medium text-ink-400">
                {suffix}
              </span>
            )}
          </>
        )}
      </div>

      <p ref={labelRef} className="mt-2 max-w-[26ch] text-[15px] leading-snug text-ink-300">
        {label}
      </p>

      {note && <p className="mt-1 max-w-[32ch] text-[12px] leading-snug text-ink-600">{note}</p>}
    </div>
  );
}
