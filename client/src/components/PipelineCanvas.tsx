import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  BackgroundVariant,
  type Node,
  type Edge,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { StageNode } from './StageNode.js';
import type { SerializableStageConfig, StageType } from '../types.js';
import type { StageNodeData } from './StageNode.js';
import { STAGE_TYPE_CONFIG } from './stage-config.js';

const NODE_TYPES = { stageNode: StageNode };

const EDGE_COLORS: Record<StageType, string> = {
  swarm: '#8b5cf6',
  agent: '#0ea5e9',
  transform: '#10b981',
  action: '#f59e0b',
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
  onDelete: (id: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = stages.map((stage, i) => ({
    id: stage.id,
    type: 'stageNode',
    position: { x: i * 230, y: 80 },
    data: {
      stage,
      selected: stage.id === selectedId,
      onDelete,
    } satisfies StageNodeData,
  }));

  const edges: Edge[] = stages.slice(0, -1).map((stage, i) => ({
    id: `e-${stage.id}-${stages[i + 1]!.id}`,
    source: stage.id,
    target: stages[i + 1]!.id,
    style: { stroke: EDGE_COLORS[stages[i + 1]!.type], strokeWidth: 2, opacity: 0.6 },
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
    () => buildNodesAndEdges(stages, selectedStageId, onDeleteStage),
    [stages, selectedStageId, onDeleteStage],
  );

  const [nodes, , onNodesChange] = useNodesState(initNodes);
  const [, setEdges, onEdgesChange] = useEdgesState(initEdges);

  const syncedNodes = useMemo(
    () =>
      stages.map((stage, i) => ({
        id: stage.id,
        type: 'stageNode',
        position: nodes.find((n) => n.id === stage.id)?.position ?? { x: i * 230, y: 80 },
        data: {
          stage,
          selected: stage.id === selectedStageId,
          onDelete: onDeleteStage,
        } satisfies StageNodeData,
      })),
    [stages, selectedStageId, nodes, onDeleteStage],
  );

  const syncedEdges = useMemo(
    () =>
      stages.slice(0, -1).map((stage, i) => ({
        id: `e-${stage.id}-${stages[i + 1]!.id}`,
        source: stage.id,
        target: stages[i + 1]!.id,
        style: { stroke: EDGE_COLORS[stages[i + 1]!.type], strokeWidth: 2, opacity: 0.6 },
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
    <div className="h-full flex flex-col">
      {/* Add-stage toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900/60 border-b border-zinc-800 flex-shrink-0 backdrop-blur-sm">
        <span className="text-[10px] font-semibold tracking-wider text-zinc-600 uppercase mr-1">
          + Stage
        </span>
        {ADD_TYPES.map((t) => {
          const cfg = STAGE_TYPE_CONFIG[t];
          return (
            <button
              key={t}
              onClick={() => onAddStage(t)}
              className={`text-xs px-3 py-1 rounded-lg border font-semibold transition-all ${cfg.color} ${cfg.bg} ${cfg.border}`}
            >
              {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0">
        {stages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-600">
            <div className="text-4xl opacity-20">⬡</div>
            <p className="text-sm">Aggiungi il primo stage dalla toolbar</p>
          </div>
        ) : (
          <ReactFlow
            nodes={syncedNodes}
            edges={syncedEdges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_event, node) => onSelectStage(node.id)}
            onPaneClick={() => onSelectStage(null)}
            fitView
            fitViewOptions={{ padding: 0.4 }}
            style={{ background: '#09090b' }}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="#27272a"
            />
            <Controls
              className="!bg-zinc-900 !border !border-zinc-700 !rounded-xl !overflow-hidden !shadow-xl"
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
