'use client';

import Link from 'next/link';
import type { UserRole } from '@/core/types';
import { BrandShieldIcon, ArrowRightIcon } from './Icons';

export interface ClientUser {
  id: string;
  email: string;
  role: UserRole;
  organizationId: string;
  name: string;
}

interface TopBarProps {
  user: ClientUser | null;
  onLogout?: () => void;
  backHref?: string;
  backLabel?: string;
  breadcrumbCurrent?: string;
}

export function TopBar({
  user,
  onLogout,
  backHref,
  backLabel,
  breadcrumbCurrent,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="row" style={{ gap: '14px' }}>
          <Link href="/" className="row" style={{ gap: '10px', color: 'inherit', textDecoration: 'none' }}>
            <span className="brand-mark">
              <BrandShieldIcon size={16} />
            </span>
            <div>
              <h1 className="brand-title">PROOFLYN</h1>
              <p className="brand-subtitle">B2B Dispute Evidence Intelligence</p>
            </div>
          </Link>

          {breadcrumbCurrent && (
            <div className="breadcrumbs" aria-label="Breadcrumb">
              <span>/</span>
              <Link href="/">Investigations</Link>
              <span>/</span>
              <strong>{breadcrumbCurrent}</strong>
            </div>
          )}

          {backHref && backLabel && !breadcrumbCurrent && (
            <Link href={backHref} className="btn small">
              {backLabel}
            </Link>
          )}
        </div>

        {user && (
          <div className="row" style={{ gap: '10px' }}>
            <span className="badge ok">MCP Stdio Active</span>
            <span className="small muted">{user.name}</span>
            <span className={`badge ${user.role === 'REVIEWER' ? 'info' : ''}`}>
              {user.role}
            </span>
            {onLogout && (
              <button type="button" className="small" onClick={onLogout}>
                Sign out
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

interface AppShellProps {
  user: ClientUser;
  onLogout: () => void;
  activeCaseId?: string;
  breadcrumbCurrent: string;
  children: React.ReactNode;
}

export function AppShell({
  user,
  onLogout,
  activeCaseId,
  breadcrumbCurrent,
  children,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary Navigation">
        <div>
          <Link
            href="/"
            className="sidebar-brand"
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            <span className="brand-mark">
              <BrandShieldIcon size={17} />
            </span>
            <div>
              <div className="brand-title">PROOFLYN</div>
              <div className="brand-subtitle">Evidence Ledger</div>
            </div>
          </Link>

          <div className="sidebar-section-label">Workspace</div>
          <nav className="sidebar-nav">
            <Link href="/" className={`nav-item ${!activeCaseId ? 'active' : ''}`}>
              <span>Investigation Ledger</span>
            </Link>
            <Link
              href="/cases/case-inv-1047"
              className={`nav-item ${activeCaseId === 'case-inv-1047' ? 'active' : ''}`}
            >
              <span>INV-1047 Spotlight</span>
              <ArrowRightIcon size={13} />
            </Link>
          </nav>

          <div className="sidebar-section-label">Architecture</div>
          <div className="session-card small">
            <div className="row-between" style={{ marginBottom: '4px' }}>
              <span className="muted">MCP Server</span>
              <span className="badge ok">Stdio</span>
            </div>
            <div className="muted">Deterministic Rules v1 • Hash-Chained Audit</div>
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="session-card">
            <div className="row-between" style={{ marginBottom: '4px' }}>
              <span className={`badge ${user.role === 'REVIEWER' ? 'info' : ''}`}>{user.role}</span>
            </div>
            <div style={{ fontWeight: 600, fontSize: '12.5px' }}>{user.name}</div>
            <div className="mono muted" style={{ fontSize: '11px' }}>{user.email}</div>
          </div>
          <button type="button" className="small" onClick={onLogout} style={{ width: '100%' }}>
            Switch Account / Sign Out
          </button>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="topbar-inner">
            <div className="breadcrumbs">
              <Link href="/">PROOFLYN</Link>
              <span>/</span>
              {activeCaseId ? (
                <>
                  <Link href="/">Investigations</Link>
                  <span>/</span>
                  <strong>{breadcrumbCurrent}</strong>
                </>
              ) : (
                <strong>{breadcrumbCurrent}</strong>
              )}
            </div>

            <div className="row" style={{ gap: '8px' }}>
              {activeCaseId && (
                <Link href="/" className="btn small">
                  All Investigations
                </Link>
              )}
              <span className="badge info">Org: {user.organizationId}</span>
            </div>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
