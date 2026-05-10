import { useState } from 'react';
import { useAgent } from '@ui/AgentProvider';

export function SettingsPage() {
  const { mode, endpoint, setEndpoint, switchMode, cloudLive } = useAgent();
  const [draft, setDraft] = useState(endpoint);

  const apply = () => setEndpoint(draft.trim());
  const clear = () => {
    setDraft('');
    setEndpoint('');
  };

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-[28px] font-semibold leading-tight tracking-tightish">Settings</h1>
        <p className="text-sm text-stone-500">
          Toggle between offline-first and connected modes. Changes apply immediately.
        </p>
      </header>

      <section className="surface divide-y divide-stone-100">
        <Row label="Mode" hint={mode === 'edge' ? 'Offline-first, in-browser' : 'Connected to Cloud Agent'}>
          <div className="inline-flex gap-1.5">
            <button
              className={mode === 'edge' ? 'btn-primary text-2xs' : 'btn-ghost text-2xs'}
              onClick={() => void switchMode('edge')}
            >
              Edge
            </button>
            <button
              className={mode === 'cloud' ? 'btn-primary text-2xs' : 'btn-ghost text-2xs'}
              onClick={() => void switchMode('cloud')}
              disabled={!endpoint}
              title={endpoint ? '' : 'Set endpoint first'}
            >
              Cloud
            </button>
          </div>
        </Row>

        <Row
          label="Cloud Agent endpoint"
          hint="Persisted in localStorage. Env var VITE_CLOUD_AGENT_API_ENDPOINT takes precedence at boot."
        >
          <div className="flex w-full max-w-md gap-1.5">
            <input
              className="input flex-1"
              placeholder="https://your-cloud-agent.example.com/cloud-agent"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button className="btn-primary text-2xs" onClick={apply}>
              Save
            </button>
            <button className="btn-ghost text-2xs" onClick={clear}>
              Clear
            </button>
          </div>
        </Row>

        {mode === 'cloud' ? (
          <Row label="Health" hint="Last health probe to the configured endpoint">
            <span className={cloudLive ? 'chip-emerald' : 'chip-amber'}>
              {cloudLive ? 'live' : 'unreachable · using local mock'}
            </span>
          </Row>
        ) : null}
      </section>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 px-5 py-4 md:grid-cols-[200px_1fr] md:items-center">
      <div>
        <div className="text-sm font-medium text-stone-900">{label}</div>
        {hint ? <div className="mt-0.5 text-2xs text-stone-500">{hint}</div> : null}
      </div>
      <div>{children}</div>
    </div>
  );
}
