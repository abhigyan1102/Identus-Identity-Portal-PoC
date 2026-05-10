import { useCallback, useEffect, useState } from 'react';
import { useAgent } from '@ui/AgentProvider';
import { useWallet } from '@ui/WalletProvider';
import { Copyable } from '@ui/components/Copyable';
import { EmptyState } from '@ui/components/EmptyState';
import type { DIDDocument, DIDRecord } from '@identus/portal-core';
import { utf8ToHex } from '@identus/portal-core';

export function DIDsPage() {
  const { agent } = useAgent();
  const { wallet, connectedName, installed, connect, disconnect } = useWallet();

  const [dids, setDids] = useState<DIDRecord[]>([]);
  const [alias, setAlias] = useState('');
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<{ record: DIDRecord; doc: DIDDocument } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setDids(await agent.listDIDs());
  }, [agent]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onCreate = async () => {
    setBusy(true);
    try {
      await agent.createDID({ alias: alias || undefined, method: 'prism' });
      setAlias('');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const onResolve = async (record: DIDRecord) => {
    const doc = await agent.resolveDID(record.did);
    setActive({ record, doc });
  };

  // CIP-30 signData uses the wallet's Cardano payment key; a PRISM
  // AtalaOperation needs the DID's PRISM master key. So the wallet's job
  // here is not signing the operation but funding+submitting the metadata
  // tx that carries it. See README "Open design question" for the two
  // resolution paths; today this only proves the CIP-30 round-trip.
  const onPublish = async (record: DIDRecord) => {
    setNotice(null);
    setBusy(true);
    try {
      if (connectedName) {
        const sig = await wallet.signData(utf8ToHex(`prism-publish:${record.did}`));
        setNotice(`Signed via ${connectedName} (${sig.signature.slice(0, 16)}…). Demo signature only — real publish path is an open design question, see README.`);
      }
      await agent.publishDID(record.did);
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tightish">
            Decentralized Identifiers
          </h1>
          <p className="text-sm text-stone-500">
            Create, resolve, and publish PRISM DIDs. Connect a CIP-30 wallet to anchor on Cardano.
          </p>
        </div>
        <WalletButton
          connectedName={connectedName}
          installed={installed}
          onConnect={(n) => void connect(n)}
          onDisconnect={() => void disconnect()}
        />
      </header>

      <section className="surface flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="alias" className="label">
            Alias <span className="text-stone-400">(optional)</span>
          </label>
          <input
            id="alias"
            className="input"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="issuer-prod"
          />
        </div>
        <button className="btn-primary" disabled={busy} onClick={() => void onCreate()}>
          New PRISM DID
        </button>
      </section>

      {notice ? (
        <div className="rounded-md border border-stone-200 bg-white px-3 py-2 text-2xs text-stone-700">
          {notice}
        </div>
      ) : null}

      {dids.length === 0 ? (
        <EmptyState
          title="No DIDs yet"
          description="Create one above. Unpublished DIDs are usable for testing; publish to anchor on Cardano via PRISM."
        />
      ) : (
        <div className="surface overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th className="w-[28%]">Alias</th>
                <th>DID</th>
                <th className="w-[110px]">Status</th>
                <th className="w-[120px]">Created</th>
                <th className="w-[170px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {dids.map((d) => (
                <tr key={d.did}>
                  <td className="font-medium">{d.alias ?? <span className="text-stone-400">—</span>}</td>
                  <td>
                    <Copyable value={d.did} />
                  </td>
                  <td>
                    <StatusChip status={d.status} />
                  </td>
                  <td className="mono text-2xs text-stone-500">
                    {new Date(d.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="text-right">
                    <div className="inline-flex gap-1.5">
                      <button className="btn-ghost text-2xs" onClick={() => void onResolve(d)}>
                        Resolve
                      </button>
                      <button
                        className="btn-primary text-2xs"
                        disabled={busy || d.status === 'published' || d.status === 'deactivated'}
                        onClick={() => void onPublish(d)}
                      >
                        Publish
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {active ? (
        <section className="surface overflow-hidden">
          <header className="flex items-center justify-between border-b border-stone-200 px-4 py-2.5">
            <div className="text-sm font-medium">
              DID Document
              <span className="ml-2 text-2xs text-stone-500">
                {active.record.alias ?? active.record.did}
              </span>
            </div>
            <button className="btn-link text-2xs" onClick={() => setActive(null)}>
              Close
            </button>
          </header>
          <pre className="max-h-96 overflow-auto bg-stone-950 p-4 text-2xs leading-relaxed text-stone-100">
            {JSON.stringify(active.doc, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  );
}

function WalletButton({
  connectedName,
  installed,
  onConnect,
  onDisconnect,
}: {
  connectedName: string | null;
  installed: { name: string; icon?: string }[];
  onConnect: (name: string) => void;
  onDisconnect: () => void;
}) {
  if (connectedName) {
    return (
      <button className="btn-ghost text-2xs" onClick={onDisconnect}>
        <span className="dot bg-emerald-500" />
        {connectedName} · disconnect
      </button>
    );
  }
  if (installed.length === 0) {
    return (
      <span className="text-2xs text-stone-400">
        Install Lace, Eternl, Nami… to publish to Cardano
      </span>
    );
  }
  return (
    <div className="flex gap-1.5">
      {installed.slice(0, 3).map((w) => (
        <button key={w.name} className="btn-ghost text-2xs" onClick={() => onConnect(w.name)}>
          {w.icon ? <img src={w.icon} alt="" className="h-3.5 w-3.5" /> : null}
          {w.name}
        </button>
      ))}
    </div>
  );
}

function StatusChip({ status }: { status: DIDRecord['status'] }) {
  switch (status) {
    case 'published':
      return <span className="chip-emerald">Published</span>;
    case 'publishing':
      return <span className="chip-amber">Publishing</span>;
    case 'deactivated':
      return <span className="chip-rose">Deactivated</span>;
    default:
      return <span className="chip">Draft</span>;
  }
}
