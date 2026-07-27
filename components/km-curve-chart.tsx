'use client';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export default function KmCurveChart({ data, selectedDevice }: { data: any[]; selectedDevice?: string }) {
  const keys = data.length > 0 ? Object.keys(data[0]).filter(k => k !== 'month') : [];

  return (
    <div className="w-full max-w-6xl mx-auto px-6 py-12">
      <div className="mb-6">
        <span className="eyebrow text-cyan-400">BASELINE CURVES</span>
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-white mt-1">
          Kaplan-Meier Estimate {selectedDevice ? `— ${selectedDevice.toUpperCase()}` : ''}
        </h2>
        <p className="font-mono text-xs text-gray-400 mt-1">
          Probability of survival past a given month, stepped down at each observed failure event.
        </p>
      </div>

      <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-xl h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="month" stroke="#8a8896" tick={{ fontSize: 12, fontFamily: 'monospace' }} />
            <YAxis stroke="#8a8896" domain={[0, 1]} tick={{ fontSize: 12, fontFamily: 'monospace' }} />
            <Tooltip 
              contentStyle={{ background: '#03020a', borderColor: 'rgba(0,194,209,0.3)', borderRadius: '8px', fontFamily: 'monospace', fontSize: '12px' }}
            />
            {keys.map((key, idx) => {
              const isSelected = selectedDevice && key.toLowerCase() === selectedDevice.toLowerCase();
              const colors = ['#00c2d1', '#7c5cff', '#ffb020', '#f5f5f7', '#34d399', '#f472b6', '#60a5fa', '#a78bfa', '#fbbf24', '#38bdf8'];
              const strokeColor = colors[idx % colors.length];
              
              return (
                <Line
                  key={key}
                  type="stepAfter"
                  dataKey={key}
                  stroke={strokeColor}
                  strokeWidth={isSelected ? 3 : 1.5}
                  opacity={selectedDevice ? (isSelected ? 1 : 0.15) : 0.8}
                  dot={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
