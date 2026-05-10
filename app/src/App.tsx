import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AgentProvider } from '@ui/AgentProvider';
import { WalletProvider } from '@ui/WalletProvider';
import { AppShell } from '@ui/layout/AppShell';
import { OverviewPage } from '@ui/pages/OverviewPage';
import { DIDsPage } from '@ui/pages/DIDsPage';
import { ConnectionsPage } from '@ui/pages/ConnectionsPage';
import { CredentialsPage } from '@ui/pages/CredentialsPage';
import { VerifyPage } from '@ui/pages/VerifyPage';
import { SettingsPage } from '@ui/pages/SettingsPage';

export function App() {
  return (
    <BrowserRouter>
      <AgentProvider>
        <WalletProvider>
          <AppShell>
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/dids" element={<DIDsPage />} />
              <Route path="/connections" element={<ConnectionsPage />} />
              <Route path="/credentials" element={<CredentialsPage />} />
              <Route path="/verify" element={<VerifyPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </AppShell>
        </WalletProvider>
      </AgentProvider>
    </BrowserRouter>
  );
}
