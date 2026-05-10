import { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useAgent } from '@ui/AgentProvider';
import { Copyable } from '@ui/components/Copyable';
import { EmptyState } from '@ui/components/EmptyState';
import type { ConnectionRecord, OOBInvitation } from '@identus/portal-core';

export function ConnectionsPage() {
  const { agent } = useAgent();
  const [conns, setConns] = useState<ConnectionRecord[]>([]);
  const [invitation, setInvitation] = useState<OOBInvitation | null>(null);
  const [inboundUrl, setInboundUrl] = useState('');

  const refresh = useCallback(async () => {
    setConns(await agent.listConnections());
  }, [agent]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onCreate = async () => {
    setInvitation(await agent.createInvitation('Identity Portal'));
    await refresh();
  };

  const onAccept = async () => {
    if (!inboundUrl) return;
    await agent.acceptInvitation(inboundUrl);
    setInboundUrl('');
    await refresh();
  };

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-[28px] font-semibold leading-tight tracking-tightish">Connections</h1>
        <p className="text-sm text-stone-500">
          DIDComm v2 over Out-of-Band invitations. Share the URL with a mobile wallet to complete
          the handshake.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="surface p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Outbound invitation</div>
            <button className="btn-primary text-2xs" onClick={() => void onCreate()}>
              {invitation ? 'Regenerate' : 'Generate'}
            </button>
          </div>
          {invitation ? (
            <div className="flex flex-col items-center gap-3 pt-1">
              <div className="rounded-md border border-stone-200 bg-white p-3">
                <QRCodeSVG
                  value={invitation.url}
                  size={168}
                  level="M"
                  marginSize={0}
                  bgColor="#ffffff"
                  fgColor="#0c0a09"
                />
              </div>
              <div className="w-full text-center">
                <Copyable value={invitation.url} truncate={false} className="max-w-full break-all" />
              </div>
              <p className="text-2xs text-stone-500">
                Scan with a mobile Identus wallet to complete the DIDComm handshake.
              </p>
            </div>
          ) : (
            <p className="text-2xs text-stone-500">
              Generate an OOB invitation. It will render here as a QR for mobile wallet scan.
            </p>
          )}
        </section>

        <section className="surface p-5 space-y-3">
          <div className="text-sm font-medium">Accept inbound</div>
          <p className="text-2xs text-stone-500">
            Paste an OOB URL received from another agent.
          </p>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="didcomm://oob?id=…"
              value={inboundUrl}
              onChange={(e) => setInboundUrl(e.target.value)}
            />
            <button
              className="btn-primary text-2xs"
              onClick={() => void onAccept()}
              disabled={!inboundUrl}
            >
              Accept
            </button>
          </div>
        </section>
      </div>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium">Connections</h2>
          <span className="text-2xs text-stone-500">{conns.length} total</span>
        </div>
        {conns.length === 0 ? (
          <EmptyState
            title="No connections yet"
            description="Create an invitation or paste an inbound OOB URL to establish your first DIDComm connection."
          />
        ) : (
          <div className="surface overflow-hidden">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-[28%]">Label</th>
                  <th>Peer DID</th>
                  <th className="w-[140px]">State</th>
                </tr>
              </thead>
              <tbody>
                {conns.map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.label}</td>
                    <td>
                      <Copyable value={c.theirDid ?? c.myDid} />
                    </td>
                    <td>
                      <span className="chip">{c.state}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
