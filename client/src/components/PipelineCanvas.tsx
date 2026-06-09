import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { StageNode } from './StageNode.js';
import type { SerializableStageConfig, StageType } from '../types.js';
import type { StageNodeData } from './StageNode.js';

const NODE_TYPES = { stageNode: StageNode };

const TYPE_COLORS: Record<StageType, string> = {
  swarm: '#7c3aed',
  agent: '#0891b2',
  transform: '#059669',
  action: '#d97706',
};

interface Props {
  stages: SerializableStageConfig[];
  selectedStageId: string | null;
  onSelectStage: (id: string | null) => void;
  onDeleteStage: (id: string) => void;
  onReorder: (stages: SerializableStageConfig[]) => void;
  onAddStage: (type: StageType) => void;
}

function buildNodesAndEdges(
  stages: SerializableStageConfig[],
  selectedId: string | null,
  onSelect: (id: string) => void,
  onDelete: (id: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = stages.map((stage, i) => ({
    id: stage.id,
    type: 'stageNode',
    position: { x: i * 220, y: 80 },
    data: {
      stage,
      selected: stage.id === selectedId,
      onSelect,
      onDelete,
    } satisfies StageNodeData,
  }));

  const edges: Edge[] = stages.slice(0, -1).map((stage, i) => ({
    id: `e-${stage.id}-${stages[i + 1]!.id}`,
    source: stage.id,
    target: stages[i + 1]!.id,
    style: { stroke: TYPE_COLORS[stages[i + 1]!.type], strokeWidth: 2 },
    animated: false,
  }));

  return { nodes, edges };
}

export function PipelineCanvas({
  stages,
  selectedStageId,
  onSelectStage,
  onDeleteStage,
  onReorder: _onReorder,
  onAddStage,
}: Props) {
  const { nodes: initNodes, edges: initEdges } = useMemo(
    () => buildNodesAndEdges(stages, selectedStageId, onSelectStage, onDeleteStage),
    [stages, selectedStageId, onSelectStage, onDeleteStage],
  );

  const [nodes, , onNodesChange] = useNodesState(initNodes);
  const [, setEdges, onEdgesChange] = useEdgesState(initEdges);

  // Sync external stages changes into nodes
  const syncedNodes = useMemo(
    () =>
      stages.map((stage, i) => ({
        id: stage.id,
        type: 'stageNode',
        position: nodes.find((n) => n.id === stage.id)?.position ?? { x: i * 220, y: 80 },
        data: {
          stage,
          selected: stage.id === selectedStageId,
          onSelect: onSelectStage,
          onDelete: onDeleteStage,
        } satisfies StageNodeData,
      })),
    [stages, selectedStageId, nodes, onSelectStage, onDeleteStage],
  );

  const syncedEdges = useMemo(
    () =>
      stages.slice(0, -1).map((stage, i) => ({
        id: `e-${stage.id}-${stages[i + 1]!.id}`,
        source: stage.id,
        target: stages[i + 1]!.id,
        style: { stroke: TYPE_COLORS[stages[i + 1]!.type], strokeWidth: 2 },
        animated: false,
      })),
    [stages],
  );

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
  );

  const ADD_TYPES: StageType[] = ['swarm', 'agent', 'transform', 'action'];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* toolbar add-stage */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '8px 12px',
          background: '#111',
          borderBottom: '1px solid #2a2a2a',
          alignItems: 'center',
        }}
      >
        <span style={{ color: '#555', fontSize: 11 }}>+ Stage:</span>
        {ADD_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => onAddStage(t)}
            style={{
              background: TYPE_COLORS[t] + '22',
              border: `1px solid ${TYPE_COLORS[t]}`,
              borderRadius: 4,
              color: TYPE_COLORS[t],
              fontSize: 11,
              padding: '3px 10px',
              cursor: 'pointer',
              fontWeight: 600,
              letterSpacing: 0.5,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* canvas */}
      <div style={{ flex: 1 }}>
        {stages.length === 0 ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#444',
              fontSize: 14,
            }}
          >
            Aggiungi il primo stage dalla toolbar
          </div>
        ) : (
          <ReactFlow
            nodes={syncedNodes}
            edges={syncedEdges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onPaneClick={() => onSelectStage(null)}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            style={{ background: '#0d0d0d' }}
          >
            <Background color="#1a1a1a" />
            <Controls style={{ background: '#111', border: '1px solid #333' }} />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
