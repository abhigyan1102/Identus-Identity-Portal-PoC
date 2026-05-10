import type {
  ConnectionRecord,
  CreateDIDOptions,
  CredentialRecord,
  DIDDocument,
  DIDRecord,
  IAgent,
  OOBInvitation,
  PresentationRequest,
  PresentationResult,
} from '@identus/portal-core';
import { uid } from '@identus/portal-core';

export class EdgeAgentAdapter implements IAgent {
  readonly mode = 'edge' as const;
  readonly endpoint = undefined;

  private ready = false;
  private dids = new Map<string, DIDRecord>();
  private connections = new Map<string, ConnectionRecord>();
  private credentials = new Map<string, CredentialRecord>();

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

  async stop(): Promise<void> {
    this.ready = false;
    this.sdk = null;
  }

  isReady(): boolean {
    return this.ready;
  }

  async createDID(options: CreateDIDOptions = {}): Promise<DIDRecord> {
    this.assertReady();
    const method = options.method ?? 'prism';
    const id = uid('did');
    const record: DIDRecord = {
      did: `did:${method}:${id}`,
      method,
      alias: options.alias,
      status: options.publish ? 'publishing' : 'unpublished',
      createdAt: Date.now(),
    };
    this.dids.set(record.did, record);
    return record;
  }

  async listDIDs(): Promise<DIDRecord[]> {
    return [...this.dids.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  async resolveDID(did: string): Promise<DIDDocument> {
    return {
      id: did,
      controller: did,
      verificationMethod: [
        {
          id: `${did}#key-1`,
          type: 'JsonWebKey2020',
          controller: did,
          publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: 'demo' },
        },
      ],
      authentication: [`${did}#key-1`],
      assertionMethod: [`${did}#key-1`],
      service: [
        {
          id: `${did}#didcomm-1`,
          type: 'DIDCommMessaging',
          serviceEndpoint: 'https://mediator.identus.io',
        },
      ],
    };
  }

  async publishDID(did: string): Promise<DIDRecord> {
    const existing = this.dids.get(did);
    if (!existing) throw new Error(`Unknown DID ${did}`);
    const updated: DIDRecord = {
      ...existing,
      status: 'published',
      publishTxHash: `tx_${uid()}`,
    };
    this.dids.set(did, updated);
    return updated;
  }

  async deactivateDID(did: string): Promise<DIDRecord> {
    const existing = this.dids.get(did);
    if (!existing) throw new Error(`Unknown DID ${did}`);
    const updated: DIDRecord = { ...existing, status: 'deactivated' };
    this.dids.set(did, updated);
    return updated;
  }

  async listConnections(): Promise<ConnectionRecord[]> {
    return [...this.connections.values()];
  }

  async createInvitation(label = 'Edge Agent'): Promise<OOBInvitation> {
    const id = uid('oob');
    const url = `didcomm://oob?id=${id}&label=${encodeURIComponent(label)}`;
    const record: ConnectionRecord = {
      id,
      label,
      myDid: [...this.dids.keys()][0] ?? 'did:peer:demo',
      state: 'invitation-sent',
      createdAt: Date.now(),
    };
    this.connections.set(id, record);
    return { id, url, label, goal: 'establish-connection' };
  }

  async acceptInvitation(url: string): Promise<ConnectionRecord> {
    const id = uid('conn');
    const record: ConnectionRecord = {
      id,
      label: `Inbound ${id.slice(-4)}`,
      myDid: [...this.dids.keys()][0] ?? 'did:peer:demo',
      theirDid: `did:peer:remote-${id.slice(-4)}`,
      state: 'completed',
      createdAt: Date.now(),
    };
    this.connections.set(id, record);
    void url;
    return record;
  }

  async listCredentials(): Promise<CredentialRecord[]> {
    return [...this.credentials.values()];
  }

  async issueCredential(input: {
    issuerDid: string;
    subjectDid: string;
    schemaId?: string;
    claims: Record<string, unknown>;
    format?: CredentialRecord['format'];
  }): Promise<CredentialRecord> {
    const record: CredentialRecord = {
      id: uid('vc'),
      format: input.format ?? 'jwt',
      issuerDid: input.issuerDid,
      subjectDid: input.subjectDid,
      schemaId: input.schemaId,
      claims: input.claims,
      issuedAt: Date.now(),
    };
    this.credentials.set(record.id, record);
    return record;
  }

  async verifyPresentation(
    input: PresentationRequest,
    presentation: string,
  ): Promise<PresentationResult> {
    return {
      requestId: input.id,
      presented: presentation.length > 0,
      verified: presentation.length > 0,
      reason: presentation.length === 0 ? 'empty presentation' : undefined,
    };
  }

  private assertReady(): void {
    if (!this.ready) throw new Error('EdgeAgentAdapter not started');
  }
}
