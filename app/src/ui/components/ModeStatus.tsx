import type { AgentMode } from '@identus/portal-core';

interface Props {
  mode: AgentMode;
  live?: boolean;
  ready?: boolean;
}

export function ModeStatus({ mode, live, ready }: Props) {
  const dot = !ready
    ? 'bg-stone-300'
    : mode === 'edge'
      ? 'bg-emerald-500'
      : live
        ? 'bg-emerald-500'
        : 'bg-amber-500';

  const label =
    mode === 'edge' ? 'Edge mode' : live ? 'Cloud mode · live' : 'Cloud mode · mocked';

  return (
    <span className="inline-flex items-center gap-2 text-stone-600">
      <span className={`dot ${dot}`} />
      <span className="font-medium text-stone-800">{label}</span>
      {!ready ? <span className="text-stone-400">starting…</span> : null}
    </span>
  );
}
