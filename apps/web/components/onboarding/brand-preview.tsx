function BrandMark({ logoUrl, color, initials }: { logoUrl: string | null; color: string; initials: string }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- pré-visualização local de arquivo escolhido pelo usuário
    return <img src={logoUrl} alt="" className="size-10 rounded-lg bg-white object-contain p-1" />;
  }
  return (
    <span className="grid size-10 place-items-center rounded-lg text-sm font-bold text-white" style={{ background: color }}>
      {initials}
    </span>
  );
}

/** Pré-visualização da marca: cabeçalho do PDF e topo da área do paciente. */
export function BrandPreview({
  practiceName,
  professionalName,
  crn,
  crnRegion,
  color,
  logoUrl,
}: {
  practiceName: string;
  professionalName: string;
  crn: string;
  crnRegion: string;
  color: string;
  logoUrl: string | null;
}) {
  const initials = (practiceName || 'Seu consultório')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <div data-testid="brand-preview" className="space-y-4" aria-label="Pré-visualização da sua marca">
      <div className="overflow-hidden rounded-xl border border-border bg-white text-[#17241b] shadow-sm">
        <div className="h-1.5" style={{ background: color }} />
        <div className="flex items-center gap-3 p-4">
          <BrandMark logoUrl={logoUrl} color={color} initials={initials} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold" data-testid="preview-practice">{practiceName || 'Seu consultório'}</p>
            <p className="truncate text-xs text-[#4b5d52]">
              {professionalName || 'Seu nome'} · {crnRegion || 'CRN'} {crn || '00000'}
            </p>
          </div>
          <span className="ml-auto shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-semibold text-white" style={{ background: color }}>
            Plano alimentar
          </span>
        </div>
        <div className="space-y-1.5 px-4 pb-4">
          {['Café da manhã', 'Almoço', 'Jantar'].map((m) => (
            <div key={m} className="flex items-center justify-between rounded-md bg-[#f4f6f2] px-3 py-1.5 text-xs">
              <span className="font-medium">{m}</span>
              <span className="h-1.5 w-16 rounded-full" style={{ background: `${color}55` }} />
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto w-48 rounded-[1.6rem] border-[5px] border-[#17241b] bg-[#f9f8f3] p-2.5 text-[#17241b] shadow-lg">
        <div className="flex items-center gap-2 rounded-xl p-2 text-white" style={{ background: color }}>
          <BrandMark logoUrl={logoUrl} color={color} initials={initials} />
          <p className="truncate text-xs font-semibold">{practiceName || 'Seu consultório'}</p>
        </div>
        <p className="mt-2 px-1 text-[10px] font-medium text-[#4b5d52]">Hoje</p>
        <div className="mt-1 rounded-lg bg-white p-2 text-[10px] shadow-sm">12:30 · Almoço</div>
      </div>
    </div>
  );
}
