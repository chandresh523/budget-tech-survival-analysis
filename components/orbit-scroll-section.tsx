'use client';

interface OrbitScrollProps {
  lines: { label: string; value: string }[];
}

export default function OrbitScrollSection({ lines }: OrbitScrollProps) {
  return (
    <div className="w-full max-w-5xl mx-auto px-6 py-12">
      <div className="mb-6">
        <span className="font-mono text-xs uppercase tracking-widest text-cyan-400">// SYSTEM DIAGNOSTICS</span>
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-white mt-1">
          Runtime Execution Metrics
        </h2>
        <p className="font-mono text-xs text-gray-400 mt-1">
          Live pipeline status and active category parameters feeding the statistical inference models.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {lines.map((line, idx) => (
          <div 
            key={idx} 
            className="p-6 rounded-2xl bg-[#050510]/80 border border-cyan-500/30 backdrop-blur-2xl shadow-[0_0_30px_rgba(0,194,209,0.08)] relative overflow-hidden group hover:border-cyan-400 transition-all duration-300"
          >
            {/* Subtle corner accent */}
            <div className="absolute top-0 right-0 w-12 h-12 bg-gradient-to-bl from-cyan-500/20 to-transparent pointer-events-none" />
            
            <div className="font-mono text-[10px] text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              {line.label}
            </div>
            <div className="font-display text-lg font-bold text-cyan-300 tracking-wide">
              {line.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
