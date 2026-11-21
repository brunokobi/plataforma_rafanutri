/**
 * Introdução alimentar por idade, em texto próprio a partir do Guia Alimentar para Crianças Brasileiras
 * Menores de 2 Anos (Ministério da Saúde, 2019). Texto-base: a validar pela RT.
 */
export const FEEDING_STAGES = [
  {
    from: 0, to: 6, title: 'Até 6 meses',
    items: [
      'Só leite materno, em livre demanda: sem água, chás, sucos ou outros leites.',
      'Na impossibilidade do aleitamento, fórmula infantil conforme orientação profissional (leite de vaca não é indicado antes de 1 ano).',
    ],
  },
  {
    from: 6, to: 7, title: '6 meses',
    items: [
      'Início da comida: frutas amassadas ou raspadas e uma refeição principal (almoço), amassada com o garfo — nada de liquidificar ou peneirar.',
      'A refeição principal reúne cereal ou tubérculo, feijão ou outra leguminosa, legumes e verduras e carne ou ovo.',
      'Oferecer água ao longo do dia. Manter o leite materno.',
    ],
  },
  {
    from: 7, to: 9, title: '7 e 8 meses',
    items: [
      'Duas refeições principais (almoço e jantar) e frutas nos lanches.',
      'Consistência mais grossa, com pedaços pequenos e macios, para treinar a mastigação.',
      'Variar cores e sabores; um alimento recusado pode ser oferecido de novo em outros dias (8 a 10 vezes).',
    ],
  },
  {
    from: 9, to: 12, title: '9 a 11 meses',
    items: [
      'Comida picada ou desfiada, aproximando-se da comida da família.',
      'Deixar a criança pegar alimentos com a mão e participar da refeição.',
    ],
  },
  {
    from: 12, to: 24, title: '1 a 2 anos',
    items: [
      'Comida da família, com pouco sal e sem temperos prontos; 5 a 6 refeições por dia.',
      'Sem açúcar e sem produtos ultraprocessados (biscoitos, sucos de caixinha, refrigerantes, embutidos) até os 2 anos.',
      'Leite materno pode continuar até 2 anos ou mais.',
    ],
  },
] as const;

const ALWAYS = ['Mel é contraindicado antes de 1 ano (risco de botulismo).', 'Refeições sem telas, com a família, respeitando os sinais de fome e saciedade da criança.'];

export function FeedingGuide({ ageMonths }: { ageMonths: number }) {
  const current = FEEDING_STAGES.find((s) => ageMonths >= s.from && ageMonths < s.to);
  if (!current) return null;
  return (
    <section aria-labelledby="ia-title" className="space-y-2 rounded-lg border p-4">
      <h3 id="ia-title" className="font-medium">Alimentação nesta fase · {current.title}</h3>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {[...current.items, ...ALWAYS].map((t) => <li key={t}>{t}</li>)}
      </ul>
      <p className="text-xs text-muted-foreground">Base: Guia Alimentar para Crianças Brasileiras Menores de 2 Anos (Ministério da Saúde, 2019). Texto-base a validar pela nutricionista responsável.</p>
    </section>
  );
}
