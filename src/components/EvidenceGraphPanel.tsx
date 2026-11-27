'use client';

import { useState } from 'react';
import type { EvidenceGraphData, GraphNodeType } from '@/core/types';
import { apiFetch } from '@/lib/api-client';

interface EvidenceGraphPanelProps {
  caseId: string;
  initialGraph: EvidenceGraphData | null;
  onRefresh: () => Promise<void>;
}

export function EvidenceGraphPanel({ caseId, initialGraph, onRefresh }: EvidenceGraphPanelProps) {
  const [graph, setGraph] = useState<EvidenceGraphData | null>(initialGraph);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<GraphNodeType | 'ALL'>('ALL');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const loadGraphViaMcp = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ graph: EvidenceGraphData }>(
        `/api/v1/cases/${encodeURIComponent(caseId)}/graph`
      );
      setGraph(res.graph);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load evidence graph.');
    } finally {
      setLoading(false);
    }
  };

  const activeGraph = graph ?? initialGraph;
  const nodes = activeGraph?.nodes ?? [];
  const edges = activeGraph?.edges ?? [];

  const filteredNodes =
    typeFilter === 'ALL' ? nodes : nodes.filter((n) => n.type === typeFilter);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;
  const connectedEdges = selectedNodeId
    ? edges.filter((e) => e.source === selectedNodeId || e.target === selectedNodeId)
    : edges;

  const nodeTypes: Array<GraphNodeType | 'ALL'> = [
    'ALL',
    'CASE',
    'PURCHASE_ORDER',
    'INVOICE',
    'DELIVERY_RECORD',
    'EXTRACTED_FIELD',
    'CONFIRMED_FIELD',
    'DISCREPANCY',
    'EVIDENCE_GAP',
  ];

  // Minimal layered SVG positions by node category for functional node-link visualization
  const layerOrder: Record<string, number> = {
    CASE: 0,
    PURCHASE_ORDER: 1,
    INVOICE: 1,
    DELIVERY_RECORD: 1,
    EVIDENCE_ITEM: 1,
    EXTRACTED_FIELD: 2,
    CONFIRMED_FIELD: 2,
    DISCREPANCY: 3,
    FINDING: 3,
    EVIDENCE_GAP: 3,
  };

  const coords = new Map<string, { x: number; y: number }>();
  const byLayer: Record<number, typeof nodes> = { 0: [], 1: [], 2: [], 3: [] };
  for (const n of nodes) {
    const layer = layerOrder[n.type] ?? 2;
    byLayer[layer].push(n);
  }
  const svgWidth = 860;
  const layerRows = [0, 1, 2, 3];
  const maxPerLayer = Math.max(1, ...layerRows.map((l) => byLayer[l].length));
  const svgHeight = Math.max(320, maxPerLayer * 38 + 60);

  for (const layer of layerRows) {
    const list = byLayer[layer];
    const x = 100 + layer * 220;
    list.forEach((n, idx) => {
      const y = 32 + idx * Math.max(28, Math.floor((svgHeight - 60) / Math.max(1, list.length)));
      coords.set(n.id, { x, y });
    });
  }

  return (
    <div>
      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <div className="row-between">
          <div>
            <h3>Explainable Evidence Graph (MCP <code className="mono">get_evidence_graph</code>)</h3>
            <p className="small muted">
              Nodes and provenance edges linking case, source documents, extracted/verified fields,
              discrepancies, and evidence gaps. Every edge carries a rule ID or derivation rule.
            </p>
          </div>
          <button type="button" className="primary" onClick={loadGraphViaMcp} disabled={loading}>
            {loading ? 'Querying MCP...' : 'Refresh Graph via MCP'}
          </button>
        </div>

        {!activeGraph ? (
          <div className="alert warn" style={{ marginTop: '12px' }}>
            Click &ldquo;Refresh Graph via MCP&rdquo; to build and inspect the persisted evidence graph.
          </div>
        ) : (
          <div style={{ marginTop: '12px' }}>
            <div className="row" style={{ marginBottom: '12px' }}>
              <span className="badge info">Nodes: {nodes.length}</span>
              <span className="badge info">Edges: {edges.length}</span>
              <label htmlFor="graph-filter" className="small muted">Filter node type:</label>
              <select
                id="graph-filter"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as GraphNodeType | 'ALL')}
              >
                {nodeTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {selectedNode && (
                <button type="button" onClick={() => setSelectedNodeId(null)}>
                  Clear Selection ({selectedNode.label})
                </button>
              )}
            </div>

            <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: '4px', marginBottom: '16px', background: 'var(--surface-muted)' }}>
              <svg width={svgWidth} height={svgHeight} role="img" aria-label="Evidence Graph Diagram">
                {edges.map((edge) => {
                  const s = coords.get(edge.source);
                  const t = coords.get(edge.target);
                  if (!s || !t) return null;
                  const highlighted =
                    !selectedNodeId || edge.source === selectedNodeId || edge.target === selectedNodeId;
                  return (
                    <line
                      key={edge.id}
                      x1={s.x}
                      y1={s.y}
                      x2={t.x}
                      y2={t.y}
                      stroke={highlighted ? '#1f3a5f' : '#cbd2da'}
                      strokeWidth={highlighted ? 1.5 : 1}
                      strokeOpacity={highlighted ? 0.75 : 0.3}
                    />
                  );
                })}
                {nodes.map((node) => {
                  const pos = coords.get(node.id);
                  if (!pos) return null;
                  const isSelected = node.id === selectedNodeId;
                  return (
                    <g
                      key={node.id}
                      onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={isSelected ? 8 : 6}
                        fill={
                          node.type === 'DISCREPANCY'
                            ? '#8b1e1e'
                            : node.type === 'EVIDENCE_GAP'
                              ? '#7a4f01'
                              : node.type === 'CONFIRMED_FIELD'
                                ? '#155724'
                                : '#1f3a5f'
                        }
                      />
                      <text x={pos.x + 10} y={pos.y + 4} fontSize="10" fill="#181c20">
                        {node.label.slice(0, 28)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="grid-2">
              <div>
                <h4>Nodes ({filteredNodes.length})</h4>
                <div className="table-wrap" style={{ maxHeight: '340px', overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Label</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredNodes.map((n) => (
                        <tr
                          key={n.id}
                          onClick={() => setSelectedNodeId(n.id === selectedNodeId ? null : n.id)}
                          style={{
                            cursor: 'pointer',
                            background: n.id === selectedNodeId ? 'var(--info-bg)' : undefined,
                          }}
                        >
                          <td>
                            <span className="badge">{n.type}</span>
                          </td>
                          <td className="small">{n.label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4>
                  Provenance Edges ({connectedEdges.length}
                  {selectedNode ? ` for ${selectedNode.label}` : ''})
                </h4>
                <div className="table-wrap" style={{ maxHeight: '340px', overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Source</th>
                        <th>Relation</th>
                        <th>Target</th>
                        <th>Rule / Ref</th>
                      </tr>
                    </thead>
                    <tbody>
                      {connectedEdges.map((e) => (
                        <tr key={e.id}>
                          <td className="small">{nodeById.get(e.source)?.label ?? e.source}</td>
                          <td className="mono small">{e.type}</td>
                          <td className="small">{nodeById.get(e.target)?.label ?? e.target}</td>
                          <td className="mono small">{e.ruleId ?? e.label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
