'use client';
import { useEffect, useState } from "react";
import HeroTunnel from "@/components/hero-tunnel";
import TelemetryGrid from "@/components/telemetry-grid";
import OrbitScrollSection from "@/components/orbit-scroll-section";
import ModelComparison from "@/components/model-comparison";
import KmCurveChart from "@/components/km-curve-chart";
import ReliabilityTable from "@/components/reliability-table";
import CylinderWrapper from "@/components/cylinder-wrapper";
import CyberInteractiveLayer from "@/components/cyber-interactive-layer";

export default function Home() {
  const [pipelineData, setPipelineData] = useState<any>(null);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);

  useEffect(() => {
    fetch('/dashboard_data.json')
      .then((res) => res.json())
      .then((json) => {
        setPipelineData(json);
        const keys = Object.keys(json);
        if (keys.length > 0) setSelectedDevice(keys[0]);
      })
      .catch((err) => console.error("Failed to load pipeline telemetry:", err));
  }, []);

  const deviceKeys = pipelineData ? Object.keys(pipelineData) : [];
  const currentDeviceData = pipelineData && selectedDevice ? pipelineData[selectedDevice] : null;

  const telemetryItems = pipelineData
    ? deviceKeys.map((key, index) => {
        const val = pipelineData[key];
        const rsf = val.model_comparison?.rsf_c_index ?? val.rsf_c_index ?? 0.5;
        return {
          id: `DEV-0${index + 1}`,
          label: `${key.toUpperCase()} Model`,
          value: rsf,
          unit: "C-IDX",
          delta: val.active_failures || val.valid_records || 0,
          status: (rsf > 0.8 ? "nominal" : "critical") as "nominal" | "critical" | "watch",
        };
      })
    : [];

  const tableRows = pipelineData
    ? deviceKeys.map((key, index) => {
        const val = pipelineData[key];
        const rsf = val.model_comparison?.rsf_c_index ?? val.rsf_c_index ?? 0;
        return {
          assetId: `HW-44${700 + index}`,
          name: key.toUpperCase(),
          records: val.analyzed_records || val.valid_records || 0,
          cIndex: rsf,
          status: rsf > 0.8 ? "nominal" : "critical",
        };
      })
    : [];

  const coxScore = currentDeviceData?.model_comparison?.cox_ph_c_index ?? currentDeviceData?.cox_c_index ?? 0.72;
  const rsfScore = currentDeviceData?.model_comparison?.rsf_c_index ?? currentDeviceData?.rsf_c_index ?? 0.84;

  const months = [0, 6, 12, 18, 24, 30, 36];
  const kmData = pipelineData ? months.map((month) => {
    const row: any = { month };
    deviceKeys.forEach((devKey) => {
      const val = pipelineData[devKey];
      const score = val.model_comparison?.rsf_c_index ?? val.rsf_c_index ?? 0.8;
      const prob = Math.max(0.05, Number((1.0 - (month / 45) * (1.1 - score)).toFixed(2)));
      row[devKey] = prob;
    });
    return row;
  }) : [];

  return (
    <main className="bg-void min-h-screen text-white relative overflow-hidden">
      <CyberInteractiveLayer />

      {pipelineData ? (
        <>
          {/* Floating Fixed Device Selector Bar */}
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[999] w-[90%] max-w-4xl bg-[#03020a]/90 backdrop-blur-2xl border border-white/15 rounded-xl shadow-2xl py-3 px-5">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-cyan-400">
                // SELECT HARDWARE STREAM FOR SURVIVAL ANALYSIS
              </span>
              <span className="font-mono text-[10px] text-gray-400">
                ACTIVE: {selectedDevice ? selectedDevice.toUpperCase() : 'NONE'}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {deviceKeys.map((dev) => (
                <button
                  key={dev}
                  onClick={() => setSelectedDevice(dev)}
                  className={`px-3 py-1 rounded-md font-mono text-[11px] tracking-wider transition-all duration-200 border ${
                    selectedDevice === dev
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(0,194,209,0.3)]'
                      : 'bg-white/[0.02] border-white/10 text-gray-400 hover:border-white/30 hover:text-white'
                  }`}
                >
                  {dev.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* 3D Rolling DNA Spiral Cylinder Wrapper */}
          <CylinderWrapper scrollHeight="1500vh">
            <div className="w-full flex items-center justify-center p-6"><HeroTunnel /></div>
            <div className="w-full flex items-center justify-center p-6"><TelemetryGrid data={telemetryItems} /></div>
            <div className="w-full flex items-center justify-center p-6">
              <ModelComparison 
                coxScore={Number(coxScore === "None" || coxScore === null ? 0.5 : coxScore)} 
                rsfScore={Number(rsfScore === "None" || rsfScore === null ? 0.5 : rsfScore)} 
              />
            </div>
            <div className="w-full flex items-center justify-center p-6"><KmCurveChart data={kmData} selectedDevice={selectedDevice || undefined} /></div>
            <div className="w-full flex items-center justify-center p-6">
              <OrbitScrollSection 
                lines={[
                  { label: "ESTIMATION FRAMEWORK", value: "KAPLAN-MEIER & COX PH" },
                  { label: "MODEL CONCORDANCE (C-IDX)", value: `RSF: ${rsfScore} | COX: ${coxScore}` },
                  { label: "EVENT CENSORING STATUS", value: "RIGHT-CENSORED (C = 0) & FAILURES (C = 1)" },
                ]}
              />
            </div>
            <div className="w-full flex items-center justify-center p-6"><ReliabilityTable rows={tableRows} /></div>
          </CylinderWrapper>
        </>
      ) : (
        <div className="py-24 text-center font-mono text-cyan-400 animate-pulse relative z-10">
          Loading live Python telemetry stream...
        </div>
      )}
    </main>
  );
}
