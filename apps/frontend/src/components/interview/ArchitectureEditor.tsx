import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  ArchitectureAnswer,
  ArchitectureNode,
  ArchitectureConnection,
  ArchitectureConnectionLineType,
  ArchitectureAnchor,
} from '@interview-assistant/shared';

interface ArchitectureEditorProps {
  value: ArchitectureAnswer;
  onChange: (value: ArchitectureAnswer) => void;
  readOnly?: boolean;
}

export const NODE_COLORS = [
  { fill: '#dbeafe', stroke: '#3b82f6' },
  { fill: '#dcfce7', stroke: '#22c55e' },
  { fill: '#ffedd5', stroke: '#f97316' },
  { fill: '#f3e8ff', stroke: '#a855f7' },
  { fill: '#ccfbf1', stroke: '#14b8a6' },
  { fill: '#f3f4f6', stroke: '#6b7280' },
] as const;

const DEFAULT_COLOR = NODE_COLORS[0].stroke;
export const NODE_W = 120;
export const NODE_H = 50;

export function getNodeColor(color?: string) {
  return NODE_COLORS.find((c) => c.stroke === color) ?? NODE_COLORS[0];
}

let idCounter = 0;
function genId() {
  return `node_${Date.now()}_${idCounter++}`;
}

export function ArchitectureEditor({ value, onChange, readOnly }: ArchitectureEditorProps) {
  const [nodes, setNodes] = useState<ArchitectureNode[]>(value?.nodes || []);
  const [connections, setConnections] = useState<ArchitectureConnection[]>(value?.connections || []);
  const [description, setDescription] = useState(value?.description || '');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);
  const [connecting, setConnecting] = useState<{ fromNodeId: string; fromAnchor: ArchitectureAnchor } | null>(null);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [selectedConnectionIdx, setSelectedConnectionIdx] = useState<number | null>(null);
  const [editingConnectionIdx, setEditingConnectionIdx] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (value?.nodes?.length > 0) {
      setNodes(value.nodes);
      setConnections(value.connections || []);
      setDescription(value.description || '');
    }
  }, [value]);

  useEffect(() => {
    if (value) {
      setNodes(value.nodes || []);
      setConnections(value.connections || []);
      setDescription(value.description || '');
    }
  }, [value]);

  const emitChange = useCallback(
    (newNodes: ArchitectureNode[], newConns: ArchitectureConnection[], newDesc: string) => {
      onChange({ nodes: newNodes, connections: newConns, description: newDesc });
    },
    [onChange],
  );

  const addNode = () => {
    const newNode: ArchitectureNode = {
      id: genId(),
      label: 'Component',
      x: 250 + Math.random() * 100,
      y: 180 + Math.random() * 80,
      color: DEFAULT_COLOR,
    };
    const newNodes = [...nodes, newNode];
    setNodes(newNodes);
    emitChange(newNodes, connections, description);
  };

  const handleNodeColorChange = (nodeId: string, color: string) => {
    const newNodes = nodes.map((n) => (n.id === nodeId ? { ...n, color } : n));
    setNodes(newNodes);
    emitChange(newNodes, connections, description);
  };

  const deleteSelected = () => {
    if (!selectedNodeId) return;
    const newNodes = nodes.filter((n) => n.id !== selectedNodeId);
    const newConns = connections.filter((c) => c.from !== selectedNodeId && c.to !== selectedNodeId);
    setNodes(newNodes);
    setConnections(newConns);
    setSelectedNodeId(null);
    emitChange(newNodes, newConns, description);
  };

  const deleteSelectedConnection = () => {
    if (selectedConnectionIdx === null) return;
    const newConns = connections.filter((_, i) => i !== selectedConnectionIdx);
    setConnections(newConns);
    setSelectedConnectionIdx(null);
    emitChange(nodes, newConns, description);
  };

  const getSvgPoint = (e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const getAnchorPoint = (node: ArchitectureNode, anchor: ArchitectureAnchor = 'center') => {
    const cx = node.x + NODE_W / 2;
    const cy = node.y + NODE_H / 2;
    switch (anchor) {
      case 'top':    return { x: cx, y: node.y };
      case 'bottom': return { x: cx, y: node.y + NODE_H };
      case 'left':   return { x: node.x, y: cy };
      case 'right':  return { x: node.x + NODE_W, y: cy };
      default:       return { x: cx, y: cy };
    }
  };

  const closestAnchor = (node: ArchitectureNode, pt: { x: number; y: number }): ArchitectureAnchor => {
    const anchors: ArchitectureAnchor[] = ['top', 'bottom', 'left', 'right'];
    let best: ArchitectureAnchor = 'center';
    let bestDist = Infinity;
    for (const a of anchors) {
      const ap = getAnchorPoint(node, a);
      const d = Math.hypot(ap.x - pt.x, ap.y - pt.y);
      if (d < bestDist) { bestDist = d; best = a; }
    }
    return best;
  };

  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (readOnly) return;
    e.stopPropagation();

    if (connecting) {
      if (connecting.fromNodeId !== nodeId) {
        const targetNode = nodes.find((n) => n.id === nodeId)!;
        const pt = getSvgPoint(e);
        const toAnchor = closestAnchor(targetNode, pt);
        const newConn: ArchitectureConnection = {
          from: connecting.fromNodeId,
          to: nodeId,
          fromAnchor: connecting.fromAnchor,
          toAnchor,
        };
        const newConns = [...connections, newConn];
        setConnections(newConns);
        emitChange(nodes, newConns, description);
      }
      setConnecting(null);
      return;
    }

    const pt = getSvgPoint(e);
    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      setDragging({ nodeId, offsetX: pt.x - node.x, offsetY: pt.y - node.y });
      setSelectedNodeId(nodeId);
      setSelectedConnectionIdx(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (readOnly) return;
    const pt = getSvgPoint(e);
    setMousePos(pt);

    if (dragging) {
      const newX = Math.max(0, Math.min(600 - NODE_W, pt.x - dragging.offsetX));
      const newY = Math.max(0, Math.min(450 - NODE_H, pt.y - dragging.offsetY));
      const newNodes = nodes.map((n) =>
        n.id === dragging.nodeId ? { ...n, x: newX, y: newY } : n,
      );
      setNodes(newNodes);
    }
  };

  const handleMouseUp = () => {
    if (dragging) {
      emitChange(nodes, connections, description);
      setDragging(null);
    }
  };

  const handleNodeMouseUp = (e: React.MouseEvent, nodeId: string) => {
    if (readOnly) return;
    if (connecting && connecting.fromNodeId !== nodeId) {
      e.stopPropagation();
      const targetNode = nodes.find((n) => n.id === nodeId)!;
      const pt = getSvgPoint(e);
      const toAnchor = closestAnchor(targetNode, pt);
      const newConn: ArchitectureConnection = {
        from: connecting.fromNodeId,
        to: nodeId,
        fromAnchor: connecting.fromAnchor,
        toAnchor,
      };
      const newConns = [...connections, newConn];
      setConnections(newConns);
      setConnecting(null);
      emitChange(nodes, newConns, description);
    }
  };

  const handleSvgClick = (e: React.MouseEvent) => {
    if (readOnly) return;
    const target = e.target as SVGElement;
    if (e.target === svgRef.current || (target.tagName === 'rect' && target.getAttribute('data-bg') === 'true')) {
      setSelectedNodeId(null);
      setConnecting(null);
      setSelectedConnectionIdx(null);
      setEditingConnectionIdx(null);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent, nodeId: string) => {
    if (readOnly) return;
    e.stopPropagation();
    setEditingLabel(nodeId);
  };

  const handleLabelChange = (nodeId: string, newLabel: string) => {
    const newNodes = nodes.map((n) => (n.id === nodeId ? { ...n, label: newLabel } : n));
    setNodes(newNodes);
    emitChange(newNodes, connections, description);
  };

  const handleConnectionLabelChange = (idx: number, newLabel: string) => {
    const newConns = connections.map((c, i) =>
      i === idx ? { ...c, label: newLabel || undefined } : c,
    );
    setConnections(newConns);
    setEditingConnectionIdx(null);
    emitChange(nodes, newConns, description);
  };

  const handleConnectionLineTypeChange = (idx: number, lineType: ArchitectureConnectionLineType) => {
    const newConns = connections.map((c, i) => (i === idx ? { ...c, lineType } : c));
    setConnections(newConns);
    emitChange(nodes, newConns, description);
  };

  const handleDescriptionChange = (val: string) => {
    setDescription(val);
    emitChange(nodes, connections, val);
  };

  const startConnecting = (nodeId: string, anchor: ArchitectureAnchor) => {
    setConnecting({ fromNodeId: nodeId, fromAnchor: anchor });
  };

  const renderNode = (node: ArchitectureNode) => {
    const { fill, stroke } = getNodeColor(node.color);
    const isSelected = selectedNodeId === node.id;
    const isHovered = hoveredNodeId === node.id;
    const isEditing = editingLabel === node.id;
    const showHandles = !readOnly && (isSelected || isHovered);

    return (
      <g
        key={node.id}
        transform={`translate(${node.x}, ${node.y})`}
        onMouseDown={(e) => handleMouseDown(e, node.id)}
        onMouseUp={(e) => handleNodeMouseUp(e, node.id)}
        onDoubleClick={(e) => handleDoubleClick(e, node.id)}
        onMouseEnter={() => !readOnly && setHoveredNodeId(node.id)}
        onMouseLeave={() => setHoveredNodeId(null)}
        style={{ cursor: readOnly ? 'default' : dragging?.nodeId === node.id ? 'grabbing' : 'grab' }}
      >
        <rect
          width={NODE_W}
          height={NODE_H}
          rx={8}
          fill={fill}
          stroke={isSelected ? '#1d4ed8' : stroke}
          strokeWidth={isSelected ? 2 : 1}
          strokeDasharray={isSelected ? '4 2' : undefined}
        />
        {isEditing ? (
          <foreignObject x={0} y={NODE_H / 2 - 12} width={NODE_W} height={24}>
            <input
              autoFocus
              className="w-full text-center text-xs bg-white border rounded px-1"
              defaultValue={node.label}
              onBlur={(e) => { handleLabelChange(node.id, e.target.value); setEditingLabel(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { handleLabelChange(node.id, (e.target as HTMLInputElement).value); setEditingLabel(null); }
              }}
            />
          </foreignObject>
        ) : (
          <text
            x={NODE_W / 2}
            y={NODE_H / 2 + 4}
            textAnchor="middle"
            fontSize={11}
            fill="#374151"
            pointerEvents="none"
          >
            {node.label}
          </text>
        )}
        {showHandles && (
          <>
            {([
              ['top',    NODE_W / 2, -5],
              ['bottom', NODE_W / 2, NODE_H + 5],
              ['left',   -5,         NODE_H / 2],
              ['right',  NODE_W + 5, NODE_H / 2],
            ] as [ArchitectureAnchor, number, number][]).map(([anchor, cx, cy]) => (
              <circle
                key={anchor}
                cx={cx}
                cy={cy}
                r={5}
                fill="#3b82f6"
                stroke="white"
                strokeWidth={1.5}
                style={{ cursor: 'crosshair' }}
                onMouseDown={(e) => { e.stopPropagation(); startConnecting(node.id, anchor); }}
              />
            ))}
          </>
        )}
      </g>
    );
  };

  const renderConnection = (conn: ArchitectureConnection, idx: number) => {
    const fromNode = nodes.find((n) => n.id === conn.from);
    const toNode = nodes.find((n) => n.id === conn.to);
    if (!fromNode || !toNode) return null;

    const from = getAnchorPoint(fromNode, conn.fromAnchor);
    const to = getAnchorPoint(toNode, conn.toAnchor);
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const isSelected = selectedConnectionIdx === idx;
    const isEditing = editingConnectionIdx === idx;

    const lineType = conn.lineType ?? 'forward';
    const color = isSelected ? '#3b82f6' : '#9ca3af';
    const suffix = isSelected ? '-blue' : '';
    const markerEnd =
      lineType === 'forward' || lineType === 'bidirectional' ? `url(#arrow-end${suffix})` : undefined;
    const markerStart =
      lineType === 'backward' || lineType === 'bidirectional' ? `url(#arrow-start${suffix})` : undefined;

    return (
      <g
        key={`conn-${idx}`}
        style={{ cursor: readOnly ? 'default' : 'pointer' }}
        onClick={(e) => {
          if (readOnly) return;
          e.stopPropagation();
          setSelectedConnectionIdx(idx);
          setSelectedNodeId(null);
          setEditingConnectionIdx(null);
        }}
        onDoubleClick={(e) => {
          if (readOnly) return;
          e.stopPropagation();
          setEditingConnectionIdx(idx);
          setSelectedConnectionIdx(idx);
          setSelectedNodeId(null);
        }}
      >
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="transparent" strokeWidth={12} />
        <line
          x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke={color}
          strokeWidth={isSelected ? 2 : 1.5}
          markerEnd={markerEnd}
          markerStart={markerStart}
          pointerEvents="none"
        />
        {isEditing ? (
          <foreignObject x={midX - 50} y={midY - 14} width={100} height={28}>
            <input
              autoFocus
              className="w-full text-center text-xs bg-white border border-blue-400 rounded px-1 shadow"
              defaultValue={conn.label || ''}
              onBlur={(e) => handleConnectionLabelChange(idx, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConnectionLabelChange(idx, (e.target as HTMLInputElement).value);
                if (e.key === 'Escape') setEditingConnectionIdx(null);
              }}
            />
          </foreignObject>
        ) : conn.label ? (
          <text
            x={midX} y={midY - 6}
            textAnchor="middle" fontSize={10}
            fill={isSelected ? '#3b82f6' : '#6b7280'}
            pointerEvents="none"
          >
            {conn.label}
          </text>
        ) : null}
      </g>
    );
  };

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={addNode}>
            <Plus className="h-3 w-3 mr-1" />
            Add Node
          </Button>

          {selectedNode && (
            <>
              {NODE_COLORS.map((c) => (
                <button
                  key={c.stroke}
                  type="button"
                  title={c.stroke}
                  className={cn(
                    'h-5 w-5 rounded-full border-2 shrink-0 transition-transform',
                    (selectedNode.color ?? DEFAULT_COLOR) === c.stroke
                      ? 'border-gray-800 scale-110'
                      : 'border-transparent',
                  )}
                  style={{ background: c.fill, outline: `2px solid ${c.stroke}`, outlineOffset: '-2px' }}
                  onClick={() => handleNodeColorChange(selectedNode.id, c.stroke)}
                />
              ))}
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 text-destructive"
                onClick={deleteSelected}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Delete Node
              </Button>
            </>
          )}

          {selectedConnectionIdx !== null && (
            <>
              <Select
                value={connections[selectedConnectionIdx]?.lineType ?? 'forward'}
                onValueChange={(v) =>
                  handleConnectionLineTypeChange(selectedConnectionIdx, v as ArchitectureConnectionLineType)
                }
              >
                <SelectTrigger className="h-7 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="forward">→ Forward</SelectItem>
                  <SelectItem value="backward">← Backward</SelectItem>
                  <SelectItem value="bidirectional">↔ Both</SelectItem>
                  <SelectItem value="none">— No arrow</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 text-destructive"
                onClick={deleteSelectedConnection}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Delete Link
              </Button>
            </>
          )}
        </div>
      )}

      <svg
        ref={svgRef}
        width={600}
        height={450}
        className="border rounded-md bg-white"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleSvgClick}
      >
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f3f4f6" strokeWidth="0.5" />
          </pattern>
          <marker id="arrow-end" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#9ca3af" />
          </marker>
          <marker id="arrow-start" markerWidth="10" markerHeight="7" refX="1" refY="3.5" orient="auto-start-reverse">
            <polygon points="0 0, 10 3.5, 0 7" fill="#9ca3af" />
          </marker>
          <marker id="arrow-end-blue" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
          </marker>
          <marker id="arrow-start-blue" markerWidth="10" markerHeight="7" refX="1" refY="3.5" orient="auto-start-reverse">
            <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
          </marker>
        </defs>

        <rect width="600" height="450" fill="url(#grid)" data-bg="true" />

        {connections.map((conn, idx) => renderConnection(conn, idx))}

        {connecting && (
          <line
            x1={getAnchorPoint(nodes.find((n) => n.id === connecting.fromNodeId)!, connecting.fromAnchor).x}
            y1={getAnchorPoint(nodes.find((n) => n.id === connecting.fromNodeId)!, connecting.fromAnchor).y}
            x2={mousePos.x}
            y2={mousePos.y}
            stroke="#3b82f6"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            pointerEvents="none"
          />
        )}

        {nodes.map(renderNode)}
      </svg>

      <Textarea
        value={description}
        onChange={(e) => handleDescriptionChange(e.target.value)}
        placeholder="Describe your architecture design..."
        rows={3}
        className="text-sm"
        readOnly={readOnly}
      />
    </div>
  );
}
