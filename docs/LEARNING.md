# Learning guide — Identus Identity Portal

This is a long-form walk-through of the portal: the SSI ideas it sits on, the Hyperledger Identus pieces it talks to, every architectural decision in the codebase, and the open design question at the end. Read it top to bottom and you'll know the codebase as well as I do.

If you're new to self-sovereign identity, start at Part 1. If you already know SSI, skip to Part 3.

---

## Contents

1. [What problem are we solving?](#1-what-problem-are-we-solving)
2. [The SSI primitives — DIDs, VCs, DIDComm](#2-the-ssi-primitives--dids-vcs-didcomm)
3. [Where Hyperledger Identus fits](#3-where-hyperledger-identus-fits)
4. [The portal's architecture](#4-the-portals-architecture)
5. [Reading the code, layer by layer](#5-reading-the-code-layer-by-layer)
6. [Build and runtime concerns](#6-build-and-runtime-concerns)
7. [The CIP-30 ↔ PRISM design question, in detail](#7-the-cip-30--prism-design-question-in-detail)
8. [How to extend it](#8-how-to-extend-it)
9. [Glossary](#9-glossary)
10. [Further reading](#10-further-reading)

---

## 1. What problem are we solving?

Today, your "identity" online is whatever Google, Meta, your bank, and your government say it is. Each of them keeps their own database of you. To prove anything (your age, your degree, your employment) you usually go *back to the issuer* and ask them to vouch for you, often by logging in to a portal they control.

This is called **custodial** identity — somebody else holds the proof. It has three big problems:

- **Privacy**: every check leaks more than necessary. To prove you're over 18 you might hand over your full date of birth and a face scan.
- **Lock-in**: you can't take your "I work at Acme" credential and use it on a platform Acme didn't pre-integrate with.
- **Single points of failure**: when the issuer goes down, or revokes your account, or rotates an API, your ability to prove things goes with it.

**Self-sovereign identity (SSI)** is a different model: the holder (you) keeps the credential. Issuers sign claims about you and hand them to you to keep. When a verifier asks for proof, you present the signed claim — directly to them, with no callback to the issuer. The verifier checks the issuer's signature against a public key they can look up, and that's the whole protocol.

The three roles to remember:

```
        ┌─── signs claims about you ──→  ┌────────┐
┌────────┐                                │        │
│ Issuer │                                │ Holder │ ← keeps the credentials
└────────┘                                │  (you) │
        ↑                                  └────────┘
        │  trusts                              │
        │                       presents proof │
        │                                      ↓
        └─────────────────────────────── ┌──────────┐
                                          │ Verifier │
                                          └──────────┘
```

The **issuer** signs. The **holder** keeps. The **verifier** checks. The verifier never has to call the issuer at presentation time — it just verifies the signature against the issuer's public key, which they got at some point earlier.

That's it. Everything else is plumbing to make this work cryptographically and at scale.

---

## 2. The SSI primitives — DIDs, VCs, DIDComm

Three building blocks. Each one has its own W3C / IETF specs, but you only need the working understanding.

### 2.1 DIDs — Decentralized Identifiers

A DID is just a URI that points to a public-key-and-services document. It looks like:

```
did:prism:abc123…
did:web:example.com
did:key:z6Mk…
did:peer:2.Ez6Ls…
```

The part between the second and third colons is the **method** — the rules for how to resolve it to a DID document. Different methods have different trust assumptions:

- `did:web` — resolves to `https://example.com/.well-known/did.json`. As trustworthy as the website's TLS.
- `did:key` — the DID literally encodes the public key. Self-contained, no resolution needed, no rotation possible.
- `did:peer` — for direct peer connections (e.g. DIDComm handshakes). Not anchored anywhere globally.
- `did:prism` — Hyperledger Identus' own method; anchored on Cardano. We'll come back to this.

A **DID document** is what you get back when you resolve a DID. It looks roughly like this:

```json
{
  "id": "did:prism:abc123",
  "verificationMethod": [{
    "id": "did:prism:abc123#key-1",
    "type": "JsonWebKey2020",
    "controller": "did:prism:abc123",
    "publicKeyJwk": { "kty": "OKP", "crv": "Ed25519", "x": "..." }
  }],
  "authentication": ["did:prism:abc123#key-1"],
  "service": [{
    "id": "did:prism:abc123#didcomm-1",
    "type": "DIDCommMessaging",
    "serviceEndpoint": "https://mediator.example/abc123"
  }]
}
```

Two parts matter for SSI: the **public keys** (used to verify anything signed with this DID) and the **service endpoints** (where to send DIDComm messages, mostly).

The portal's `DIDDocument` type at [`packages/identus-portal-core/src/types/agent.ts`](../packages/identus-portal-core/src/types/agent.ts) is a TypeScript shape of exactly this.

### 2.2 VCs — Verifiable Credentials

A VC is a signed statement of the form *"issuer X says these claims about subject Y."* The issuer's signature is what makes it verifiable; the issuer's DID is what the verifier looks up to check the signature.

There are several wire formats, and the choice has big consequences:

- **JWT-VC** — claims encoded in a JSON Web Token. Simple, small, every dev knows JWT. Privacy weakness: presentation is all-or-nothing — you reveal every claim in the credential.
- **SD-JWT** — Selective Disclosure JWT. The credential commits to each claim individually so the holder can present a subset. "Show your name and age, hide your address" without re-issuance.
- **AnonCreds** — designed by Hyperledger, supports zero-knowledge presentations and unlinkable proofs across verifiers. Heavier on cryptography, less interoperable, much better privacy.
- **W3C VC-LD** — JSON-LD with Linked Data Proofs. Maximum interoperability, more verbose, less ecosystem support than JWT formats.

The portal's `CredentialFormat` union type lists all four. The adapters store the raw format alongside the parsed claims so verifiers know which scheme to apply.

### 2.3 DIDComm — encrypted messaging between DIDs

When the issuer wants to deliver a credential to the holder, or the verifier wants to ask the holder for a proof, they don't email each other. They use DIDComm v2 — an encrypted, asynchronous, DID-addressed messaging protocol.

The mental model: **DIDComm is to DIDs what email is to email addresses, except every message is end-to-end encrypted to the recipient's DID-listed key.**

Two flow patterns matter:

1. **Out-of-Band (OOB) invitations.** When two parties have never met, they need a way to bootstrap. One side generates an invitation URL containing their DID and a one-time key, the other scans it (typically via QR code), and they exchange initial messages. The portal's Connections page does exactly this — generate an OOB URL, render it as a QR.

2. **Mediators.** Mobile holders aren't reachable on a public address — they're behind NATs, asleep, or offline. A *mediator* is a public DIDComm relay that holds messages on the holder's behalf until their wallet wakes up and pulls them. Hyperledger Identus ships a Mediator service for exactly this.

You don't strictly need to read the DIDComm v2 spec to use this codebase, but skim its [Concepts](https://identity.foundation/didcomm-messaging/spec/) page once if you've never seen it. The takeaway: **encrypted envelopes, addressed to DIDs, relayed through mediators.**

---

## 3. Where Hyperledger Identus fits

Identus is one of the big-three open-source SSI platforms (alongside Hyperledger Aries and a Sovrin-derived ecosystem). It came from IOG's PRISM project and is now under the LF Decentralized Trust umbrella.

### 3.1 What Identus actually is

A set of independent services and SDKs that you compose:

- **Cloud Agent** — a Scala backend (in [`repos/cloud-agent`](../repos/cloud-agent)) that runs all SSI roles for you over a REST API. Issuer-as-a-service, basically. Custodial: it holds the keys.
- **Mediator** — a separate service that relays DIDComm messages. Stateless from the user's POV.
- **Edge Agent SDKs** — TypeScript ([`repos/sdk-ts`](../repos/sdk-ts)), Swift, and Kotlin Multiplatform. Run inside an end-user's app or browser. **Non-custodial**: the user holds the keys.
- **Internal modules** — Apollo (cryptography), Castor (DIDs), Pluto (storage), Mercury (DIDComm), Pollux (VCs). The SDK exposes them under one `Agent` umbrella.

The two SDKs from the portal's perspective:

```
              Cloud Agent (REST)         Edge Agent (SDK in browser)
              ──────────────────         ────────────────────────────
Holds keys?   yes — backend                no — user's device only
Persistence?  Postgres                     IndexedDB (Pluto)
Trust model?  custodial                    self-custody
DID method?   PRISM, peer                  PRISM, peer
Talks to?     Mediator + Cardano L1        Mediator + Cardano L1
```

### 3.2 The PRISM DID method

`did:prism:…` is Identus' DID method, anchored on **Cardano L1**. The full picture:

1. To **create** a PRISM DID you generate a key pair locally and construct a `CreateDID` operation that lists your public key + initial services.
2. To **publish** that DID, the operation goes into a Cardano transaction's metadata field. Once the tx confirms on-chain, the DID is public and resolvable globally.
3. To **resolve** a PRISM DID, a node walks the chain, finds the create operation, then applies any subsequent update / deactivate operations in order to compute the current DID document.
4. **Updates and deactivations** are themselves operations — every change is a new tx with the new operation in metadata.

Two ways to publish in practice:

- Run an **Identus node** (or use a hosted one like Neoprism) and let it pay for and submit txs.
- Use a **CIP-30 wallet** in the user's browser — they pay, they submit, they retain control.

The portal's offline mode aims at the second path. That's why MeshSDK is in the dependency tree.

The key thing to internalize: **a PRISM DID is just a sequence of Cardano transactions interpreted in a specific way.** No new chain, no separate ledger, no consensus to worry about. Cardano provides ordering and immutability; PRISM provides the operation grammar.

### 3.3 Where the portal sits

Identus has good backends and good SDKs but no first-party UI. The portal is meant to be:

- A reference dashboard for both custodial and non-custodial flows.
- A demo of how the pieces compose without baking in vendor choices.
- The framework-agnostic core (`@identus/portal-core`) gets reused in React Native, dApps, and wallet extensions.

---

## 4. The portal's architecture

One sentence: **all of the SSI logic hides behind a single interface called `IAgent`, and everything else is layered around that.**

### 4.1 The contract

[`packages/identus-portal-core/src/types/agent.ts`](../packages/identus-portal-core/src/types/agent.ts) defines `IAgent`:

```ts
export interface IAgent {
  readonly mode: 'edge' | 'cloud';

  start(): Promise<void>;
  stop(): Promise<void>;
  isReady(): boolean;

  createDID(options?: CreateDIDOptions): Promise<DIDRecord>;
  resolveDID(did: string): Promise<DIDDocument>;
  publishDID(did: string): Promise<DIDRecord>;
  // …connections, credentials, verification
}
```

If you understand this interface, you understand the entire portal. Everything else is implementation.

### 4.2 The three layers

```
                            ┌────────────────────────────────┐
   UI                       │     React 18 + Tailwind        │
   (app/src/ui)             │     pages, components          │
                            └────────────────┬───────────────┘
                                             │ depends on IAgent only
                            ┌────────────────┴───────────────┐
   Adapters                 │  EdgeAgentAdapter              │
   (app/src/adapters)       │  CloudAgentAdapter             │
                            │  MeshCip30Wallet               │
                            └────────────────┬───────────────┘
                                             │ implements
                            ┌────────────────┴───────────────┐
   Core (pure TS)           │     IAgent, ICardanoWallet     │
   (packages/…-core)        │     domain types, utils        │
                            └────────────────────────────────┘
```

Three rules govern this layout:

1. **Core never imports UI or adapters.** It's plain TypeScript with no React, no SDK, no wallet libs. You can publish it as an npm package, drop it in a React Native app, or use it in a CLI tool.
2. **Adapters never import each other.** `EdgeAgentAdapter` and `CloudAgentAdapter` know nothing about each other. Each just implements `IAgent`.
3. **UI never branches on mode.** No `if (mode === 'cloud')` anywhere. The component calls `agent.X()` and that's it.

These rules are the entire architectural value of the project. Every other decision serves them.

### 4.3 Why this matters

You can swap implementations at any layer:

- Replace MeshSDK with `@cardano-foundation/cip30-toolkit`? Update `MeshCip30Wallet`. Done.
- Add a third agent mode (say, a remote SDK in a service worker)? New adapter implementing `IAgent`. UI doesn't change.
- Build a React Native wallet using the same domain logic? Import `@identus/portal-core` and write a new UI on top.

This is what the brief means by "maximal reusability" and "minimal vendor lock-in."

### 4.4 Why npm workspaces

The repo is a monorepo with two workspaces — `app` and `packages/identus-portal-core` — coordinated through the root [`package.json`](../package.json):

```jsonc
{
  "workspaces": ["app", "packages/*"]
}
```

When you `npm install` from the root, npm symlinks `node_modules/@identus/portal-core → packages/identus-portal-core`. The app imports from the package name (`import { IAgent } from '@identus/portal-core'`), not from a relative path. The boundary is enforced by the package boundary itself — you literally cannot reach into `core/internal/foo`, because there is no internal/foo, only what the package exports.

If you ever lift `@identus/portal-core` into its own repo or publish it to npm, **nothing in the app changes**.

---

## 5. Reading the code, layer by layer

This is the long section. We'll start at the deepest layer (core) and work up to the UI.

### 5.1 `@identus/portal-core` — the contract

#### `types/agent.ts`

Six categories of types, each one mirroring an SSI concept:

- **`AgentMode` / `DIDMethod` / `DIDStatus`** — string unions for state machines.
- **`DIDRecord`** — what the agent stores about a DID it owns: the DID URI, alias, status, when it was created, the Cardano tx hash if it was anchored.
- **`DIDDocument` / `VerificationMethod` / `ServiceEndpoint`** — W3C DID-core shape, simplified.
- **`CredentialFormat` / `CredentialRecord`** — agnostic to format. Stores `claims` parsed and `raw` for the encoded form.
- **`ConnectionRecord` / `OOBInvitation`** — DIDComm bookkeeping.
- **`PresentationRequest` / `PresentationResult`** — verifier-side flow.

Then `IAgent` itself: lifecycle methods (`start`, `stop`, `isReady`), then DID lifecycle, connections, credentials, and verification.

The shapes deliberately don't match the Identus SDK's internal types one-to-one. They're the *minimum* a UI needs. Adapters are expected to translate to and from richer SDK types.

#### `types/wallet.ts`

```ts
export interface ICardanoWallet {
  isAvailable(): boolean;
  isConnected(): boolean;
  getName(): string | null;
  getNetworkId(): Promise<number | null>;
  getChangeAddress(): Promise<string | null>;
  signData(payloadHex: string): Promise<{ signature: string; key: string }>;
}
```

Six methods, all framework-agnostic. `signData` is the load-bearing one for PRISM publishing — though we'll see in Part 7 that what it signs is exactly the wrong thing for PRISM directly.

#### `utils/`

- `uid()` — a thin wrapper over `crypto.randomUUID()` with a fallback for older runtimes.
- `shorten()` — middle-ellipsizes long strings (DIDs are long).
- `bytesToHex` / `hexToBytes` / `utf8ToHex` — Cardano payloads are hex strings; CIP-30 wants hex.

That's the entire core package. ~150 lines of TypeScript, no dependencies.

### 5.2 `EdgeAgentAdapter` — the offline-first path

[`app/src/adapters/edge/EdgeAgentAdapter.ts`](../app/src/adapters/edge/EdgeAgentAdapter.ts).

The shape:

```ts
export class EdgeAgentAdapter implements IAgent {
  readonly mode = 'edge' as const;
  private ready = false;
  private dids = new Map<string, DIDRecord>();
  // ...
  protected sdk: unknown = null;

  async start(): Promise<void> {
    if (this.ready) return;
    try {
      this.sdk = await import('@hyperledger/identus-sdk').catch(() => null);
    } catch {
      this.sdk = null;
    }
    this.ready = true;
  }
  // ...
}
```

Two patterns to notice:

**Lazy SDK import.** The Identus SDK ships WASM modules for AnonCreds and DIDComm, plus protobuf for PRISM operations. That's a multi-megabyte download and several hundred milliseconds of WASM instantiation. If you import it eagerly at the top of the file, two things can go wrong: the bundle blocks longer than necessary on first paint, and a WASM init failure (rare but possible — ad-blockers, restrictive CSPs, ancient browsers) takes the whole app down.

By doing `await import('@hyperledger/identus-sdk').catch(() => null)` inside `start()`, the SDK loads once, asynchronously, with a graceful failure. The rest of the dashboard — including the Cloud Agent path — keeps working even if Edge bring-up fails.

**In-memory `Map` for state.** Today, `this.dids = new Map<string, DIDRecord>()` is the entire persistence layer. Real persistence comes from the SDK's `Pluto` module, which stores keys, DIDs, and credentials in IndexedDB. Replacing the maps with Pluto calls is the single biggest "wire it up for real" task — see Part 8.

Each `IAgent` method is implemented as: build the record, stick it in the map, return it. They're shaped exactly the way the real SDK calls would shape them, so swapping in the real implementation is a localized change.

### 5.3 `CloudAgentAdapter` — the connected path

[`app/src/adapters/cloud/CloudAgentAdapter.ts`](../app/src/adapters/cloud/CloudAgentAdapter.ts).

Same `IAgent` interface, very different mechanics. The constructor takes an HTTP endpoint. `start()` does:

```ts
async start(): Promise<void> {
  if (this.ready) return;
  this.liveBackend = await this.ping();
  this.ready = true;
}

private async ping(): Promise<boolean> {
  try {
    const res = await fetch(`${this.endpoint}/_system/health`, { method: 'GET' });
    return res.ok;
  } catch { return false; }
}
```

Two things going on:

**Health probe on start.** The Cloud Agent exposes `/_system/health`. We hit it once at boot. If it's alive, `liveBackend = true` and every method routes to the real REST API. If it's not (DNS error, CORS issue, agent down), `liveBackend = false` and methods fall back to in-memory mocks identical to the Edge adapter's.

This is why the dashboard is always demoable: if your hotel Wi-Fi blocks your VPN, the connected mode degrades gracefully to a local stub instead of throwing red errors.

**REST surface.** When `liveBackend === true`, methods like `createDID` post to `/did-registrar/dids`, `listDIDs` GETs the same path, etc. The Cloud Agent's full OpenAPI spec is in [`repos/cloud-agent`](../repos/cloud-agent) under `cloud-agent/src/main/resources/http/`. The adapter currently hits only a few endpoints; the rest are stubs ready to be filled in.

### 5.4 `MeshCip30Wallet` — the wallet adapter

[`app/src/adapters/wallet/MeshCip30Wallet.ts`](../app/src/adapters/wallet/MeshCip30Wallet.ts).

CIP-30 is the Cardano standard for wallet–dApp communication in browsers. Browser wallets (Lace, Eternl, Nami, Yoroi, Flint) inject themselves as `window.cardano.<walletName>` with a known API surface: get addresses, sign transactions, sign data, etc.

Two static-ish things and one dynamic:

- `MeshCip30Wallet.listInstalled()` — scans `window.cardano` for installed wallets. Doesn't require user consent (no prompt). Useful for "Connect your wallet" UI.
- `connect(name)` — calls `window.cardano[name].enable()` (via MeshSDK's `BrowserWallet.enable`), which prompts the user. If they approve, you get a wallet handle.
- `signData(payloadHex)` — the CIP-30 method we care about for PRISM. Signs a payload with the wallet's payment key.

MeshSDK is imported lazily — same reason as the Identus SDK, just smaller stakes.

The whole class is a 60-line wrapper. Replacing MeshSDK with another CIP-30 lib (e.g. `cardano-purescript`'s JS bindings) means rewriting this file and nothing else.

### 5.5 React layer — providers, layout, pages

#### `AgentProvider`

[`app/src/ui/AgentProvider.tsx`](../app/src/ui/AgentProvider.tsx) is the single source of truth for which adapter is in use. It's a Context provider that:

1. Reads `VITE_CLOUD_AGENT_API_ENDPOINT` (Vite env var) or `localStorage` for a saved endpoint.
2. Constructs the appropriate adapter (`EdgeAgentAdapter` if no endpoint, `CloudAgentAdapter` otherwise).
3. Calls `agent.start()` and tracks readiness.
4. Exposes `useAgent()` to consumers.

When the user changes the endpoint or switches modes, the provider stops the current agent and bootstraps a new one. State from the previous adapter is dropped, which is fine because everything is in-memory anyway. Once Pluto persistence lands, you'd want to either keep a single agent and reconfigure it, or migrate the in-memory state — but that's a future problem.

The `useEffect(..., [])` empty-deps array is intentional and has an `eslint-disable` line: bootstrap is driven explicitly by the setters, not by reactive deps. Without the disable, ESLint would want us to depend on `mode` and `endpoint`, which would re-bootstrap on every render until the deps stabilize.

#### `WalletProvider`

[`app/src/ui/WalletProvider.tsx`](../app/src/ui/WalletProvider.tsx) is the same pattern for the wallet. Tracks installed wallets, the connected name, address, network ID. `useWallet()` exposes everything.

Crucially: the wallet provider is **independent** of the agent provider. You can run Edge mode without a wallet. You can run Cloud mode with a wallet. They don't know about each other; the DIDs page composes both.

#### `AppShell`

[`app/src/ui/layout/AppShell.tsx`](../app/src/ui/layout/AppShell.tsx) renders the sidebar nav, the header status row, and slots `children` into the main scroll area. Pure presentation — no business logic.

#### Pages

Each page in [`app/src/ui/pages`](../app/src/ui/pages) follows the same shape:

```tsx
export function FooPage() {
  const { agent } = useAgent();
  const [items, setItems] = useState<Foo[]>([]);

  useEffect(() => {
    void agent.listFoo().then(setItems);
  }, [agent]);

  return /* table or form */;
}
```

The `agent` reference is taken from context. The page calls `agent.someMethod()`, awaits the result, renders. **No `if (mode === 'cloud')`.** This is the architectural payoff in action.

---

## 6. Build and runtime concerns

### 6.1 Vite, React 18, TypeScript strict

Vite for fast dev and small config. React 18 (pinned, not 19) because the brief asks for it and because downstream consumers may not be ready for 19's transition semantics.

TypeScript is in strict mode with `noUnusedLocals`, `noUnusedParameters`, etc. There's no implicit `any`; the `protected sdk: unknown = null` field in `EdgeAgentAdapter` exists precisely so we don't leak the SDK's WASM-laden types into the rest of the codebase.

### 6.2 Tailwind, no UI kit

The brief is explicit: no shadcn/ui, no Radix. The components in [`app/src/ui/components`](../app/src/ui/components) are hand-written — `Copyable`, `EmptyState`, `ModeStatus`. Tailwind classes are organized via `@layer components` in [`app/src/index.css`](../app/src/index.css) so we get reusable class names like `btn-primary` and `chip-emerald` without pulling in a kit.

The visual language is intentionally close to Linear/Stripe — stone neutrals, a single near-black for primary actions, small dot-style status indicators. No gradients, no decoration that doesn't carry information.

### 6.3 Node polyfills via Vite plugin

The Identus SDK calls `crypto.webcrypto`, `events`, `stream`, `pbkdf2Sync`, and a handful of other Node built-ins through transitive deps. Browsers don't have these, so Vite would error at build time.

[`vite.config.ts`](../app/vite.config.ts) configures `vite-plugin-node-polyfills`:

```ts
nodePolyfills({
  protocolImports: true,
  globals: { Buffer: true, global: true, process: true },
})
```

This shims the missing built-ins with browser equivalents (or empty modules). It's the single reason the production bundle exists at all.

### 6.4 Bundle size

The biggest chunk is ~6 MB minified, ~2.3 MB gzipped — almost entirely WASM crypto and DIDComm. That's heavy for a web app, but unavoidable for an in-browser SSI agent. Future optimizations:

- Code-split the SDK so it only loads on Edge mode.
- Use `manualChunks` to pull WASM into its own bundle that browsers cache separately.
- Lazy-import per-route so the Verify page doesn't load credential issuance code.

For a POC, the size is fine. For production, it's the first thing to address.

---

## 7. The CIP-30 ↔ PRISM design question, in detail

This is the most interesting open question in the codebase. The README has the short version; here's the full one.

### 7.1 Cardano's key hierarchy

A Cardano wallet derives keys from a seed using **CIP-1852** (HD derivation):

```
m / 1852' / 1815' / account' / role / index
                                ↑
                                0 = payment, 2 = stake, 3 = DRep
```

Every Cardano transaction is signed with a payment key (role 0). Stake delegation uses stake keys (role 2). Voting in Conway era uses DRep keys (role 3). All three live under one seed.

CIP-30, the wallet–dApp interface, exposes:

- `getChangeAddress()` — gives you a payment-key address.
- `signTx(tx)` — signs a constructed transaction with the wallet's payment key.
- `signData(addr, payload)` — signs an arbitrary payload, **also with the payment key bound to that address**.

Important: CIP-30 has no method for signing with a *non-payment* key. The wallet's stake key isn't exposed for arbitrary signing. There is no "sign with my PRISM key" — because PRISM keys aren't part of CIP-1852.

### 7.2 PRISM's key hierarchy

A PRISM DID has its own key hierarchy, defined in the PRISM spec (in [`repos/cloud-agent/prism-node`](../repos/cloud-agent/prism-node)):

- A **master key** that authorizes operations on the DID.
- Optional **issuing**, **revocation**, **authentication**, and **key-agreement** keys for operational separation.

These are independent of any Cardano wallet keys. The Identus SDK's Apollo module generates and manages them. They live in Pluto storage on the holder's device.

### 7.3 Why `signData` doesn't directly publish a PRISM DID

A PRISM `CreateDID` operation is a protobuf-encoded `AtalaOperation` that must be signed with the **master key of the DID being created**. The signature goes inside the operation; the operation goes inside Cardano transaction metadata; the transaction is signed with the **payment key**.

So a real PRISM publish needs **two signatures, two key types**:

```
                   ┌─────── PRISM master key ─────────┐
                   │                                  │
              signs operation                         │
                   │                                  │
                   ↓                                  │
          ┌────────────────┐                          │
          │ AtalaOperation │ ←──────────────┐         │
          └────────────────┘                │         │
                   │                        │         │
              wraps in metadata             │         │
                   │                        │         │
                   ↓                        │         │
          ┌─────────────────────┐          │         │
          │ Cardano tx          │          │         │
          │ ┌──────────────┐    │          │         │
          │ │ metadata 21  │←───┘          │         │
          │ │ (operation)  │               │         │
          │ └──────────────┘               │         │
          └─────────┬───────────┘          │         │
                    │                       │         │
              signs tx body                 │         │
                    │                       │         │
                    └─────── Cardano payment key ─────┘
```

CIP-30 gives us the payment-key signature (the outer one). It cannot give us the PRISM-master signature (the inner one), because the wallet doesn't have a PRISM master key.

So the question is: **where does the PRISM master key live, and who signs the operation with it?**

### 7.4 Path 1 — One seed, two key trees

Define a CIP-1854-style hardened derivation under a dedicated purpose code (the SSI ecosystem hasn't claimed one yet, but a draft would propose something like `1947'`). The wallet would expose a "PRISM signing" API that derives a key from the same seed and signs the operation.

**Pros**:
- Single seed phrase, single backup.
- Keys live in the wallet's secure environment (hardware wallets, encrypted storage).
- Clean UX — user thinks of it as one identity.

**Cons**:
- Requires wallet support that doesn't exist yet. You'd have to ship a CIP draft, get wallet vendors to adopt it, and ship a fallback for wallets that haven't.
- Or: ship a helper extension that wraps an existing CIP-30 wallet and adds the PRISM derivation. Maintenance burden.
- Cross-vendor coordination is slow.

This is the more interesting path long-term but it's not a 2026 deliverable.

### 7.5 Path 2 — Independent PRISM keys, wallet only pays

The agent (browser-side, via Apollo + Pluto) generates PRISM keys independently. They never leave the device. When the user wants to publish, the agent:

1. Signs the `AtalaOperation` with the PRISM master key it controls.
2. Builds a Cardano tx with the operation in metadata.
3. Asks the connected CIP-30 wallet to sign the tx body (paying for it from the user's funds).
4. Submits the signed tx via Blockfrost or Koios.

**Pros**:
- No wallet changes required. Works with every CIP-30 wallet today.
- Mirrors how the Cloud Agent works (it holds PRISM keys; wallets / nodes pay).
- Implementable in a few days once the SDK is wired up.

**Cons**:
- Two backups (seed + PRISM keys, the latter via Pluto's encrypted backup format).
- PRISM keys live in IndexedDB, which is less secure than a wallet's storage (extensions can sandbox; pages share IndexedDB origin-wide).

### 7.6 Recommendation

Ship path 2 first. It gets a real PRISM publish working in weeks, not months, and doesn't depend on cross-org coordination. Path 1 becomes a separate scope — possibly a small wallet extension that adds PRISM signing on top of an existing CIP-30 wallet.

The inline TODO in [`DIDsPage.tsx`](../app/src/ui/pages/DIDsPage.tsx) `onPublish` flags this in the code. The current behavior — a CIP-30 `signData` round-trip that returns a payment-key signature, displayed as a demo notice — proves the wallet integration works end-to-end, even though that signature isn't what a real publish needs.

---

## 8. How to extend it

Five concrete tasks, in roughly increasing difficulty.

### 8.1 Add a new field to `IAgent`

Suppose you want to expose `getDIDsByAlias(alias: string)`.

1. Add the method signature to `IAgent` in [`packages/identus-portal-core/src/types/agent.ts`](../packages/identus-portal-core/src/types/agent.ts).
2. TypeScript will now error in `EdgeAgentAdapter` and `CloudAgentAdapter` because they don't implement it. Good — that's the contract working.
3. Implement it in both. The Edge version filters `this.dids`; the Cloud version calls `GET /did-registrar/dids?alias=…` if live, falls back to the same filter if not.
4. Use it in the UI: `const matches = await agent.getDIDsByAlias('issuer-prod')`.

Total time: 15 minutes. The point is that the contract makes adding things obvious — you can't accidentally implement it on one side and forget the other.

### 8.2 Wire one method to the real Edge SDK

The most valuable next step. Pick `createDID`. The SDK exposes a `Castor` module that creates DIDs:

```ts
import { Apollo, Castor } from '@hyperledger/identus-sdk';

async createDID(options: CreateDIDOptions = {}): Promise<DIDRecord> {
  const apollo = new Apollo();
  const castor = new Castor(apollo);

  const masterKey = await apollo.createPrivateKey({ type: 'EC', curve: 'secp256k1' });
  const did = await castor.createPrismDID(masterKey.publicKey(), []);

  const record: DIDRecord = {
    did: did.toString(),
    method: 'prism',
    alias: options.alias,
    status: 'unpublished',
    createdAt: Date.now(),
  };
  this.dids.set(record.did, record);
  return record;
}
```

(The actual API names may vary by SDK version — read [`repos/sdk-ts/packages/lib/sdk/src/castor`](../repos/sdk-ts/packages/lib/sdk/src/castor) for the truth.)

You'd also want to persist the master key. That's where Pluto comes in — `pluto.storePrivateKey(did, masterKey)`. Once that's wired, restarts preserve DIDs.

### 8.3 Add a new page

Schemas. Identus credentials reference VC schemas (JSON-Schema or AnonCreds schemas). The Cloud Agent has `/schema-registry/schemas` endpoints; the Edge SDK has Pollux schema utilities.

1. Add `listSchemas`, `createSchema` methods to `IAgent`.
2. Implement in both adapters.
3. Create [`app/src/ui/pages/SchemasPage.tsx`](../app/src/ui/pages/) that calls them.
4. Add a route in [`App.tsx`](../app/src/App.tsx).
5. Add a nav item in [`AppShell.tsx`](../app/src/ui/layout/AppShell.tsx).

Same pattern as every existing page.

### 8.4 Write a contract test (Vitest)

The whole point of the unified contract is that one test suite can exercise both adapters:

```ts
// app/test/agent.contract.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { EdgeAgentAdapter } from '@/adapters/edge/EdgeAgentAdapter';
import { CloudAgentAdapter } from '@/adapters/cloud/CloudAgentAdapter';
import type { IAgent } from '@identus/portal-core';

const cases: Array<[string, () => IAgent]> = [
  ['EdgeAgentAdapter', () => new EdgeAgentAdapter()],
  ['CloudAgentAdapter', () => new CloudAgentAdapter('http://invalid.example')],
];

for (const [name, factory] of cases) {
  describe(name, () => {
    let agent: IAgent;
    beforeEach(async () => {
      agent = factory();
      await agent.start();
    });

    it('creates and lists a DID', async () => {
      const created = await agent.createDID({ alias: 'a' });
      const list = await agent.listDIDs();
      expect(list.map((d) => d.did)).toContain(created.did);
    });

    it('resolves a created DID to a document', async () => {
      const { did } = await agent.createDID();
      const doc = await agent.resolveDID(did);
      expect(doc.id).toBe(did);
    });
  });
}
```

Both adapters must pass. If you ever introduce a divergence between Edge and Cloud behavior, this is where it shows up.

### 8.5 Add a third adapter

Suppose someone wants a "remote SDK" mode where SSI runs in a service worker for performance. Easy:

1. Create `app/src/adapters/sw/ServiceWorkerAgentAdapter.ts` that implements `IAgent` by `postMessage`-ing to a worker.
2. Update `AgentProvider`'s `buildAgent` to recognize a third mode.
3. Done.

The UI doesn't change. Tests don't change (just add the new adapter to the cases array). That's the architecture earning its keep.

---

## 9. Glossary

- **Apollo** — Identus' cryptography module.
- **AnonCreds** — Hyperledger's privacy-preserving credential format with ZKPs.
- **Atala / AtalaOperation** — the protobuf-encoded operations PRISM uses on Cardano. Atala is the original IOG project name.
- **Castor** — Identus' DID module. Creates and resolves DIDs.
- **CIP-30** — Cardano dApp–wallet interface standard. Wallets expose `enable`, `signTx`, `signData`, `getChangeAddress`, etc.
- **CIP-1852 / CIP-1854** — Cardano hierarchical key derivation standards. 1852 covers payment/stake; 1854 covers multi-sig.
- **DID** — Decentralized Identifier. A URI plus a method for resolving it to a document.
- **DID document** — JSON-LD doc listing a DID's keys and service endpoints.
- **DIDComm** — encrypted, asynchronous messaging protocol between DIDs. v2 is the current spec.
- **Edge Agent** — an Identus SDK agent running on a user's device (browser, mobile). Non-custodial.
- **Cloud Agent** — Identus' Scala backend. Custodial.
- **Holder** — the entity that holds a credential. Usually the subject.
- **Issuer** — the entity that signs and issues a credential.
- **JWT-VC** — Verifiable Credential as JWT. Simple, ubiquitous, no selective disclosure.
- **LFDT** — Linux Foundation Decentralized Trust. The umbrella for Hyperledger projects post-2024.
- **Mediator** — DIDComm relay for offline / mobile holders.
- **Mercury** — Identus' DIDComm v2 module.
- **OOB** — Out-of-Band. The DIDComm-side protocol for bootstrapping a connection from no shared state.
- **Pluto** — Identus' storage module. IndexedDB-backed in browsers.
- **Pollux** — Identus' VC module. Issue/present/verify credentials.
- **PRISM** — Identus' DID method. `did:prism:…`. Anchored on Cardano L1.
- **SD-JWT** — Selective Disclosure JWT. Lets the holder reveal a subset of claims.
- **SSI** — Self-Sovereign Identity. The holder owns their credentials, not the issuer or platform.
- **VC** — Verifiable Credential.
- **VDR** — Verifiable Data Registry. The substrate where DIDs are anchored. For PRISM, it's Cardano.
- **Verifier** — the entity that checks a presented credential.
- **W3C VC-LD** — Verifiable Credentials in JSON-LD format with Linked Data Proofs.

---

## 10. Further reading

If you want to go deep, in roughly the order I'd read them:

- [W3C Decentralized Identifiers (DIDs) v1.0](https://www.w3.org/TR/did-1.0/) — the DID spec. Skim it once.
- [W3C Verifiable Credentials Data Model 2.0](https://www.w3.org/TR/vc-data-model-2.0/) — the VC spec.
- [DIDComm Messaging v2](https://identity.foundation/didcomm-messaging/spec/) — the Concepts section is enough.
- [Hyperledger Identus docs](https://hyperledger-identus.github.io/docs/) — the platform overview.
- [Identus TypeScript SDK docs](https://hyperledger-identus.github.io/docs/sdk-ts/docs/sdk/) — Apollo, Castor, Pluto, Mercury, Pollux module docs.
- [PRISM DID Method spec](https://github.com/input-output-hk/prism-did-method-spec) — the PRISM-specific operations and resolution rules.
- [CIP-30](https://cips.cardano.org/cip/CIP-30) — Cardano wallet–dApp standard.
- [MeshSDK docs](https://meshjs.dev/) — Cardano wallet integration in JS.
- [LFDT mentorship #77](https://github.com/LF-Decentralized-Trust-Mentorships/mentorship-program/issues/77) — the brief this POC was built against.

You don't need to read all of these to be useful in the codebase. You do need to read the DID spec, the Identus platform overview, and the PRISM spec if you're going to wire things up for real.
