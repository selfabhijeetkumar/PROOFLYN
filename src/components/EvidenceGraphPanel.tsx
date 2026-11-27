'use client';

import { useState } from 'react';
import type { EvidenceGraphData, GraphNodeType } from '@/core/types';
import { apiFetch } from '@/lib/api-client';

interface EvidenceGraphPanelProps {
  caseId: string;
  initialGraph: EvidenceGraphData | null;
  onRefresh: () => Promise<void>;
}

const LAYER_LABELS = ['Case Scope', 'Source Documents', 'Extracted / Verified Fields', 'Findings & Gaps'];

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
  const svgWidth = 960;
  const layerRows = [0, 1, 2, 3];
  const maxPerLayer = Math.max(1, ...layerRows.map((l) => byLayer[l].length));
  const svgHeight = Math.max(360, maxPerLayer * 42 + 72);

  for (const layer of layerRows) {
    const list = byLayer[layer];
    const x = 60 + layer * 240;
    list.forEach((n, idx) => {
      const y = 52 + idx * Math.max(32, Math.floor((svgHeight - 76) / Math.max(1, list.length)));
      coords.set(n.id, { x, y });
    });
  }

  const nodeStyle = (type: GraphNodeType) => {
    if (type === 'DISCREPANCY') return { fill: '#fee4e2', stroke: '#b42318', text: '#b42318' };
    if (type === 'EVIDENCE_GAP') return { fill: '#fef6ee', stroke: '#a15c07', text: '#a15c07' };
    if (type === 'CONFIRMED_FIELD') return { fill: '#e7f4ee', stroke: '#126e47', text: '#126e47' };
    return { fill: '#eef3f9', stroke: '#0f2744', text: '#0f2744' };
  };

  return (
    <div>
      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <div className="card-header">
          <div>
            <h3 style={{ margin: 0 }}>
              Explainable Evidence Graph (MCP <code className="mono">get_evidence_graph</code>)
            </h3>
            <p className="small muted" style={{ margin: '2px 0 0' }}>
              Provenance topology linking case, source documents, extracted/verified fields,
              discrepancies, and evidence gaps. Click any node to highlight its derivation path.
            </p>
          </div>
          <button type="button" className="primary" onClick={loadGraphViaMcp} disabled={loading}>
            {loading ? 'Querying MCP...' : 'Refresh Graph via MCP'}
          </button>
        </div>

        {!activeGraph ? (
          <div className="alert warn" style={{ marginBottom: 0 }}>
            Click &ldquo;Refresh Graph via MCP&rdquo; to build and inspect the persisted evidence graph.
          </div>
        ) : (
          <div>
            <div className="row-between" style={{ marginBottom: '12px' }}>
              <div className="row">
                <span className="badge info">Nodes: {nodes.length}</span>
                <span className="badge info">Provenance Edges: {edges.length}</span>
                <span className="badge ok">Verified Node</span>
                <span className="badge warn">Gap Node</span>
                <span className="badge danger">Discrepancy Node</span>
              </div>

              <div className="row">
                <label htmlFor="graph-filter" className="small muted">Filter type:</label>
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
                  <button type="button" className="small" onClick={() => setSelectedNodeId(null)}>
                    Clear ({selectedNode.label.slice(0, 20)})
                  </button>
                )}
              </div>
            </div>

            <div
              className="table-wrap"
              style={{
                border: '1px solid var(--border)',
                borderRadius: '4px',
                marginBottom: '16px',
                background: 'var(--surface-subtle)',
              }}
            >
              <svg width={svgWidth} height={svgHeight} role="img" aria-label="Evidence Graph Diagram">
                {layerRows.map((layer) => (
                  <text
                    key={layer}
                    x={60 + layer * 240}
                    y={24}
                    fontSize="10"
                    fontWeight="700"
                    fill="#5f6c7b"
                  >
                    {LAYER_LABELS[layer].toUpperCase()}
                  </text>
                ))}
                {edges.map((edge) => {
                  const s = coords.get(edge.source);
                  const t = coords.get(edge.target);
                  if (!s || !t) return null;
                  const highlighted =
                    !selectedNodeId || edge.source === selectedNodeId || edge.target === selectedNodeId;
                  return (
                    <line
                      key={edge.id}
                      x1={s.x + 8}
                      y1={s.y}
                      x2={t.x - 8}
                      y2={t.y}
                      stroke={highlighted ? '#0f2744' : '#cbd3de'}
                      strokeWidth={highlighted ? 1.5 : 1}
                      strokeOpacity={highlighted ? 0.65 : 0.3}
                    />
                  );
                })}
                {nodes.map((node) => {
                  const pos = coords.get(node.id);
                  if (!pos) return null;
                  const isSelected = node.id === selectedNodeId;
                  const st = nodeStyle(node.type);
                  return (
                    <g
                      key={node.id}
                      onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <rect
                        x={pos.x - 8}
                        y={pos.y - 11}
                        width={176}
                        height={22}
                        rx={3}
                        fill={st.fill}
                        stroke={isSelected ? '#0b192c' : st.stroke}
                        strokeWidth={isSelected ? 2 : 1}
                      />
                      <text
                        x={pos.x}
                        y={pos.y + 4}
                        fontSize="10.5"
                        fontWeight={isSelected ? '700' : '600'}
                        fill={st.text}
                      >
                        {node.label.slice(0, 24)}
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
                        <th>Node Label</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredNodes.map((n) => (
                        <tr
                          key={n.id}
                          onClick={() => setSelectedNodeId(n.id === selectedNodeId ? null : n.id)}
                          className={n.id === selectedNodeId ? 'row-selected' : undefined}
                          style={{ cursor: 'pointer' }}
                        >
                          <td>
                            <span className="badge">{n.type}</span>
                          </td>
                          <td className="small" style={{ fontWeight: 500 }}>{n.label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4>
                  Provenance Edges ({connectedEdges.length}
                  {selectedNode ? ` connected to ${selectedNode.label}` : ''})
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
