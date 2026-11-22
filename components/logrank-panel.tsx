'use client';

/**
 * Pairwise log-rank results.
 *
 * Reading two survival curves as "different" because they look different is the
 * classic mistake; the log-rank test is what licenses the claim. Shown as a
 * strip of engraved chips, significant pairs lit.
 *
 * The multiple-comparisons caveat is stated rather than hidden: with 10 devices
 * there are 45 possible pairs, so a handful of p < 0.05 results is expected by
 * chance alone.
 */

import { useState } from 'react';
import type { KmComparison } from '@/lib/supabase-browser';
import { Key, Lamp } from '@/components/panel';

export default function LogrankPanel({ comparison }: { comparison: KmComparison | null }) {
  const [showAll, setShowAll] = useState(false);

  if (!comparison || comparison.pairs.length === 0) {
    return (
      <p className="py-6 text-center text-xs leading-relaxed text-etch-faint">
        Not enough estimable curves to compare. Log-rank tests appear once at
        least two devices have observed failures.
      </p>
    );
  }

  const { pairs, significant_pairs: significant, alpha } = comparison;
  const shown = showAll ? pairs : pairs.slice(0, 8);

  // Bonferroni is the conservative reference point for this many pairs.
  const bonferroni = alpha / pairs.length;
  const survivesBonferroni = pairs.filter((p) => p.p_value < bonferroni).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="flex items-baseline gap-1.5">
          <span className="numeral text-2xl font-semibold leading-none text-ink-amber">
            {significant}
          </span>
          <span className="silkscreen">
            of {pairs.length} pairs differ at p&lt;{alpha}
          </span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="numeral text-2xl font-semibold leading-none text-etch-dim">
            {survivesBonferroni}
          </span>
          <span className="silkscreen">survive bonferroni</span>
        </span>
      </div>

      <ul className="flex flex-wrap gap-2">
        {shown.map((p) => (
          <li
            key={`${p.a}-${p.b}`}
            title={`log-rank χ² = ${p.test_statistic}, p = ${p.p_value}`}
            className={`metal-plate grain flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${
              p.significant ? '' : 'opacity-60'
            }`}
          >
            <Lamp tone={p.significant ? 'amber' : 'neutral'} size={5} />
            <span className="text-[10.5px] uppercase tracking-wider text-etch-dim">
              {p.a} <span className="text-etch-faint">vs</span> {p.b}
            </span>
            <span
              className={`numeral text-[10.5px] ${
                p.significant ? 'text-ink-amber' : 'text-etch-faint'
              }`}
            >
              p={p.p_value < 0.0001 ? '<.0001' : p.p_value.toFixed(4)}
            </span>
          </li>
        ))}
      </ul>

      {pairs.length > 8 && (
        <div className="mt-3">
          <Key tone="dark" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'show top 8' : `show all ${pairs.length}`}
          </Key>
        </div>
      )}

      <p className="mt-4 max-w-prose text-[10px] leading-relaxed text-etch-faint">
        {comparison.method}, α = {alpha}. With {pairs.length} simultaneous
        comparisons, roughly {(pairs.length * alpha).toFixed(1)} false positives
        are expected by chance — treat the Bonferroni count as the defensible
        figure, and any single pair as suggestive rather than conclusive.
      </p>
    </div>
  );
}
