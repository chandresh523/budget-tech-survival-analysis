# MERIDIAN — Constellation Intelligence UI

Dark-mode, glass/glow orbital telemetry interface. Next.js (App Router) + Tailwind + Framer Motion + Recharts.

## Install

```bash
npx create-next-app@latest meridian-ui --typescript --tailwind --app
cd meridian-ui
npm install framer-motion recharts
```

Drop these files in, replacing the generated defaults:

```
tailwind.config.ts
app/globals.css
app/layout.tsx
app/page.tsx
components/hero-orbital.tsx
components/telemetry-stat.tsx
components/telemetry-grid.tsx
components/orbit-scroll-section.tsx
components/constellation-table.tsx
lib/mock-data.ts
```

Then `npm run dev`.

## Components & data shapes

**`<HeroOrbital />`** — all copy is optional props (`eyebrow`, `title`, `subtitle`, `liveLabel`, `catalogId`). The orbit-ring HUD behind the headline is scroll-driven via `useTransform`, not a CSS loop.

**`<TelemetryGrid data={...} />`** — pass an array of:
```ts
{
  id: string;              // shown as the card's catalog label
  label: string;
  value: number | string;
  unit?: string;
  delta?: number;          // signed change, colored by status
  status?: "nominal" | "watch" | "critical";
  series?: { t: string | number; v: number }[]; // sparkline
  accent?: "violet" | "cyan";
}
```

**`<OrbitScrollSection />`** — accepts `lines: { label: string; value: string }[]` for the central readout. The three orbit-line layers behind it move at independently mapped scroll speeds.

**`<ConstellationTable rows={...} />`** — pass an array of:
```ts
{
  norad: string;
  name: string;
  altitudeKm: number;
  inclinationDeg: number;
  status: "nominal" | "watch" | "critical";
}
```

Swap `lib/mock-data.ts` for a fetch/query and every downstream component updates — nothing else needs to change.

## Notes

- `prefers-reduced-motion` is respected globally (see `app/globals.css`).
- All glow/glass treatments are centralized as Tailwind component classes (`.glass`, `.glass-violet`, `.glass-cyan`) so the visual language stays consistent as you add sections.
- Status colors (`nominal` / `watch` / `critical`) are the only place amber/red appear — kept as real signal, not decoration.
