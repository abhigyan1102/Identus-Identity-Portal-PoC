import type { ICardanoWallet, InstalledWallet } from '@identus/portal-core';

export class MeshCip30Wallet implements ICardanoWallet {
  private wallet: unknown = null;
  private name: string | null = null;

  isAvailable(): boolean {
    if (typeof window === 'undefined') return false;
    const cardano = (window as unknown as { cardano?: Record<string, unknown> }).cardano;
    return Boolean(cardano && Object.keys(cardano).length > 0);
  }

  isConnected(): boolean {
    return this.wallet !== null;
  }

  getName(): string | null {
    return this.name;
  }

  static listInstalled(): InstalledWallet[] {
    if (typeof window === 'undefined') return [];
    const cardano =
      (window as unknown as { cardano?: Record<string, { name?: string; icon?: string; apiVersion?: string }> })
        .cardano ?? {};
    return Object.entries(cardano)
      .filter(([key]) => key !== 'enable')
      .map(([key, w]) => ({
        name: w?.name ?? key,
        icon: w?.icon,
        version: w?.apiVersion,
      }));
  }

  async connect(walletName: string): Promise<void> {
    const mesh = await import('@meshsdk/core').catch(() => null);
    if (!mesh) {
      throw new Error('MeshSDK could not be loaded in this environment.');
    }
    const { BrowserWallet } = mesh as unknown as {
      BrowserWallet: { enable: (name: string) => Promise<unknown> };
    };
    this.wallet = await BrowserWallet.enable(walletName);
    this.name = walletName;
  }

  async disconnect(): Promise<void> {
    this.wallet = null;
    this.name = null;
  }

  async getNetworkId(): Promise<number | null> {
    const w = this.wallet as { getNetworkId?: () => Promise<number> } | null;
    if (!w?.getNetworkId) return null;
    return w.getNetworkId();
  }

  async getChangeAddress(): Promise<string | null> {
    const w = this.wallet as { getChangeAddress?: () => Promise<string> } | null;
    if (!w?.getChangeAddress) return null;
    return w.getChangeAddress();
  }

  async signData(payloadHex: string): Promise<{ signature: string; key: string }> {
    const w = this.wallet as {
      signData?: (addr: string, payload: string) => Promise<{ signature: string; key: string }>;
      getChangeAddress?: () => Promise<string>;
    } | null;
    if (!w?.signData || !w.getChangeAddress) {
      throw new Error('Wallet does not support signData (CIP-30).');
    }
    const addr = await w.getChangeAddress();
    return w.signData(addr, payloadHex);
  }
}
