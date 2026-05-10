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

export class CloudAgentAdapter implements IAgent {
  readonly mode = 'cloud' as const;

  private ready = false;
  private dids = new Map<string, DIDRecord>();
  private connections = new Map<string, ConnectionRecord>();
  private credentials = new Map<string, CredentialRecord>();
  private liveBackend = false;

  constructor(
    public readonly endpoint: string,
    private readonly apiKey?: string,
  ) {}

  async start(): Promise<void> {
    if (this.ready) return;
    this.liveBackend = await this.ping();
    this.ready = true;
  }

  async stop(): Promise<void> {
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }

  isLive(): boolean {
    return this.liveBackend;
  }

  async createDID(options: CreateDIDOptions = {}): Promise<DIDRecord> {
    this.assertReady();
    if (this.liveBackend) {
      const res = await this.request<{ longFormDid: string }>('POST', '/did-registrar/dids', {
        documentTemplate: {
          publicKeys: [{ id: 'auth-1', purpose: 'authentication' }],
          services: [],
        },
      });
      const record: DIDRecord = {
        did: res.longFormDid,
        method: 'prism',
        alias: options.alias,
        status: 'unpublished',
        createdAt: Date.now(),
      };
      this.dids.set(record.did, record);
      return record;
    }
    const record: DIDRecord = {
      did: `did:prism:${uid()}`,
      method: 'prism',
      alias: options.alias,
      status: 'unpublished',
      createdAt: Date.now(),
    };
    this.dids.set(record.did, record);
    return record;
  }

  async listDIDs(): Promise<DIDRecord[]> {
    if (this.liveBackend) {
      const res = await this.request<{ contents: Array<{ did: string; status: string }> }>(
        'GET',
        '/did-registrar/dids',
      );
      return res.contents.map((row) => ({
        did: row.did,
        method: 'prism',
        status: row.status === 'PUBLISHED' ? 'published' : 'unpublished',
        createdAt: Date.now(),
      }));
    }
    return [...this.dids.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  async resolveDID(did: string): Promise<DIDDocument> {
    if (this.liveBackend) {
      return this.request<DIDDocument>('GET', `/dids/${encodeURIComponent(did)}`);
    }
    return {
      id: did,
      controller: did,
      verificationMethod: [
        {
          id: `${did}#key-1`,
          type: 'JsonWebKey2020',
          controller: did,
          publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: 'cloud-demo' },
        },
      ],
      authentication: [`${did}#key-1`],
    };
  }

  async publishDID(did: string): Promise<DIDRecord> {
    const existing = this.dids.get(did);
    if (this.liveBackend) {
      await this.request('POST', `/did-registrar/dids/${encodeURIComponent(did)}/publications`);
    }
    const updated: DIDRecord = {
      ...(existing ?? {
        did,
        method: 'prism',
        status: 'unpublished',
        createdAt: Date.now(),
      }),
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

  async createInvitation(label = 'Cloud Agent'): Promise<OOBInvitation> {
    const id = uid('oob');
    const url = `${this.endpoint.replace(/\/$/, '')}/invitations/${id}`;
    return { id, url, label };
  }

  async acceptInvitation(url: string): Promise<ConnectionRecord> {
    const record: ConnectionRecord = {
      id: uid('conn'),
      label: 'Cloud connection',
      myDid: 'did:prism:cloud-demo',
      theirDid: 'did:peer:remote',
      state: 'completed',
      createdAt: Date.now(),
    };
    this.connections.set(record.id, record);
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
    };
  }

  private async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.endpoint.replace(/\/$/, '')}/_system/health`, {
        method: 'GET',
        headers: this.headers(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.endpoint.replace(/\/$/, '')}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...this.headers(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Cloud Agent ${method} ${path} failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  }

  private headers(): Record<string, string> {
    return this.apiKey ? { apikey: this.apiKey } : {};
  }

  private assertReady(): void {
    if (!this.ready) throw new Error('CloudAgentAdapter not started');
  }
}
