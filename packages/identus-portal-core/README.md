# @identus/portal-core

Framework-agnostic SSI domain layer for the Hyperledger Identus Identity
Portal. Pure TypeScript — no React, no Identus SDK, no MeshSDK imports.

## What lives here

| Module | Purpose |
|---|---|
| `IAgent` | Unified contract that both the Edge Agent (browser SDK) and Cloud Agent (REST) implement. UI code never branches on mode — it depends only on this interface. |
| `ICardanoWallet` | CIP-30 wallet abstraction. The portal's MeshSDK adapter implements it; downstream consumers can swap in any other CIP-30 lib. |
| Domain types | `DIDRecord`, `DIDDocument`, `CredentialRecord`, `ConnectionRecord`, `OOBInvitation`, `PresentationRequest`, `PresentationResult`, etc. |
| Utilities | `uid`, `shorten`, `bytesToHex`, `hexToBytes`, `utf8ToHex`. |

## Why a separate package

The mentorship brief calls for "reusable, framework-agnostic TypeScript code
for SSI workflows" that can be lifted into "React Native, custom dApps, or
wallet extensions." Keeping the contract in its own workspace package
enforces that boundary: nothing here imports React or any heavy SDK, so it
stays portable.

## Consumption

In a workspace consumer:

```ts
import type { IAgent, DIDRecord } from '@identus/portal-core';
```

For tests:

```ts
import { uid } from '@identus/portal-core';
```
