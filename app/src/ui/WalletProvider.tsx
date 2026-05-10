import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { MeshCip30Wallet } from '@adapters/wallet/MeshCip30Wallet';
import type { InstalledWallet } from '@identus/portal-core';

interface WalletContextValue {
  wallet: MeshCip30Wallet;
  installed: InstalledWallet[];
  connectedName: string | null;
  address: string | null;
  networkId: number | null;
  connect: (name: string) => Promise<void>;
  disconnect: () => Promise<void>;
  refreshInstalled: () => void;
  error: string | null;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const wallet = useMemo(() => new MeshCip30Wallet(), []);
  const [installed, setInstalled] = useState<InstalledWallet[]>(() => MeshCip30Wallet.listInstalled());
  const [connectedName, setConnectedName] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [networkId, setNetworkId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshInstalled = useCallback(() => {
    setInstalled(MeshCip30Wallet.listInstalled());
  }, []);

  const connect = useCallback(
    async (name: string) => {
      setError(null);
      try {
        await wallet.connect(name);
        setConnectedName(wallet.getName());
        setAddress(await wallet.getChangeAddress());
        setNetworkId(await wallet.getNetworkId());
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [wallet],
  );

  const disconnect = useCallback(async () => {
    await wallet.disconnect();
    setConnectedName(null);
    setAddress(null);
    setNetworkId(null);
  }, [wallet]);

  const value = useMemo<WalletContextValue>(
    () => ({
      wallet,
      installed,
      connectedName,
      address,
      networkId,
      connect,
      disconnect,
      refreshInstalled,
      error,
    }),
    [wallet, installed, connectedName, address, networkId, connect, disconnect, refreshInstalled, error],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within <WalletProvider>');
  return ctx;
}
