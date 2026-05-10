export interface ICardanoWallet {
  isAvailable(): boolean;
  isConnected(): boolean;
  getName(): string | null;
  getNetworkId(): Promise<number | null>;
  getChangeAddress(): Promise<string | null>;
  signData(payloadHex: string): Promise<{ signature: string; key: string }>;
}

export interface InstalledWallet {
  name: string;
  icon?: string;
  version?: string;
}
