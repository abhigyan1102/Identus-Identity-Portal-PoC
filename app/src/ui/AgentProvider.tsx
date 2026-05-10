import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AgentMode, IAgent } from '@identus/portal-core';
import { EdgeAgentAdapter } from '@adapters/edge/EdgeAgentAdapter';
import { CloudAgentAdapter } from '@adapters/cloud/CloudAgentAdapter';

interface AgentContextValue {
  mode: AgentMode;
  endpoint: string;
  setEndpoint: (value: string) => void;
  switchMode: (mode: AgentMode) => Promise<void>;
  agent: IAgent;
  ready: boolean;
  cloudLive: boolean;
}

const AgentContext = createContext<AgentContextValue | null>(null);

const ENDPOINT_KEY = 'identus.cloudAgentEndpoint';

function readEndpoint(): string {
  const env = (import.meta.env.VITE_CLOUD_AGENT_API_ENDPOINT as string | undefined) ?? '';
  if (env) return env;
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(ENDPOINT_KEY) ?? '';
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const [endpoint, setEndpointState] = useState(() => readEndpoint());
  const [mode, setMode] = useState<AgentMode>(() => (readEndpoint() ? 'cloud' : 'edge'));
  const [ready, setReady] = useState(false);
  const [cloudLive, setCloudLive] = useState(false);
  const agentRef = useRef<IAgent | null>(null);

  const buildAgent = useCallback((nextMode: AgentMode, nextEndpoint: string): IAgent => {
    if (nextMode === 'cloud' && nextEndpoint) {
      return new CloudAgentAdapter(nextEndpoint);
    }
    return new EdgeAgentAdapter();
  }, []);

  const bootstrap = useCallback(
    async (nextMode: AgentMode, nextEndpoint: string) => {
      setReady(false);
      const previous = agentRef.current;
      if (previous) await previous.stop().catch(() => undefined);
      const next = buildAgent(nextMode, nextEndpoint);
      agentRef.current = next;
      await next.start();
      setReady(true);
      setCloudLive(next instanceof CloudAgentAdapter ? next.isLive() : false);
    },
    [buildAgent],
  );

  useEffect(() => {
    void bootstrap(mode, endpoint);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap is driven explicitly by the setters below
  }, []);

  const setEndpoint = useCallback(
    (value: string) => {
      setEndpointState(value);
      if (typeof localStorage !== 'undefined') {
        if (value) localStorage.setItem(ENDPOINT_KEY, value);
        else localStorage.removeItem(ENDPOINT_KEY);
      }
      const nextMode: AgentMode = value ? 'cloud' : 'edge';
      setMode(nextMode);
      void bootstrap(nextMode, value);
    },
    [bootstrap],
  );

  const switchMode = useCallback(
    async (next: AgentMode) => {
      setMode(next);
      await bootstrap(next, next === 'cloud' ? endpoint : '');
    },
    [bootstrap, endpoint],
  );

  const value = useMemo<AgentContextValue>(
    () => ({
      mode,
      endpoint,
      setEndpoint,
      switchMode,
      agent: agentRef.current ?? new EdgeAgentAdapter(),
      ready,
      cloudLive,
    }),
    [mode, endpoint, setEndpoint, switchMode, ready, cloudLive],
  );

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgent(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error('useAgent must be used within <AgentProvider>');
  return ctx;
}
