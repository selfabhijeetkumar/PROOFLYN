'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { InvestigationCase } from '@/core/types';
import { apiFetch } from '@/lib/api-client';
import { AppShell, TopBar, type ClientUser } from '@/components/TopBar';
import { AlertIcon, ArrowRightIcon, FolderLedgerIcon } from '@/components/Icons';

function caseStatusTone(status: InvestigationCase['status']): string {
  if (status === 'RECONCILED' || status === 'REPORT_GENERATED' || status === 'CLOSED') return 'ok';
  if (status === 'UNDER_REVIEW' || status === 'EXTRACTION_COMPLETE') return 'warn';
  return 'info';
}

export default function DashboardPage() {
  const [user, setUser] = useState<ClientUser | null>(null);
  const [cases, setCases] = useState<InvestigationCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Login form state (shown when demo mode is off or after clicking Sign Out)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Create case form state
  const [caseNumber, setCaseNumber] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [creating, setCreating] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const me = await apiFetch<{ user: ClientUser }>('/api/v1/auth/me');
      setUser(me.user);
      const list = await apiFetch<{ cases: InvestigationCase[] }>('/api/v1/cases');
      setCases(list.cases);
    } catch {
      setUser(null);
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setError(null);
    try {
      const res = await apiFetch<{ user: ClientUser }>('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      setUser(res.user);
      setPassword('');
      const list = await apiFetch<{ cases: InvestigationCase[] }>('/api/v1/cases');
      setCases(list.cases);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await apiFetch('/api/v1/auth/logout', { method: 'POST' });
    setUser(null);
    setCases([]);
  };

  const handleCreateCase = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await apiFetch<{ case: InvestigationCase }>('/api/v1/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseNumber,
          title,
          description,
          buyerName,
          supplierName,
        }),
      });
      setCaseNumber('');
      setTitle('');
      setDescription('');
      setBuyerName('');
      setSupplierName('');
      const list = await apiFetch<{ cases: InvestigationCase[] }>('/api/v1/cases');
      setCases(list.cases);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create case.');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <>
        <TopBar user={null} />
        <main className="container">
          <div className="card">Loading PROOFLYN Investigation Ledger...</div>
        </main>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <TopBar user={null} />
        <main className="container-narrow">
          <div className="card">
            <div className="card-header">
              <div>
                <h2 style={{ marginBottom: '2px' }}>Sign In to PROOFLYN</h2>
                <p className="small muted" style={{ margin: 0 }}>
                  Enterprise Dispute Evidence &amp; Reconciliation Workbench
                </p>
              </div>
            </div>
            <p className="small muted">
              Sign in with a seeded Investigator or Reviewer account configured via environment
              variables (<code className="mono">DEMO_INVESTIGATOR_EMAIL</code> /{' '}
              <code className="mono">DEMO_REVIEWER_EMAIL</code>).
            </p>
            {error && <div className="alert error">{error}</div>}
            <form onSubmit={handleLogin} className="form-grid">
              <div className="field-group">
                <label htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="field-group">
                <label htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="primary" disabled={loggingIn}>
                {loggingIn ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          </div>
        </main>
      </>
    );
  }

  const reconciledCount = cases.filter(
    (c) => c.status === 'RECONCILED' || c.status === 'REPORT_GENERATED' || c.status === 'CLOSED'
  ).length;
  const reviewCount = cases.filter(
    (c) => c.status === 'EXTRACTION_COMPLETE' || c.status === 'UNDER_REVIEW'
  ).length;
  const inv1047 = cases.find((c) => c.caseNumber === 'INV-1047');

  const query = searchQuery.trim().toLowerCase();
  const filteredCases = query
    ? cases.filter(
        (c) =>
          c.caseNumber.toLowerCase().includes(query) ||
          c.title.toLowerCase().includes(query) ||
          (c.description && c.description.toLowerCase().includes(query))
      )
    : cases;

  return (
    <AppShell user={user} onLogout={handleLogout} breadcrumbCurrent="Investigation Ledger">
      <main className="container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Investigation &amp; 3-Way Dispute Ledger</h1>
            <p className="page-desc">
              Deterministic Purchase Order, Invoice, and Delivery reconciliation backed by real stdio MCP verification.
            </p>
          </div>
          {inv1047 && (
            <Link href={`/cases/${encodeURIComponent(inv1047.id)}`} className="btn primary">
              <span>Inspect Golden Case INV-1047</span>
              <ArrowRightIcon size={14} />
            </Link>
          )}
        </div>

        {error && <div className="alert error">{error}</div>}

        <div className="grid-4" style={{ marginBottom: '16px' }}>
          <div className="kpi-card">
            <div className="stat-label">Total Investigations</div>
            <div className="stat-value">{cases.length}</div>
            <div className="stat-sub">Persisted in {user.organizationId}</div>
          </div>
          <div className="kpi-card">
            <div className="stat-label">Awaiting / Under Review</div>
            <div className="stat-value">{reviewCount}</div>
            <div className="stat-sub">Human verification or review active</div>
          </div>
          <div className="kpi-card">
            <div className="stat-label">Reconciled / Reported</div>
            <div className="stat-value">{reconciledCount}</div>
            <div className="stat-sub">Deterministic runs or packs completed</div>
          </div>
          <div className="kpi-card">
            <div className="stat-label">Active Clearance</div>
            <div className="stat-value" style={{ fontSize: '15px', marginTop: '7px' }}>
              <span className={`badge ${user.role === 'REVIEWER' ? 'info' : ''}`}>{user.role}</span>
            </div>
            <div className="stat-sub">{user.name}</div>
          </div>
        </div>

        {inv1047 && (
          <div className="spotlight-card">
            <div className="row-between">
              <div style={{ flex: 1, minWidth: '280px' }}>
                <div className="row" style={{ marginBottom: '6px' }}>
                  <span className="badge danger">
                    <AlertIcon size={12} />
                    <span>Primary Demo Case</span>
                  </span>
                  <span className="mono" style={{ fontWeight: 700, fontSize: '14px' }}>
                    {inv1047.caseNumber}
                  </span>
                  <span className={`badge ${caseStatusTone(inv1047.status)}`}>{inv1047.status}</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: '14.5px', color: 'var(--text)' }}>
                  {inv1047.title}
                </div>
                {inv1047.description && (
                  <p className="small muted" style={{ margin: '4px 0 0' }}>
                    {inv1047.description}
                  </p>
                )}
              </div>
              <Link href={`/cases/${encodeURIComponent(inv1047.id)}`} className="btn primary">
                <span>Open Case Workspace</span>
                <ArrowRightIcon size={14} />
              </Link>
            </div>
          </div>
        )}

        <div className="grid-workbench">
          <div className="card">
            <div className="card-header">
              <div className="row">
                <FolderLedgerIcon size={16} />
                <h2 style={{ margin: 0 }}>Investigations ({filteredCases.length})</h2>
              </div>
              <input
                type="search"
                aria-label="Filter investigations"
                placeholder="Filter by case # or title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ minWidth: '210px' }}
              />
            </div>

            {filteredCases.length === 0 ? (
              <p className="muted">
                {cases.length === 0
                  ? 'No investigations yet. Create one using the form or run npm run demo:reset to seed INV-1047.'
                  : 'No persisted cases match your filter.'}
              </p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Case #</th>
                      <th>Investigation Scope</th>
                      <th>Status</th>
                      <th className="text-right">Workspace</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCases.map((c) => (
                      <tr
                        key={c.id}
                        className={c.caseNumber === 'INV-1047' ? 'row-highlight' : undefined}
                      >
                        <td className="mono">
                          <strong>{c.caseNumber}</strong>
                        </td>
                        <td className="align-top">
                          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{c.title}</div>
                          {c.description && (
                            <div className="small muted" style={{ marginTop: '2px' }}>
                              {c.description}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${caseStatusTone(c.status)}`}>{c.status}</span>
                        </td>
                        <td className="text-right">
                          <Link
                            href={`/cases/${encodeURIComponent(c.id)}`}
                            className={`btn small ${c.caseNumber === 'INV-1047' ? 'primary' : ''}`}
                          >
                            <span>Investigate</span>
                            <ArrowRightIcon size={12} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <h2 style={{ margin: 0 }}>Create Investigation</h2>
              <span className="badge">New Case</span>
            </div>
            <form onSubmit={handleCreateCase} className="form-grid">
              <div className="field-group">
                <label htmlFor="case-number">Case / Invoice Number</label>
                <input
                  id="case-number"
                  type="text"
                  placeholder="e.g. INV-1048"
                  value={caseNumber}
                  onChange={(e) => setCaseNumber(e.target.value)}
                  required
                />
              </div>
              <div className="field-group">
                <label htmlFor="case-title">Title</label>
                <input
                  id="case-title"
                  type="text"
                  placeholder="Short investigation title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div className="field-group">
                <label htmlFor="case-desc">Description</label>
                <textarea
                  id="case-desc"
                  rows={2}
                  placeholder="Dispute scope or variance summary"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="grid-2">
                <div className="field-group">
                  <label htmlFor="buyer-name">Buyer Party (optional)</label>
                  <input
                    id="buyer-name"
                    type="text"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="supplier-name">Supplier Party (optional)</label>
                  <input
                    id="supplier-name"
                    type="text"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                  />
                </div>
              </div>
              <button type="submit" className="primary" disabled={creating} style={{ width: '100%' }}>
                {creating ? 'Creating Investigation...' : 'Create Investigation Case'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
