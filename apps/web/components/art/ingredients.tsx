// Ilustrações vetoriais próprias (sem licença de terceiros). Ver public/images/CREDITS.md.
import { cn } from '@/lib/utils';

type ArtProps = { className?: string };

export function Leaf({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 120 80" aria-hidden="true" className={cn('h-auto', className)}>
      <path d="M6 70C30 18 72 4 114 8 106 50 68 78 6 70z" fill="#4CAF50" />
      <path d="M6 70C40 52 72 32 114 8" stroke="#2E7D32" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M40 52l-4-18M58 41l-2-20M76 30l2-16M50 46l18 6M68 36l18 4" stroke="#2E7D32" strokeWidth="2" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}

export function LemonSlice({ className }: ArtProps) {
  const seg = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={cn('h-auto', className)}>
      <circle cx="50" cy="50" r="48" fill="#F2C94C" />
      <circle cx="50" cy="50" r="42" fill="#FFF3B0" />
      {seg.map((a) => (
        <path
          key={a}
          d="M50 50 L50 13 A37 37 0 0 1 76.2 23.8 Z"
          fill="#FBE27A"
          stroke="#FFF8D6"
          strokeWidth="3"
          transform={`rotate(${a} 50 50)`}
        />
      ))}
      <circle cx="50" cy="50" r="5" fill="#FFF8D6" />
    </svg>
  );
}

export function Strawberry({ className }: ArtProps) {
  const seeds: Array<[number, number]> = [[38, 44], [52, 40], [64, 48], [44, 58], [58, 62], [50, 74], [36, 66], [66, 70]];
  return (
    <svg viewBox="0 0 100 110" aria-hidden="true" className={cn('h-auto', className)}>
      <path d="M50 104C24 92 12 64 16 46c3-14 18-20 34-18 16-2 31 4 34 18 4 18-8 46-34 58z" fill="#E5484D" />
      <path d="M50 104C38 96 28 80 26 62" stroke="#F87171" strokeWidth="5" fill="none" strokeLinecap="round" opacity=".6" />
      {seeds.map(([x, y]) => (
        <ellipse key={`${x}-${y}`} cx={x} cy={y} rx="2" ry="3" fill="#FDE68A" />
      ))}
      <path d="M50 30c-8-10-22-12-30-6 10 0 18 4 22 10-10-2-18 2-22 8 10-4 20-4 28 0 8-4 18-4 28 0-4-6-12-10-22-8 4-6 12-10 22-10-8-6-22-4-26 6z" fill="#3E8E41" />
      <path d="M50 30V14" stroke="#2E7D32" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Almond({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 60 90" aria-hidden="true" className={cn('h-auto', className)}>
      <path d="M30 4C12 22 6 48 12 68c4 12 12 18 18 18s14-6 18-18c6-20 0-46-18-64z" fill="#B7794A" />
      <path d="M30 10c-6 18-8 40-4 70M22 30c-2 12-2 26 2 40M38 30c2 12 1 26-3 40" stroke="#8C5A33" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".55" />
    </svg>
  );
}

export function Blueberries({ className }: ArtProps) {
  const berries: Array<[number, number, number]> = [[30, 40, 18], [58, 34, 16], [46, 62, 17]];
  return (
    <svg viewBox="0 0 90 90" aria-hidden="true" className={cn('h-auto', className)}>
      {berries.map(([x, y, r]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r={r} fill="#3B4CB8" />
          <circle cx={x - r / 3} cy={y - r / 3} r={r / 3} fill="#6E7FE0" opacity=".6" />
          <path d={`M${x - 4} ${y - r + 3}l4 4 4-4`} stroke="#1E2A7A" strokeWidth="2" fill="none" />
        </g>
      ))}
    </svg>
  );
}

export function Avocado({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 100 130" aria-hidden="true" className={cn('h-auto', className)}>
      <path d="M50 6C30 6 26 30 18 52 8 80 18 124 50 124s42-44 32-72C74 30 70 6 50 6z" fill="#2F5D1E" />
      <path d="M50 14C35 14 32 34 26 54c-8 24 0 62 24 62s32-38 24-62C68 34 65 14 50 14z" fill="#C9E28B" />
      <circle cx="50" cy="80" r="18" fill="#8A5A2B" />
      <circle cx="44" cy="74" r="5" fill="#B07A45" opacity=".7" />
    </svg>
  );
}

/** Prato visto de cima, com salada colorida. */
export function SaladBowl({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 400 400" aria-hidden="true" className={cn('h-auto', className)}>
      <defs>
        <radialGradient id="bowl" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E8EDE4" />
        </radialGradient>
        <filter id="bowlShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="18" stdDeviation="18" floodColor="#0B2E13" floodOpacity=".35" />
        </filter>
      </defs>
      <circle cx="200" cy="200" r="182" fill="url(#bowl)" filter="url(#bowlShadow)" />
      <circle cx="200" cy="200" r="150" fill="#F6F8F2" />
      {/* folhas */}
      <path d="M90 190c20-60 80-90 140-70-30 30-80 60-140 70z" fill="#5DBB63" />
      <path d="M150 300c-10-60 30-110 90-120-10 40-40 90-90 120z" fill="#43A047" />
      <path d="M300 150c10 50-20 100-80 120 0-40 30-100 80-120z" fill="#7CC576" />
      <path d="M120 240c40-20 90-10 120 20-40 10-90 10-120-20z" fill="#2E7D32" opacity=".85" />
      {/* tomates */}
      <circle cx="140" cy="150" r="26" fill="#E5484D" />
      <circle cx="140" cy="150" r="16" fill="#F87171" />
      <circle cx="270" cy="270" r="24" fill="#E5484D" />
      <circle cx="270" cy="270" r="14" fill="#F87171" />
      {/* abacate */}
      <path d="M230 120c30-10 60 10 56 40-4 26-40 34-58 14-14-16-12-46 2-54z" fill="#C9E28B" stroke="#2F5D1E" strokeWidth="6" />
      {/* grão-de-bico e sementes */}
      {[[200, 240], [215, 255], [190, 262], [230, 238], [176, 244]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="10" fill="#E8C68A" stroke="#C99E5A" strokeWidth="2" />
      ))}
      {[[120, 220], [128, 232], [300, 210], [310, 222], [250, 320], [260, 312]].map(([x, y]) => (
        <ellipse key={`${x}-${y}`} cx={x} cy={y} rx="4" ry="2.5" fill="#3D3D29" />
      ))}
      {/* cenoura ralada */}
      <path d="M170 110l30 14M178 102l26 20M300 240l-24 18M292 232l-20 22" stroke="#F59E0B" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
