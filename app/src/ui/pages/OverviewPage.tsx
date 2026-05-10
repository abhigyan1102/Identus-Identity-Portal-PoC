import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAgent } from '@ui/AgentProvider';
import { useWallet } from '@ui/WalletProvider';
import { Copyable } from '@ui/components/Copyable';
import type { ConnectionRecord, CredentialRecord, DIDRecord } from '@identus/portal-core';

export function OverviewPage() {
  const { agent, mode, cloudLive, endpoint } = useAgent();
  const { connectedName, address } = useWallet();
  const [dids, setDids] = useState<DIDRecord[]>([]);
  const [conns, setConns] = useState<ConnectionRecord[]>([]);
  const [creds, setCreds] = useState<CredentialRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([agent.listDIDs(), agent.listConnections(), agent.listCredentials()]).then(
      ([d, c, v]) => {
        if (cancelled) return;
        setDids(d);
        setConns(c);
        setCreds(v);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [agent]);

  const published = dids.filter((d) => d.status === 'published').length;

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <h1 className="text-[28px] font-semibold leading-tight tracking-tightish">Overview</h1>
        <p className="text-sm text-stone-500">
          {mode === 'edge'
            ? 'Running locally in the browser. No backend required.'
            : `Connected to ${endpoint}.`}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-stone-200 bg-stone-200 md:grid-cols-4">
        <Stat label="DIDs" value={dids.length} sub={`${published} published`} to="/dids" />
        <Stat label="Connections" value={conns.length} sub="DIDComm" to="/connections" />
        <Stat label="Credentials" value={creds.length} sub="issued" to="/credentials" />
        <Stat
          label="Wallet"
          value={connectedName ?? '—'}
          sub={address ? address.slice(0, 12) + '…' : 'not connected'}
          to="/dids"
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <SidePanel title="Mode">
          <div className="flex items-center justify-between text-sm">
            <span className="text-stone-700">{mode === 'edge' ? 'Edge' : 'Cloud'}</span>
            <span className={mode === 'cloud' && !cloudLive ? 'chip-amber' : 'chip-emerald'}>
              {mode === 'edge' ? 'offline-first' : cloudLive ? 'live' : 'mocked fallback'}
            </span>
          </div>
          <p className="text-2xs leading-relaxed text-stone-500">
            {mode === 'edge'
              ? 'No CLOUD_AGENT_API_ENDPOINT set. The TypeScript Edge Agent SDK runs in the browser; PRISM operations sign through CIP-30.'
              : 'The portal proxies operations to the Cloud Agent over REST. Switch back to Edge any time from Settings.'}
          </p>
          <Link to="/settings" className="btn-link text-2xs">
            Change mode →
          </Link>
        </SidePanel>

        <SidePanel title="Recent DIDs">
          {dids.length === 0 ? (
            <div className="text-2xs text-stone-500">
              No DIDs yet.{' '}
              <Link to="/dids" className="underline underline-offset-2 hover:text-stone-900">
                Create one
              </Link>
              .
            </div>
          ) : (
            <ul className="divide-y divide-stone-100">
              {dids.slice(0, 4).map((d) => (
                <li
                  key={d.did}
                  className="flex items-center justify-between gap-3 py-2 text-2xs"
                >
                  <span className="truncate text-stone-700">{d.alias ?? 'unnamed'}</span>
                  <Copyable value={d.did} />
                </li>
              ))}
            </ul>
          )}
        </SidePanel>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  to,
}: {
  label: string;
  value: number | string;
  sub: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="block bg-white px-5 py-4 transition hover:bg-stone-50"
    >
      <div className="text-2xs font-medium uppercase tracking-wider text-stone-500">{label}</div>
      <div className="mt-1.5 truncate text-2xl font-semibold tracking-tightish text-stone-900">
        {value}
      </div>
      <div className="mt-0.5 text-2xs text-stone-500">{sub}</div>
    </Link>
  );
}

function SidePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="surface p-5">
      <div className="mb-3 text-2xs font-medium uppercase tracking-wider text-stone-500">
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
