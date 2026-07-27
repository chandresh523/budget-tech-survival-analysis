'use client';

interface TableRow {
  assetId: string;
  name: string;
  records: number;
  cIndex: number;
  status: string;
}

export default function ReliabilityTable({ rows }: { rows: TableRow[] }) {
  return (
    <div className="w-full max-w-6xl mx-auto px-6 py-12">
      <div className="mb-6">
        <span className="eyebrow text-cyan-400">RELIABILITY LEDGER</span>
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-white mt-1">
          Hardware Stream Summary &amp; Concordance Index
        </h2>
        <p className="font-mono text-xs text-gray-400 mt-1">
          Comprehensive statistical performance metrics across all tracked budget tech categories.
        </p>
      </div>

      <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-xl overflow-x-auto">
        <table className="w-full text-left font-mono text-xs">
          <thead>
            <tr className="border-b border-white/10 text-cyan-400">
              <th className="pb-3 font-normal uppercase tracking-wider">Asset ID</th>
              <th className="pb-3 font-normal uppercase tracking-wider">Device Stream</th>
              <th className="pb-3 font-normal uppercase tracking-wider">Analyzed Records</th>
              <th className="pb-3 font-normal uppercase tracking-wider">Concordance (C-IDX)</th>
              <th className="pb-3 font-normal uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-gray-300">
            {rows.map((row, idx) => (
              <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                <td className="py-3 text-cyan-300">{row.assetId}</td>
                <td className="py-3 font-bold text-white">{row.name}</td>
                <td className="py-3">{row.records} units</td>
                <td className="py-3 text-violet-400 font-bold">{Number(row.cIndex).toFixed(3)}</td>
                <td className="py-3">
                  <span className={`px-2.5 py-1 rounded text-[10px] uppercase font-bold ${
                    row.status === 'nominal' 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}>
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
