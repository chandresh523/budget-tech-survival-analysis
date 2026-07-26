import { TelemetryStatProps } from "@/components/telemetry-stat";
import { SatelliteRow } from "@/components/constellation-table";

const spark = (base: number, variance: number) =>
  Array.from({ length: 12 }, (_, i) => ({
    t: i,
    v: base + Math.sin(i / 1.5) * variance + (Math.random() - 0.5) * variance * 0.4,
  }));

export const telemetryData: Omit<TelemetryStatProps, "index">[] = [
  {
    id: "SAT-014",
    label: "Constellation coverage",
    value: 98.2,
    unit: "%",
    delta: 0.4,
    status: "nominal",
    accent: "cyan",
    series: spark(98, 1.5),
  },
  {
    id: "SAT-014",
    label: "Mean orbital velocity",
    value: "7.61",
    unit: "km/s",
    delta: -0.02,
    status: "nominal",
    accent: "violet",
    series: spark(7.6, 0.1),
  },
  {
    id: "SAT-014",
    label: "Active ground links",
    value: 38,
    unit: "/ 41",
    delta: -1,
    status: "watch",
    accent: "cyan",
    series: spark(38, 3),
  },
  {
    id: "SAT-014",
    label: "Debris proximity alerts",
    value: 3,
    unit: "flags",
    delta: 2,
    status: "critical",
    accent: "violet",
    series: spark(2, 2),
  },
];

export const constellationRows: SatelliteRow[] = [
  { norad: "44714", name: "MERIDIAN-07", altitudeKm: 547, inclinationDeg: 53.2, status: "nominal" },
  { norad: "44715", name: "MERIDIAN-08", altitudeKm: 549, inclinationDeg: 53.2, status: "nominal" },
  { norad: "44821", name: "MERIDIAN-12", altitudeKm: 541, inclinationDeg: 53.1, status: "watch" },
  { norad: "45093", name: "MERIDIAN-19", altitudeKm: 552, inclinationDeg: 53.3, status: "nominal" },
  { norad: "45114", name: "MERIDIAN-21", altitudeKm: 538, inclinationDeg: 53.0, status: "critical" },
  { norad: "45201", name: "MERIDIAN-24", altitudeKm: 546, inclinationDeg: 53.2, status: "nominal" },
];
