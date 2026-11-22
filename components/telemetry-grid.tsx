"use client";

/**
 * The rack of device readout modules. Doubles as the device selector — clicking
 * a module latches it, which is why each card is a button when onSelect is set.
 */

import TelemetryStat, { type TelemetryStatProps } from "./telemetry-stat";

export type TelemetryGridProps = {
  data: Omit<TelemetryStatProps, "index">[];
};

export default function TelemetryGrid({ data }: TelemetryGridProps) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-etch-faint">
        No device streams in the current payload.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      {data.map((item, i) => (
        <TelemetryStat key={item.id} {...item} index={i} />
      ))}
    </div>
  );
}
