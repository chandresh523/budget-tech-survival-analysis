'use client';

/**
 * The instrument's nameplate — a milled faceplate with a deep-engraved wordmark.
 *
 * The title renders twice, two pixels apart: a dark copy for the engraved
 * channel and a metal-gradient copy for the bevel catching the light. That
 * two-pass trick is what makes type read as cut into metal rather than printed.
 *
 * Entrance uses the CSS `rise-in` utility, which animates transform only and
 * never opacity. Anything that fades in from 0 is invisible wherever animations
 * do not advance — a throttled tab, an occluded window, a compositor that never
 * runs. The nameplate has to be readable unconditionally, so it stays opaque and
 * only its position animates.
 */

export default function HeroTunnel({
  responses,
  devices,
}: {
  responses?: number | null;
  devices?: number | null;
}) {
  return (
    <div className="relative mx-auto w-full max-w-4xl px-4 text-center">
      <span className="silkscreen rise-in inline-block">
        sdg 12 · responsible consumption
      </span>

      <h1
        className="rise-in relative mt-4 font-display text-5xl font-extrabold uppercase leading-[0.88] tracking-tight md:text-7xl"
        style={{ animationDelay: '80ms' }}
      >
        {/* Engraved channel: dark copy sitting two pixels low. */}
        <span aria-hidden className="absolute inset-0 translate-y-[2px] text-black/75">
          Lifespan
          <br />
          Matrix
        </span>
        {/* Lit bevel — brushed metal on the letterforms themselves. */}
        <span
          className="relative"
          style={{
            backgroundImage:
              'linear-gradient(178deg,#f2f4f7 0%,#c3c9d2 22%,#8b93a0 44%,#c3c9d2 58%,#e8a33d 76%,#a3691a 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            filter: 'drop-shadow(0 1px 0 rgba(255,255,255,0.16))',
          }}
        >
          Lifespan
          <br />
          Matrix
        </span>
      </h1>

      <p
        className="rise-in mx-auto mt-6 max-w-xl text-sm leading-relaxed text-etch-dim"
        style={{ animationDelay: '200ms' }}
      >
        Survival analysis on budget consumer peripherals — modelling
        time-to-failure across earbuds, mice, cables and power banks to quantify
        what &ldquo;disposable&rdquo; actually costs.
      </p>

      {(responses != null || devices != null) && (
        <div
          className="rise-in mt-8 flex flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: '300ms' }}
        >
          {responses != null && (
            <span className="metal-plate grain numeral rounded-lg px-3.5 py-2 text-sm text-ink-amber">
              {responses}
              <span className="silkscreen ml-1.5">responses</span>
            </span>
          )}
          {devices != null && (
            <span className="metal-plate grain numeral rounded-lg px-3.5 py-2 text-sm text-ink-cyan">
              {devices}
              <span className="silkscreen ml-1.5">categories</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
