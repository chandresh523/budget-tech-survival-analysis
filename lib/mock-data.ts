import dashboardData from '@/public/dashboard_data.json';
import { TelemetryStatProps } from "@/components/telemetry-stat";
import { SatelliteRow } from "@/components/constellation-table";

// Transform your Python ML pipeline JSON into Wrick's telemetry component props with UNIQUE IDs
export const telemetryData: Omit<TelemetryStatProps, "index">[] = Object.entries(dashboardData).map(([device, metrics]: [string, any], i) => {
  const rsf = metrics.model_comparison?.rsf_c_index;
  const cox = metrics.model_comparison?.cox_ph_c_index;
  const score = rsf !== null && rsf !== undefined ? rsf : (cox !== null && cox !== undefined ? cox : 0.5);
  
  return {
    id: `DEV-${device.toUpperCase()}-${i}`, // Unique ID fix for SAT-014 bug
    label: `${device.toUpperCase()} Survival Model`,
    value: score,
    unit: "C-Idx",
    delta: metrics.active_failures || 0,
    status: score > 0.8 ? "nominal" : score > 0.6 ? "watch" : "critical",
    accent: i % 2 === 0 ? "cyan" : "violet",
    series: Array.from({ length: 12 }, (_, idx) => ({
      t: idx,
      v: Number((score + Math.sin(idx / 1.5) * 0.05).toFixed(3)),
    })),
  };
});

// Transform your hardware telemetry categories into Wrick's table rows
export const constellationRows: SatelliteRow[] = Object.entries(dashboardData).map(([device, metrics]: [string, any], i) => ({
  norad: `HW-44${700 + i}`,
  name: device.toUpperCase(),
  altitudeKm: metrics.analyzed_records || 0,
  inclinationDeg: metrics.model_comparison?.rsf_c_index || 0,
  status: metrics.model_comparison?.rsf_c_index ? "nominal" : "critical",
}));
