import { useState } from 'react';
import { useAgent } from '@ui/AgentProvider';
import { uid } from '@identus/portal-core';
import type { PresentationResult } from '@identus/portal-core';

export function VerifyPage() {
  const { agent } = useAgent();
  const [verifier, setVerifier] = useState('did:prism:verifier-demo');
  const [claims, setClaims] = useState('name, role');
  const [presentation, setPresentation] = useState('');
  const [result, setResult] = useState<PresentationResult | null>(null);
  const [busy, setBusy] = useState(false);

  const onVerify = async () => {
    setBusy(true);
    try {
      const r = await agent.verifyPresentation(
        {
          id: uid('preq'),
          verifierDid: verifier,
          claims: claims.split(',').map((c) => c.trim()).filter(Boolean),
          challenge: uid('chal'),
        },
        presentation,
      );
      setResult(r);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-[28px] font-semibold leading-tight tracking-tightish">Verify</h1>
        <p className="text-sm text-stone-500">
          Submit a credential presentation against a verification request.
        </p>
      </header>

      <section className="surface grid gap-3 p-5 md:grid-cols-2">
        <div>
          <label className="label">Verifier DID</label>
          <input
            className="input"
            value={verifier}
            onChange={(e) => setVerifier(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Required claims</label>
          <input
            className="input"
            value={claims}
            onChange={(e) => setClaims(e.target.value)}
            placeholder="comma-separated"
          />
        </div>
        <div className="md:col-span-2">
          <label className="label">Presentation</label>
          <textarea
            className="input mono"
            rows={5}
            value={presentation}
            onChange={(e) => setPresentation(e.target.value)}
            placeholder="paste a JWT VP or SD-JWT here"
          />
        </div>
        <div className="flex justify-end md:col-span-2">
          <button className="btn-primary" disabled={busy} onClick={() => void onVerify()}>
            Verify
          </button>
        </div>
      </section>

      {result ? (
        <section className="surface overflow-hidden">
          <header className="flex items-center justify-between border-b border-stone-200 px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <span className={result.verified ? 'chip-emerald' : 'chip-rose'}>
                {result.verified ? 'Verified' : 'Rejected'}
              </span>
              {result.reason ? (
                <span className="text-2xs text-stone-500">{result.reason}</span>
              ) : null}
            </div>
            <button className="btn-link text-2xs" onClick={() => setResult(null)}>
              Close
            </button>
          </header>
          <pre className="overflow-auto bg-stone-950 p-4 text-2xs leading-relaxed text-stone-100">
            {JSON.stringify(result, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
