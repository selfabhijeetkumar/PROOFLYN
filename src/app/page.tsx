'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { InvestigationCase } from '@/core/types';
import { apiFetch } from '@/lib/api-client';
import { TopBar, type ClientUser } from '@/components/TopBar';

export default function DashboardPage() {
  const [user, setUser] = useState<ClientUser | null>(null);
  const [cases, setCases] = useState<InvestigationCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Login form state
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
          <div className="card">Checking session...</div>
        </main>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <TopBar user={null} />
        <main className="container" style={{ maxWidth: '520px' }}>
          <div className="card">
            <h2>Sign In to PROOFLYN</h2>
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

  return (
    <>
      <TopBar user={user} onLogout={handleLogout} />
      <main className="container">
        {error && <div className="alert error">{error}</div>}

        <div className="grid-4" style={{ marginBottom: '16px' }}>
          <div className="stat-box">
            <div className="stat-label">Investigations</div>
            <div className="stat-value">{cases.length}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Awaiting / Under Review</div>
            <div className="stat-value">{reviewCount}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Reconciled / Reported</div>
            <div className="stat-value">{reconciledCount}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Active Role</div>
            <div className="stat-value" style={{ fontSize: '16px' }}>{user.role}</div>
          </div>
        </div>

        <div className="grid-2">
          <div className="card">
            <h2>Investigations ({cases.length})</h2>
            {cases.length === 0 ? (
              <p className="muted">
                No investigations yet. Create one using the form or run{' '}
                <code className="mono">npm run demo:reset</code> to seed INV-1047.
              </p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Case #</th>
                      <th>Title</th>
                      <th>Status</th>
                      <th>Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cases.map((c) => (
                      <tr key={c.id}>
                        <td className="mono">
                          <strong>{c.caseNumber}</strong>
                        </td>
                        <td>
                          <div>{c.title}</div>
                          {c.description && <div className="small muted">{c.description}</div>}
                        </td>
                        <td>
                          <span className="badge info">{c.status}</span>
                        </td>
                        <td>
                          <Link href={`/cases/${encodeURIComponent(c.id)}`} className="btn primary small">
                            Investigate
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
            <h2>Create Investigation</h2>
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
              <button type="submit" className="primary" disabled={creating}>
                {creating ? 'Creating...' : 'Create Investigation Case'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </>
  );
}
