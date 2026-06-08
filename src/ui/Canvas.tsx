import { useRef, useState, useCallback } from 'react';
import { useNetworkStore } from '../store/networkStore';
import { useShallow } from 'zustand/react/shallow';
import { computeRange, colorForValue } from '../display/mapping';
import { colorValue } from '../display/variables';
import { FAN_STATE_STYLE } from '../display/fanStyle';
import { CONTAMINANT_EPS } from '../display/glyphs';
import type { Airway, VentNode } from '../model/types';

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

const NODE_R = 12;

/** Quadratic-curve geometry for an airway, offset so parallel branches separate. */
function airwayPath(
  from: VentNode,
  to: VentNode,
  offsetIndex: number,
): {
  d: string;
  mid: { x: number; y: number };
  angle: number;
  perp: { x: number; y: number };
  off: number;
} {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  // perpendicular unit vector
  const px = -dy / len;
  const py = dx / len;
  const spacing = 26;
  const off = offsetIndex * spacing;
  const cx = (from.x + to.x) / 2 + px * off;
  const cy = (from.y + to.y) / 2 + py * off;
  const d = `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
  // point on quadratic at t=0.5
  const mx = 0.25 * from.x + 0.5 * cx + 0.25 * to.x;
  const my = 0.25 * from.y + 0.5 * cy + 0.25 * to.y;
  const angle = (Math.atan2(to.y - cy, to.x - cx) * 180) / Math.PI;
  return { d, mid: { x: mx, y: my }, angle, perp: { x: px, y: py }, off };
}

/**
 * Label placement for an airway. Single airways sit 12px above the midpoint
 * (textAnchor middle). Parallel branches are pushed outward along the curve's
 * bulge direction and anchored on the outer side so their (often long) labels
 * grow away from each other instead of overlapping on the shared centerline.
 */
function airwayLabelPlacement(
  mid: { x: number; y: number },
  perp: { x: number; y: number },
  off: number,
): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  if (off === 0) return { x: mid.x, y: mid.y - 12, anchor: 'middle' };
  const dir = off > 0 ? 1 : -1;
  const ux = perp.x * dir; // unit perpendicular pointing to this branch's bulge side
  const uy = perp.y * dir;
  const pad = 16;
  const x = mid.x + ux * pad;
  // keep text visually centered on its baseline; nudge down when pushed below the line
  const y = mid.y + uy * pad + (uy > 0 ? 9 : 0);
  const anchor: 'start' | 'middle' | 'end' = ux > 0.3 ? 'start' : ux < -0.3 ? 'end' : 'middle';
  return { x, y, anchor };
}

export function Canvas() {
  const {
    network,
    tool,
    selection,
    pendingFromNode,
    result,
    display,
    glyphs,
    selectedAirways,
    setSelection,
    addNode,
    addAirway,
    setPendingFromNode,
    setFan,
    updateAirway,
    beginHistory,
    moveNodeLive,
  } = useNetworkStore(
    useShallow((s) => ({
      network: s.activeNetwork(),
      tool: s.tool,
      selection: s.selection,
      pendingFromNode: s.pendingFromNode,
      result: s.result,
      display: s.display,
      glyphs: s.glyphs,
      selectedAirways: s.selectedAirways,
      setSelection: s.setSelection,
      addNode: s.addNode,
      addAirway: s.addAirway,
      setPendingFromNode: s.setPendingFromNode,
      setFan: s.setFan,
      updateAirway: s.updateAirway,
      beginHistory: s.beginHistory,
      moveNodeLive: s.moveNodeLive,
    })),
  );

  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ x: -40, y: -40, w: 900, h: 700 });
  const drag = useRef<
    | { kind: 'node'; id: string }
    | { kind: 'pan'; startX: number; startY: number; viewX: number; viewY: number }
    | null
  >(null);

  const nodeById = new Map(network.nodes.map((n) => [n.id, n]));

  // assign offset indices to parallel airways (same unordered node pair)
  const pairCount = new Map<string, number>();
  const pairSeen = new Map<string, number>();
  for (const a of network.airways) {
    const key = [a.from, a.to].sort().join('|');
    pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
  }

  const range = result ? computeRange(result.airwayResults, display.primary.variable) : null;
  const resultById = new Map((result?.airwayResults ?? []).map((r) => [r.airwayId, r]));
  const group = new Set(selectedAirways);

  const toSvg = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current!.getBoundingClientRect();
      return {
        x: view.x + ((clientX - rect.left) / rect.width) * view.w,
        y: view.y + ((clientY - rect.top) / rect.height) * view.h,
      };
    },
    [view],
  );

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = svgRef.current!.getBoundingClientRect();
    const mx = view.x + ((e.clientX - rect.left) / rect.width) * view.w;
    const my = view.y + ((e.clientY - rect.top) / rect.height) * view.h;
    const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1;
    const w = view.w * factor;
    const h = view.h * factor;
    // keep cursor point stationary
    const x = mx - ((mx - view.x) * w) / view.w;
    const y = my - ((my - view.y) * h) / view.h;
    setView({ x, y, w, h });
  };

  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget && (e.target as Element).tagName !== 'rect') return;
    const p = toSvg(e.clientX, e.clientY);
    if (tool === 'addNode') {
      addNode(Math.round(p.x), Math.round(p.y));
      return;
    }
    if (tool === 'addAirway') {
      setPendingFromNode(null);
      setSelection(null);
      return;
    }
    if (tool === 'select' || tool === 'pan') {
      setSelection(null);
      drag.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, viewX: view.x, viewY: view.y };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') {
      const rect = svgRef.current!.getBoundingClientRect();
      const dx = ((e.clientX - d.startX) / rect.width) * view.w;
      const dy = ((e.clientY - d.startY) / rect.height) * view.h;
      setView((v) => ({ ...v, x: d.viewX - dx, y: d.viewY - dy }));
    } else if (d.kind === 'node') {
      const p = toSvg(e.clientX, e.clientY);
      moveNodeLive(d.id, Math.round(p.x), Math.round(p.y));
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    if (drag.current) {
      try {
        (e.currentTarget as Element).releasePointerCapture(e.pointerId);
      } catch {
        /* not captured */
      }
    }
    drag.current = null;
  };

  const onNodePointerDown = (e: React.PointerEvent, node: VentNode) => {
    e.stopPropagation();
    if (tool === 'addAirway') {
      if (!pendingFromNode) {
        setPendingFromNode(node.id);
      } else {
        addAirway(pendingFromNode, node.id);
      }
      return;
    }
    if (tool === 'select') {
      setSelection({ type: 'node', id: node.id });
      beginHistory();
      drag.current = { kind: 'node', id: node.id };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    }
  };

  const onAirwayClick = (e: React.MouseEvent, a: Airway) => {
    e.stopPropagation();
    if (tool === 'addFan') {
      if (!a.fan) {
        setFan(a.id, {
          id: `fan_${a.id}`,
          name: `Fan ${a.id}`,
          curve: [
            { q: 0, p: 2000 },
            { q: 100, p: 1500 },
            { q: 200, p: 0 },
          ],
        });
      }
      setSelection({ type: 'airway', id: a.id });
      return;
    }
    if (tool === 'addRegulator') {
      updateAirway(a.id, { regulatorResistance: a.regulatorResistance ?? 0.5 });
      setSelection({ type: 'airway', id: a.id });
      return;
    }
    setSelection({ type: 'airway', id: a.id });
  };

  return (
    <svg
      ref={svgRef}
      className="h-full w-full bg-slate-50 touch-none"
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      onWheel={onWheel}
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      style={{ cursor: tool === 'pan' ? 'grab' : 'default' }}
    >
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e2e8f0" strokeWidth="1" />
        </pattern>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
        </marker>
      </defs>
      <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="url(#grid)" />

      {/* airways */}
      {network.airways.map((a) => {
        const from = nodeById.get(a.from);
        const to = nodeById.get(a.to);
        if (!from || !to) return null;
        const key = [a.from, a.to].sort().join('|');
        const count = pairCount.get(key) ?? 1;
        const seen = pairSeen.get(key) ?? 0;
        pairSeen.set(key, seen + 1);
        const offsetIndex = seen - (count - 1) / 2;
        const { d, mid, angle, perp, off } = airwayPath(from, to, offsetIndex);
        const label = airwayLabelPlacement(mid, perp, off);

        const res = resultById.get(a.id);
        const reversed = res ? res.Q < 0 : false;
        let stroke = '#64748b';
        if (res && range) {
          stroke = colorForValue(colorValue(display.primary.variable, res), range);
        }
        const selected = selection?.type === 'airway' && selection.id === a.id;
        // Fan glyph colour follows the solved operating state (blue until solved).
        const fanColor = res?.fanState ? FAN_STATE_STYLE[res.fanState].color : '#2563eb';

        const blocked = a.blocked && glyphs.blocked;
        const showFan = a.fan && glyphs.fan;
        const showRegulator = (a.regulatorResistance ?? 0) > 0 && glyphs.regulator;
        const showFixedFlow = a.fixedFlow != null && !a.blocked && glyphs.fixedFlow;
        const contaminated =
          glyphs.contaminant && res?.concentration != null && Math.abs(res.concentration) > CONTAMINANT_EPS;
        // Secondary glyphs sit offset along the perpendicular so they clear the fan/regulator at mid.
        const off1 = { x: mid.x + perp.x * 15, y: mid.y + perp.y * 15 };
        const off2 = { x: mid.x - perp.x * 15, y: mid.y - perp.y * 15 };

        return (
          <g key={a.id} className="cursor-pointer" onClick={(e) => onAirwayClick(e, a)}>
            {/* fat invisible hit area */}
            <path d={d} fill="none" stroke="transparent" strokeWidth={16} />
            {/* "select same layer" group halo */}
            {group.has(a.id) && (
              <path d={d} fill="none" stroke="#3b82f6" strokeWidth={11} strokeOpacity={0.35} />
            )}
            <path
              d={d}
              fill="none"
              stroke={selected ? '#0f172a' : blocked ? '#94a3b8' : stroke}
              strokeWidth={selected ? 6 : 4}
              strokeDasharray={blocked ? '6 5' : undefined}
              markerEnd={reversed || blocked ? undefined : 'url(#arrow)'}
              markerStart={reversed && !blocked ? 'url(#arrow)' : undefined}
            />
            {showFan && (
              <>
                <circle cx={mid.x} cy={mid.y} r={7} fill="#fff" stroke={fanColor} strokeWidth={2} />
                <text x={mid.x} y={mid.y + 3} textAnchor="middle" fontSize={9} fill={fanColor}>
                  F
                </text>
              </>
            )}
            {showRegulator && (
              <rect
                x={mid.x - 6}
                y={mid.y - 6}
                width={12}
                height={12}
                fill="#fff"
                stroke="#b45309"
                strokeWidth={2}
                transform={`rotate(${angle} ${mid.x} ${mid.y})`}
              />
            )}
            {showFixedFlow && (
              <>
                <circle cx={off1.x} cy={off1.y} r={7} fill="#fff" stroke="#7c3aed" strokeWidth={2} />
                <text x={off1.x} y={off1.y + 3.5} textAnchor="middle" fontSize={10} fill="#7c3aed">
                  ⇶
                </text>
              </>
            )}
            {blocked && (
              <>
                <circle cx={mid.x} cy={mid.y} r={7} fill="#fff" stroke="#dc2626" strokeWidth={2} />
                <path
                  d={`M ${mid.x - 4} ${mid.y - 4} L ${mid.x + 4} ${mid.y + 4} M ${mid.x + 4} ${mid.y - 4} L ${mid.x - 4} ${mid.y + 4}`}
                  stroke="#dc2626"
                  strokeWidth={1.5}
                />
              </>
            )}
            {contaminated && (
              <circle cx={off2.x} cy={off2.y} r={5} fill="#059669" stroke="#fff" strokeWidth={1.5} />
            )}
            <text x={label.x} y={label.y} textAnchor={label.anchor} fontSize={11} fill="#334155">
              {a.label ?? a.id}
            </text>
          </g>
        );
      })}

      {/* nodes */}
      {network.nodes.map((n) => {
        const selected = selection?.type === 'node' && selection.id === n.id;
        const pending = pendingFromNode === n.id;
        const fixed = n.fixedPressure != null && glyphs.fixedPressure;
        // Contaminant "report" markers: a held concentration (0 = fresh-air report,
        // >0 = contaminant source) or a mass-injection source.
        const hasConc = n.contaminantConcentration != null;
        const fresh = hasConc && (n.contaminantConcentration ?? 0) <= CONTAMINANT_EPS;
        const source = hasConc && (n.contaminantConcentration ?? 0) > CONTAMINANT_EPS;
        const injects = (n.contaminantInjection ?? 0) > CONTAMINANT_EPS;
        const showContaminant = glyphs.contaminant && (hasConc || injects);
        const bx = n.x + NODE_R * 0.8;
        const by = n.y + NODE_R * 0.8;
        return (
          <g
            key={n.id}
            className="cursor-pointer"
            onPointerDown={(e) => onNodePointerDown(e, n)}
          >
            <circle
              cx={n.x}
              cy={n.y}
              r={NODE_R}
              fill={fixed ? '#bae6fd' : '#fff'}
              stroke={selected ? '#0f172a' : pending ? '#16a34a' : '#475569'}
              strokeWidth={selected || pending ? 4 : 2}
            />
            {fixed && (
              <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={11} fontWeight="bold" fill="#0284c7">
                P
              </text>
            )}
            {showContaminant && (
              <>
                <circle
                  cx={bx}
                  cy={by}
                  r={5.5}
                  fill={source ? '#d97706' : fresh ? '#059669' : '#10b981'}
                  stroke="#fff"
                  strokeWidth={1.5}
                />
                <text x={bx} y={by + 3} textAnchor="middle" fontSize={8} fill="#fff" fontWeight="bold">
                  {injects && !hasConc ? '+' : fresh ? '✓' : '!'}
                </text>
              </>
            )}
            <text x={n.x} y={n.y - NODE_R - 4} textAnchor="middle" fontSize={11} fill="#0f172a">
              {n.label ?? n.id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
