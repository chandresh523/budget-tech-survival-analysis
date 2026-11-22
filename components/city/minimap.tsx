'use client';

/**
 * Overhead map of the route — the player's map, etched into a brass plate.
 *
 * Doubles as the primary navigation: each district is a real button that scrolls
 * you there, so the whole dashboard stays reachable without flying the path.
 * That matters for accessibility as much as convenience.
 */

import { useMemo } from 'react';
import { DISTRICTS, FLIGHT_PATH, scrollForDistrict } from '@/lib/city-plan';

const W = 190;
const H = 132;
const PAD = 14;

export interface MinimapProps {
  /** Live path parameter 0-1. */
  t: number;
  /** Index of the district currently arrived at, or null in transit. */
  arrivedAt: number | null;
  /** Index being approached. */
  targetIndex: number;
  onNavigate: (scroll: number) => void;
}

export default function Minimap({ t, arrivedAt, targetIndex, onNavigate }: MinimapProps) {
  // Project the world XZ plane into map space once; the path never changes.
  const { pathD, points, project } = useMemo(() => {
    const samples = FLIGHT_PATH.getSpacedPoints(140);
    const xs = samples.map((p) => p.x);
    const zs = samples.map((p) => p.z);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    // Use ONE scale for both axes. Normalising x and z independently stretched
    // the route's 8-unit lateral wave across the full map width and drew a
    // violent serpentine for what is very nearly a straight line.
    const spanX = maxX - minX || 1;
    const spanZ = maxZ - minZ || 1;
    const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanZ);
    const midX = (minX + maxX) / 2;
    const midZ = (minZ + maxZ) / 2;

    const proj = (x: number, z: number): [number, number] => [
      W / 2 + (x - midX) * scale,
      // Negated: -Z is "forward" into the city, which should read as up-screen.
      H / 2 - (z - midZ) * scale,
    ];

    const d = samples
      .map((p, i) => {
        const [px, py] = proj(p.x, p.z);
        return `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`;
      })
      .join(' ');

    return {
      pathD: d,
      points: DISTRICTS.map((dist) => proj(dist.anchor[0], dist.anchor[2])),
      project: proj,
    };
  }, []);

  const head = FLIGHT_PATH.getPointAt(Math.min(1, Math.max(0, t)));
  const [hx, hy] = project(head.x, head.z);
  const active = arrivedAt ?? targetIndex;

  return (
    <div className="metal-plate grain accent-district rounded-xl border p-2">
      <div className="mb-1.5 flex items-baseline justify-between px-0.5">
        <span className="silkscreen">route</span>
        <span className="silkscreen text-etch-dim!">
          {arrivedAt !== null ? DISTRICTS[arrivedAt].name : `→ ${DISTRICTS[targetIndex].name}`}
        </span>
      </div>

      <div className="metal-well rounded-lg p-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full"
          role="img"
          aria-label="Route map of the six districts"
        >
          {/* Survey grid, so the plate reads as a chart */}
          <defs>
            <pattern id="mm-grid" width="14" height="14" patternUnits="userSpaceOnUse">
              <path d="M14 0H0V14" fill="none" stroke="rgba(255,255,255,0.045)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#mm-grid)" />

          {/* The flight path */}
          <path d={pathD} fill="none" stroke="rgba(232,163,61,0.28)" strokeWidth="1.6" />
          <path
            d={pathD}
            fill="none"
            stroke="rgba(232,163,61,0.9)"
            strokeWidth="1.6"
            strokeDasharray="1 3"
            strokeLinecap="round"
          />

          {/* District markers */}
          {DISTRICTS.map((district, i) => {
            const [x, y] = points[i];
            const isActive = i === active;
            const visited = t >= (i / (DISTRICTS.length - 1)) - 0.02;
            return (
              <g key={district.id}>
                {isActive && (
                  <circle cx={x} cy={y} r="8.5" fill={district.accent} opacity="0.16" />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={isActive ? 4.2 : 3}
                  fill={visited ? district.accent : '#2c3138'}
                  stroke="rgba(0,0,0,0.7)"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={y - 7.5}
                  textAnchor="middle"
                  fontSize="6.2"
                  letterSpacing="0.5"
                  fill={isActive ? '#f2f4f7' : '#5d6572'}
                  style={{ textTransform: 'uppercase' }}
                >
                  {district.name}
                </text>
              </g>
            );
          })}

          {/* Craft position */}
          <g transform={`translate(${hx.toFixed(1)} ${hy.toFixed(1)})`}>
            <circle r="6" fill="#ffd08a" opacity="0.2" />
            <circle r="2.6" fill="#ffd08a" />
          </g>
        </svg>
      </div>

      {/* Real buttons: keyboard-reachable navigation to every district. */}
      <div className="mt-1.5 grid grid-cols-3 gap-1">
        {DISTRICTS.map((district, i) => (
          <button
            key={district.id}
            type="button"
            onClick={() => onNavigate(scrollForDistrict(i))}
            aria-current={i === active ? 'true' : undefined}
            title={district.tagline}
            className={`btn-tactile rounded-md px-1 py-1 text-[8.5px] leading-tight ${
              i === active ? 'key-brass' : 'key-dark'
            }`}
          >
            {district.name}
          </button>
        ))}
      </div>
    </div>
  );
}
