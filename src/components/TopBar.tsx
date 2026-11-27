'use client';

import Link from 'next/link';
import type { UserRole } from '@/core/types';

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
}

export function TopBar({ user, onLogout, backHref, backLabel }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="row" style={{ gap: '16px' }}>
          <div>
            <Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>
              <h1 className="brand-title">PROOFLYN</h1>
            </Link>
            <p className="brand-subtitle">
              Every Transaction Has a Story. Every Claim Has Proof.
            </p>
          </div>
          {backHref && backLabel && (
            <Link href={backHref} className="btn small">
              {backLabel}
            </Link>
          )}
        </div>

        {user && (
          <div className="row">
            <span className="small muted">{user.name}</span>
            <span className={`badge ${user.role === 'REVIEWER' ? 'info' : ''}`}>
              {user.role}
            </span>
            {onLogout && (
              <button type="button" onClick={onLogout}>
                Sign out
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
