'use client';

import { Eraser, Loader2, PenLine } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Quadro de assinatura com o dedo ou a caneta (pointer events). Exporta PNG com fundo branco,
 * para ficar legível no tema escuro e no relatório.
 */
export function SignaturePad({ onSave, saving }: { onSave: (png: string) => void; saving: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = c.getBoundingClientRect();
    c.width = Math.round(width * ratio);
    c.height = Math.round(height * ratio);
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const clear = () => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const { width, height } = c.getBoundingClientRect();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    setEmpty(true);
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={ref}
        role="img"
        aria-label="Quadro de assinatura: desenhe com o dedo"
        className="h-36 w-full touch-none rounded-xl border border-border bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const ctx = e.currentTarget.getContext('2d')!;
          const p = point(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + 0.1, p.y + 0.1);
          ctx.stroke();
          setEmpty(false);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext('2d')!;
          const p = point(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }}
        onPointerUp={() => (drawing.current = false)}
        onPointerCancel={() => (drawing.current = false)}
      />
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={empty || saving} onClick={() => ref.current && onSave(ref.current.toDataURL('image/png'))}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <PenLine className="size-4" />} Salvar assinatura
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={empty || saving} onClick={clear}><Eraser className="size-4" /> Limpar</Button>
      </div>
    </div>
  );
}
