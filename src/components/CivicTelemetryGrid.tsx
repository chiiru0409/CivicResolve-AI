import React from 'react';
import { Activity, Cpu, Server, ShieldCheck, ArrowUpRight } from 'lucide-react';

interface TelemetryMetric {
  label: string;
  spec: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  status: string;
}

export const CivicTelemetryGrid: React.FC = () => {
  const stats: TelemetryMetric[] = [
    {
      label: 'AI Classification Accuracy',
      spec: 'ResNet + Vision Transformer Ensemble',
      value: '99.4%',
      icon: Cpu,
      status: 'OPTIMAL',
    },
    {
      label: 'Dispatch Latency',
      spec: 'Automated municipal API webhook hook',
      value: '0.042 s',
      icon: Activity,
      status: 'REAL-TIME',
    },
    {
      label: 'Active City Sensors',
      spec: 'Geotagged citizen endpoints & camera nodes',
      value: '14,280',
      icon: Server,
      status: 'ONLINE',
    },
    {
      label: 'Resolution Rate',
      spec: 'Closed within mandatory SLA window',
      value: '96.8%',
      icon: ShieldCheck,
      status: 'VERIFIED',
    },
  ];

  return (
    <section className="relative border-t border-white/10 bg-[#090909] px-6 py-20 md:px-12 md:py-28 overflow-hidden">
      {/* Background ambient glow matching palette */}
      <div className="pointer-events-none absolute -top-40 left-1/4 h-80 w-80 rounded-full bg-[#E10600]/10 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-40 right-1/4 h-80 w-80 rounded-full bg-[#FFC400]/5 blur-[100px]" />

      <div className="mx-auto max-w-[1340px]">
        {/* Section Header */}
        <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16 items-start">
          <div className="flex flex-col gap-6">
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.25em] text-[#E10600] backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-[#E10600] shadow-[0_0_8px_#E10600] animate-pulse" />
              SYSTEMS NOMINAL // COMMAND READY
            </div>

            <h2 className="font-sans text-3xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl leading-[1.05]">
              Engineered for <br />
              <span className="text-[#E10600]">Zero Public Friction.</span>
            </h2>

            <p className="max-w-[48ch] text-sm sm:text-base leading-relaxed text-white/60 font-light">
              Every civic complaint filed is indexed into a municipal action graph, verifying authenticity, dispatching emergency crews, and delivering audit-grade telemetry updates to citizens and field units.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <div className="flex items-center gap-2 font-mono text-xs text-white/50 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
                Neural Mesh SLA: <span className="text-white font-bold">100% Target Met</span>
              </div>
              <div className="flex items-center gap-2 font-mono text-xs text-white/50 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#FFC400]" />
                Latency: <span className="text-[#FFC400] font-bold">&lt; 50ms</span>
              </div>
            </div>
          </div>

          {/* Telemetry Stats Breakdown Cards */}
          <div className="grid gap-3 font-mono">
            {stats.map((stat, i) => {
              const Icon = stat.icon;
              return (
                <div
                  key={i}
                  className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#121212] p-5 sm:p-6 transition-all duration-200 hover:border-[#E10600]/40 hover:bg-[#151515] hover:shadow-[0_4px_24px_rgba(225,6,0,0.12)]"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white/70 group-hover:border-[#E10600]/30 group-hover:text-[#E10600] transition-colors">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs uppercase tracking-[0.2em] text-white/50 group-hover:text-white/80 transition-colors font-semibold">
                          {stat.label}
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/20 px-2 py-0.5 rounded-full">
                          {stat.status}
                        </span>
                      </div>
                      <span className="font-sans text-xs text-white/40 leading-relaxed">
                        {stat.spec}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-baseline gap-1 self-end sm:self-center">
                    <span className="text-2xl sm:text-3xl font-black tracking-tight text-white group-hover:text-[#E10600] transition-colors">
                      {stat.value}
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-white/30 group-hover:text-[#E10600] transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default CivicTelemetryGrid;
