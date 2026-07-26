import HeroOrbital from "@/components/hero-orbital";
import TelemetryGrid from "@/components/telemetry-grid";
import OrbitScrollSection from "@/components/orbit-scroll-section";
import ConstellationTable from "@/components/constellation-table";
import { telemetryData, constellationRows } from "@/lib/mock-data";

export default function Home() {
  return (
    <main className="bg-void">
      <HeroOrbital />
      <TelemetryGrid data={telemetryData} />
      <OrbitScrollSection />
      <ConstellationTable rows={constellationRows} />
    </main>
  );
}
