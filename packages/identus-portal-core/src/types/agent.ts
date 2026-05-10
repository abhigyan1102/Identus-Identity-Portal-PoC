export type AgentMode = 'edge' | 'cloud';

export type DIDMethod = 'prism' | 'peer' | 'key' | 'web';

export type DIDStatus = 'unpublished' | 'publishing' | 'published' | 'deactivated';

export interface DIDRecord {
  did: string;
  method: DIDMethod;
  alias?: string;
  status: DIDStatus;
  createdAt: number;
  publishTxHash?: string;
}

export interface DIDDocument {
  id: string;
  controller?: string | string[];
  verificationMethod?: VerificationMethod[];
  authentication?: Array<string | VerificationMethod>;
  assertionMethod?: Array<string | VerificationMethod>;
  keyAgreement?: Array<string | VerificationMethod>;
  service?: ServiceEndpoint[];
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase?: string;
  publicKeyJwk?: Record<string, unknown>;
}

export interface ServiceEndpoint {
  id: string;
  type: string | string[];
  serviceEndpoint: string | string[] | Record<string, unknown>;
}

export type CredentialFormat = 'jwt' | 'sd-jwt' | 'anoncreds' | 'w3c-ld';

export interface CredentialRecord {
  id: string;
  format: CredentialFormat;
  issuerDid: string;
  subjectDid: string;
  schemaId?: string;
  claims: Record<string, unknown>;
  issuedAt: number;
  expiresAt?: number;
  revoked?: boolean;
  raw?: string;
}

export interface ConnectionRecord {
  id: string;
  label: string;
  myDid: string;
  theirDid?: string;
  state: 'invitation-sent' | 'invitation-received' | 'request-sent' | 'completed' | 'abandoned';
  createdAt: number;
}

export interface OOBInvitation {
  id: string;
  url: string;
  label?: string;
  goal?: string;
}

export interface PresentationRequest {
  id: string;
  verifierDid: string;
  schemaId?: string;
  claims: string[];
  challenge: string;
}

export interface PresentationResult {
  requestId: string;
  presented: boolean;
  verified: boolean;
  reason?: string;
}

export interface CreateDIDOptions {
  alias?: string;
  method?: DIDMethod;
  publish?: boolean;
}

export interface IAgent {
  readonly mode: AgentMode;
  readonly endpoint?: string;

  start(): Promise<void>;
  stop(): Promise<void>;
  isReady(): boolean;

  createDID(options?: CreateDIDOptions): Promise<DIDRecord>;
  listDIDs(): Promise<DIDRecord[]>;
  resolveDID(did: string): Promise<DIDDocument>;
  publishDID(did: string): Promise<DIDRecord>;
  deactivateDID(did: string): Promise<DIDRecord>;

  listConnections(): Promise<ConnectionRecord[]>;
  createInvitation(label?: string): Promise<OOBInvitation>;
  acceptInvitation(url: string): Promise<ConnectionRecord>;

  listCredentials(): Promise<CredentialRecord[]>;
  issueCredential(input: {
    issuerDid: string;
    subjectDid: string;
    schemaId?: string;
    claims: Record<string, unknown>;
    format?: CredentialFormat;
  }): Promise<CredentialRecord>;
  verifyPresentation(input: PresentationRequest, presentation: string): Promise<PresentationResult>;
}
