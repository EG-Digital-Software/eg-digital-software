import { useEffect, useRef } from 'react';

interface Props {
  className?: string;
  /** Primary (accent) node colour — the blinking dots. */
  color?: string;
  /** Secondary node colour for a few muted dots. */
  color2?: string;
}

/** Convert a #rrggbb hex to an rgba() string at the given alpha. */
function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Animated "constellation" backdrop — nodes drifting slowly, joined by thin
 * lines when close, with the accent nodes gently blinking. Pure canvas, sized to
 * its container, and it respects prefers-reduced-motion (renders a static frame).
 */
export function NetworkBackground({ className, color = '#10b981', color2 = '#94a3b8' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const CONNECT = 340; // px distance under which two nodes are linked

    interface Node {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      phase: number;
      speed: number;
      accent: boolean;
    }

    let w = 0;
    let h = 0;
    let nodes: Node[] = [];
    let raf = 0;

    function build() {
      const rect = canvas!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(18, Math.min(46, Math.round((w * h) / 42000)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.16,
        vy: (Math.random() - 0.5) * 0.16,
        r: 2 + Math.random() * 3,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 1.3,
        accent: Math.random() < 0.55,
      }));
    }

    function draw(t: number) {
      ctx!.clearRect(0, 0, w, h);

      // Links between nearby nodes.
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d < CONNECT) {
            ctx!.strokeStyle = rgba('#94a3b8', (1 - d / CONNECT) * 0.42);
            ctx!.lineWidth = 1.2;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }
      }

      // Nodes — accent ones blink and carry a soft glow.
      for (const n of nodes) {
        const pulse = reduce ? 0.6 : 0.5 + 0.5 * Math.sin(t * 0.001 * n.speed + n.phase);
        const alpha = 0.2 + 0.65 * pulse;
        const rr = n.r * (0.75 + 0.4 * pulse);
        if (n.accent) {
          ctx!.beginPath();
          ctx!.arc(n.x, n.y, rr * 2.6, 0, Math.PI * 2);
          ctx!.fillStyle = rgba(color, alpha * 0.12);
          ctx!.fill();
        }
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, rr, 0, Math.PI * 2);
        ctx!.fillStyle = rgba(n.accent ? color : color2, alpha);
        ctx!.fill();
      }
    }

    function frame(t: number) {
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      }
      draw(t);
      raf = requestAnimationFrame(frame);
    }

    build();
    if (reduce) {
      draw(0);
    } else {
      raf = requestAnimationFrame(frame);
    }

    const onResize = () => build();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [color, color2]);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
