import { useRef, useEffect, useCallback, useState } from 'react';
import { GraphNode, GraphLink } from '../types';

interface GraphViewProps {
  nodes: GraphNode[];
  links: GraphLink[];
  activeNoteId: string | null;
  onSelectNote: (id: string) => void;
}

interface Position {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const COLORS = [
  '#cba6f7', '#89b4fa', '#a6e3a1', '#f9e2af',
  '#fab387', '#f38ba8', '#94e2d5', '#74c7ec',
];

export function GraphView({ nodes, links, activeNoteId, onSelectNote }: GraphViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const positionsRef = useRef<Map<string, Position>>(new Map());
  const animRef = useRef<number>(0);
  const [dimensions, setDimensions] = useState({ w: 600, h: 400 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null);

  // Initialize positions
  useEffect(() => {
    const pos = positionsRef.current;
    const existing = new Set(pos.keys());
    for (const node of nodes) {
      if (!existing.has(node.id)) {
        pos.set(node.id, {
          x: Math.random() * dimensions.w,
          y: Math.random() * dimensions.h,
          vx: 0, vy: 0,
        });
      }
    }
    // Remove deleted nodes
    const nodeIds = new Set(nodes.map(n => n.id));
    for (const id of pos.keys()) {
      if (!nodeIds.has(id)) pos.delete(id);
    }
  }, [nodes, dimensions.w, dimensions.h]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Force-directed layout + render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = dimensions.w;
    canvas.height = dimensions.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const linkSet = new Set(links.map(l => `${l.source}-${l.target}`));

    function simulate() {
      const pos = positionsRef.current;
      const centerX = dimensions.w / 2;
      const centerY = dimensions.h / 2;

      // Forces
      for (const [id, p] of pos) {
        // Center gravity
        p.vx += (centerX - p.x) * 0.001;
        p.vy += (centerY - p.y) * 0.001;

        // Repulsion between all nodes
        for (const [id2, p2] of pos) {
          if (id >= id2) continue;
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 300 / (dist * dist);
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
          p2.vx -= (dx / dist) * force;
          p2.vy -= (dy / dist) * force;
        }

        // Attraction along links
        for (const link of links) {
          if (link.source === id) {
            const target = pos.get(link.target);
            if (target) {
              const dx = target.x - p.x;
              const dy = target.y - p.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              p.vx += dx * 0.005;
              p.vy += dy * 0.005;
              target.vx -= dx * 0.005;
              target.vy -= dy * 0.005;
            }
          }
        }
      }

      // Update positions
      for (const [, p] of pos) {
        p.vx *= 0.85; // damping
        p.vy *= 0.85;
        p.x += p.vx;
        p.y += p.vy;
        // Clamp
        p.x = Math.max(20, Math.min(dimensions.w - 20, p.x));
        p.y = Math.max(20, Math.min(dimensions.h - 20, p.y));
      }

      draw();
      animRef.current = requestAnimationFrame(simulate);
    }

    function draw() {
      ctx.clearRect(0, 0, dimensions.w, dimensions.h);
      const pos = positionsRef.current;

      // Draw links
      ctx.lineWidth = 1.5;
      for (const link of links) {
        const source = pos.get(link.source);
        const target = pos.get(link.target);
        if (!source || !target) continue;
        const isActive = link.source === activeNoteId || link.target === activeNoteId;
        ctx.strokeStyle = isActive ? 'rgba(203, 166, 247, 0.6)' : 'rgba(69, 71, 90, 0.6)';
        ctx.lineWidth = isActive ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
      }

      // Draw nodes
      const nodeRadius = 6;
      for (const node of nodes) {
        const p = pos.get(node.id);
        if (!p) continue;
        const isActive = node.id === activeNoteId;
        const isHovered = node.id === hoveredNode;
        const colorIdx = node.tags.length > 0
          ? Math.abs(node.tags[0].split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % COLORS.length
          : 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, isActive ? 8 : isHovered ? 7 : nodeRadius, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? COLORS[colorIdx] : (isHovered ? 'rgba(203, 166, 247, 0.8)' : 'rgba(69, 71, 90, 0.8)');
        ctx.fill();
        if (isActive) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Label
        if (isActive || isHovered) {
          ctx.fillStyle = '#cdd6f4';
          ctx.font = '11px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(node.title, p.x, p.y - 14);
        }
      }
    }

    animRef.current = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(animRef.current);
  }, [nodes, links, activeNoteId, dimensions, hoveredNode]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const pos = positionsRef.current;
    let found: string | null = null;
    for (const node of nodes) {
      const p = pos.get(node.id);
      if (!p) continue;
      const dx = mx - p.x;
      const dy = my - p.y;
      if (dx * dx + dy * dy < 100) {
        found = node.id;
        break;
      }
    }
    setHoveredNode(found);
    if (dragRef.current && found === dragRef.current) {
      const p = pos.get(dragRef.current);
      if (p) {
        p.x = mx;
        p.y = my;
      }
    }
  }, [nodes]);

  const handleMouseDown = useCallback(() => {
    dragRef.current = hoveredNode;
  }, [hoveredNode]);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current) {
      onSelectNote(dragRef.current);
      dragRef.current = null;
    }
  }, [onSelectNote]);

  return (
    <div className="graph-container" ref={containerRef}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setHoveredNode(null); dragRef.current = null; }}
        style={{ cursor: hoveredNode ? 'pointer' : 'default' }}
      />
      <div className="graph-info">
        {nodes.length} notes · {links.length} connections
      </div>
    </div>
  );
}
