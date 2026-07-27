'use client';
import { useEffect, useState } from 'react';
import HeroTunnel from '@/components/hero-tunnel';
import TelemetryBento from '@/components/telemetry-bento';
import OrbitScrollSection from '@/components/orbit-scroll-section';
import ModelComparison from '@/components/model-comparison';
import KmCurveChart from '@/components/km-curve-chart';
import ConstellationTable from "@/components/constellation-table";
import SmoothCylinder from '@/components/smooth-cylinder';

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);

  useEffect(() => {
    fetch('/dashboard_data.json')
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        const keys = Object.keys(json);
        if (keys.length > 0) setSelectedDevice(keys[0]);
      });
  }, []);

  if (!data || !selectedDevice) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-xl animate-pulse font-mono text-cyan-400">Loading DOM Stress Test...</p>
      </main>
    );
  }

  const currentMetrics = data[selectedDevice];
  const coxScore = currentMetrics.model_comparison?.cox_ph_c_index ?? 0.5;
  const rsfScore = currentMetrics.model_comparison?.rsf_c_index ?? 0.5;

  const tableRows = Object.entries(data).map(([dev, m], i) => ({
    norad: `HW-44${700 + i}`,
    name: dev.toUpperCase(),
    altitudeKm: m.analyzed_records || 0,
    inclinationDeg: m.model_comparison?.rsf_c_index || 0,
    status: (m.model_comparison?.rsf_c_index || 0) > 0.8 ? "nominal" : "critical",
  }));

  const kmData = [
    { month: 0, twsEarbuds: 1.0, wirelessMice: 1.0, cables: 1.0 },
    { month: 6, twsEarbuds: 0.92, wirelessMice: 0.95, cables: 0.88 },
    { month: 12, twsEarbuds: 0.81, wirelessMice: 0.88, cables: 0.72 },
    { month: 18, twsEarbuds: 0.68, wirelessMice: 0.79, cables: 0.55 },
    { month: 24, twsEarbuds: 0.52, wirelessMice: 0.68, cables: 0.38 },
  ];

  return (
    <main className="bg-black text-white overflow-hidden">
      {/* 
        The Stress Test: 
        We pass a 4500px tall column into the slicer. 
        It will cut this giant column into 1000 microscopic strips. 
      */}
      <SmoothCylinder sliceCount={1000} panelHeight={4500}>
        <div className="flex flex-col w-full max-w-7xl mx-auto px-4 md:px-12" style={{ height: 4500 }}>
          
          {/* Section 1 */}
          <div className="w-full h-[900px] flex flex-col justify-center items-center pointer-events-none">
            <HeroTunnel />
          </div>

          {/* Section 2 */}
          <div className="w-full h-[900px] flex flex-col justify-center">
            <TelemetryBento
              tracked={currentMetrics.analyzed_records || 0}
              confirmedFail={currentMetrics.active_failures || 0}
              censorPoints={currentMetrics.censored_data || 0}
            />
          </div>

          {/* Section 3 */}
          <div className="w-full h-[900px] flex flex-col justify-center items-center">
            <OrbitScrollSection 
              lines={[
                { label: "DATABASE INGESTION", value: "SUPABASE LIVE" },
                { label: "PIPELINE STATUS", value: "OPTIMIZED" },
              ]}
            />
            <div className="w-full mt-8 scale-90">
              <ModelComparison coxScore={Number(coxScore)} rsfScore={Number(rsfScore)} />
            </div>
          </div>

          {/* Section 4 */}
          <div className="w-full h-[900px] flex flex-col justify-center">
            <KmCurveChart data={kmData} />
          </div>

          {/* Section 5 */}
          <div className="w-full h-[900px] flex flex-col justify-center pointer-events-auto">
            <ConstellationTable rows={tableRows} />
          </div>

        </div>
      </SmoothCylinder>
    </main>
  );
}
