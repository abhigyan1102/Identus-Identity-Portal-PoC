import { useCallback, useEffect, useState } from 'react';
import { useAgent } from '@ui/AgentProvider';
import { Copyable } from '@ui/components/Copyable';
import { EmptyState } from '@ui/components/EmptyState';
import type { CredentialFormat, CredentialRecord, DIDRecord } from '@identus/portal-core';

const FORMATS: CredentialFormat[] = ['jwt', 'sd-jwt', 'anoncreds', 'w3c-ld'];

export function CredentialsPage() {
  const { agent } = useAgent();
  const [creds, setCreds] = useState<CredentialRecord[]>([]);
  const [dids, setDids] = useState<DIDRecord[]>([]);
  const [issuerDid, setIssuerDid] = useState('');
  const [subjectDid, setSubjectDid] = useState('');
  const [format, setFormat] = useState<CredentialFormat>('jwt');
  const [claims, setClaims] = useState('{\n  "name": "Alice Doe",\n  "role": "engineer"\n}');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [cs, ds] = await Promise.all([agent.listCredentials(), agent.listDIDs()]);
    setCreds(cs);
    setDids(ds);
    if (!issuerDid && ds[0]) setIssuerDid(ds[0].did);
  }, [agent, issuerDid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onIssue = async () => {
    setError(null);
    setBusy(true);
    try {
      const parsed = JSON.parse(claims) as Record<string, unknown>;
      await agent.issueCredential({
        issuerDid: issuerDid || 'did:prism:demo-issuer',
        subjectDid: subjectDid || 'did:prism:demo-subject',
        format,
        claims: parsed,
      });
      setOpen(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tightish">
            Credentials
          </h1>
          <p className="text-sm text-stone-500">
            Issue JWT, SD-JWT, AnonCreds, or W3C-LD credentials. Stored in the agent and presentable
            over DIDComm.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setOpen((v) => !v)}>
          {open ? 'Cancel' : 'Issue credential'}
        </button>
      </header>

      {open ? (
        <section className="surface p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">Issuer DID</label>
              <select
                className="input"
                value={issuerDid}
                onChange={(e) => setIssuerDid(e.target.value)}
              >
                <option value="">— select —</option>
                {dids.map((d) => (
                  <option key={d.did} value={d.did}>
                    {d.alias ?? d.did}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Subject DID</label>
              <input
                className="input"
                value={subjectDid}
                onChange={(e) => setSubjectDid(e.target.value)}
                placeholder="did:prism:…"
              />
            </div>
            <div>
              <label className="label">Format</label>
              <select
                className="input"
                value={format}
                onChange={(e) => setFormat(e.target.value as CredentialFormat)}
              >
                {FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label">Claims · JSON</label>
              <textarea
                className="input mono"
                rows={6}
                value={claims}
                onChange={(e) => setClaims(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between md:col-span-2">
              {error ? <span className="text-2xs text-rose-600">{error}</span> : <span />}
              <button className="btn-primary" disabled={busy} onClick={() => void onIssue()}>
                Issue
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {creds.length === 0 ? (
        <EmptyState
          title="No credentials issued"
          description="Issue a verifiable credential to start. The agent stores it locally and can present it over DIDComm."
        />
      ) : (
        <div className="surface overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>Format</th>
                <th>Issuer</th>
                <th>Subject</th>
                <th>Claims</th>
                <th className="w-[120px]">Issued</th>
              </tr>
            </thead>
            <tbody>
              {creds.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className="chip">{c.format}</span>
                  </td>
                  <td>
                    <Copyable value={c.issuerDid} />
                  </td>
                  <td>
                    <Copyable value={c.subjectDid} />
                  </td>
                  <td className="mono text-2xs text-stone-600">
                    {Object.keys(c.claims).slice(0, 3).join(', ')}
                    {Object.keys(c.claims).length > 3 ? '…' : ''}
                  </td>
                  <td className="mono text-2xs text-stone-500">
                    {new Date(c.issuedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
