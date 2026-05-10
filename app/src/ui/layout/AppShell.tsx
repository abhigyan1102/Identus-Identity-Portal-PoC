import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAgent } from '@ui/AgentProvider';
import { useWallet } from '@ui/WalletProvider';
import { ModeStatus } from '@ui/components/ModeStatus';
import { shorten } from '@identus/portal-core';

const NAV = [
  { to: '/', label: 'Overview', end: true },
  { to: '/dids', label: 'DIDs' },
  { to: '/connections', label: 'Connections' },
  { to: '/credentials', label: 'Credentials' },
  { to: '/verify', label: 'Verify' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { mode, ready, cloudLive, endpoint } = useAgent();
  const { connectedName, address } = useWallet();

  return (
    <div className="flex min-h-full">
      <aside className="hidden w-56 shrink-0 border-r border-stone-200 bg-white px-3 py-5 lg:block">
        <div className="mb-7 flex items-center gap-2 px-2">
          <Monogram />
          <div className="leading-tight">
            <div className="text-[13px] font-semibold tracking-tightish">Identus</div>
            <div className="text-2xs text-stone-500">Identity Portal</div>
          </div>
        </div>

        <nav className="space-y-0.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] transition ${
                  isActive
                    ? 'bg-stone-100 font-medium text-stone-900'
                    : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'
                }`
              }
            >
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-6 border-t border-stone-100 pt-4">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] ${
                isActive
                  ? 'bg-stone-100 font-medium text-stone-900'
                  : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'
              }`
            }
          >
            Settings
          </NavLink>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-stone-200 bg-white/80 px-6 py-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3 text-2xs">
            <ModeStatus mode={mode} live={cloudLive} ready={ready} />
            {mode === 'cloud' && endpoint ? (
              <span className="hidden truncate text-stone-500 md:inline">{endpoint}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-2xs">
            {connectedName ? (
              <span className="inline-flex items-center gap-2 rounded-md bg-stone-100 px-2 py-1 text-stone-700">
                <span className="dot bg-emerald-500" />
                {connectedName}
                {address ? (
                  <span className="mono text-stone-500">{shorten(address, 8, 6)}</span>
                ) : null}
              </span>
            ) : (
              <span className="text-stone-400">No wallet connected</span>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function Monogram() {
  return (
    <div className="grid h-7 w-7 place-items-center rounded-md border border-stone-300 bg-stone-900 text-[11px] font-semibold text-stone-50">
      Id
    </div>
  );
}
