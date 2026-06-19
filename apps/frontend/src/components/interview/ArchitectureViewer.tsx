import type { ArchitectureAnswer, ArchitectureNode, ArchitectureAnchor } from '@interview-assistant/shared';
import { NODE_W, NODE_H, getNodeColor } from './ArchitectureEditor';

interface ArchitectureViewerProps {
  value: ArchitectureAnswer | null;
}

function getAnchorPoint(node: ArchitectureNode, anchor: ArchitectureAnchor = 'center') {
  const cx = node.x + NODE_W / 2;
  const cy = node.y + NODE_H / 2;
  switch (anchor) {
    case 'top':    return { x: cx, y: node.y };
    case 'bottom': return { x: cx, y: node.y + NODE_H };
    case 'left':   return { x: node.x, y: cy };
    case 'right':  return { x: node.x + NODE_W, y: cy };
    default:       return { x: cx, y: cy };
  }
}

export function ArchitectureViewer({ value }: ArchitectureViewerProps) {
  if (!value || (!value.nodes?.length && !value.description)) {
    return <p className="text-sm text-muted-foreground italic">No architecture submitted</p>;
  }

  const { nodes = [], connections = [], description = '' } = value;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className="space-y-3">
      {nodes.length > 0 && (
        <div className="border rounded-lg overflow-hidden bg-white">
          <svg width="100%" viewBox="0 0 650 450" className="block">
            <defs>
              <marker id="v-arrow-end" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
              </marker>
              <marker id="v-arrow-start" markerWidth="10" markerHeight="7" refX="1" refY="3.5" orient="auto-start-reverse">
                <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
              </marker>
              <pattern id="grid-viewer" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="650" height="450" fill="url(#grid-viewer)" />

            {connections.map((conn, i) => {
              const fromNode = nodeMap.get(conn.from);
              const toNode = nodeMap.get(conn.to);
              if (!fromNode || !toNode) return null;
              const from = getAnchorPoint(fromNode, conn.fromAnchor);
              const to = getAnchorPoint(toNode, conn.toAnchor);
              const mx = (from.x + to.x) / 2;
              const my = (from.y + to.y) / 2;
              const lineType = conn.lineType ?? 'forward';
              const markerEnd =
                lineType === 'forward' || lineType === 'bidirectional'
                  ? 'url(#v-arrow-end)'
                  : undefined;
              const markerStart =
                lineType === 'backward' || lineType === 'bidirectional'
                  ? 'url(#v-arrow-start)'
                  : undefined;
              return (
                <g key={`conn-${i}`}>
                  <line
                    x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                    stroke="#64748b" strokeWidth={1.5}
                    markerEnd={markerEnd}
                    markerStart={markerStart}
                  />
                  {conn.label && (
                    <text x={mx} y={my - 6} textAnchor="middle" fontSize={10} fill="#475569">
                      {conn.label}
                    </text>
                  )}
                </g>
              );
            })}

            {nodes.map((node) => {
              const { fill, stroke } = getNodeColor(node.color);
              return (
                <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                  <rect
                    width={NODE_W} height={NODE_H}
                    rx={8}
                    fill={fill} stroke={stroke} strokeWidth={1.5}
                  />
                  <text
                    x={NODE_W / 2} y={NODE_H / 2}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={11} fill="#1e293b" fontWeight={500}
                  >
                    {node.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {description && (
        <div className="text-sm bg-muted/50 rounded-lg p-3">
          <p className="font-medium text-xs text-muted-foreground mb-1">Description</p>
          <p className="whitespace-pre-wrap">{description}</p>
        </div>
      )}
    </div>
  );
}
