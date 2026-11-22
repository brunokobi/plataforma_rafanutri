import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { listTaco } from '@/lib/foods/taco';
import { formatNutrient, isPublicSource, PUBLIC_SOURCES, SOURCE_SHORT, TACO_GROUPS } from '@/lib/foods/taco-data';

export const metadata: Metadata = { title: 'Tabelas de composição', robots: { index: false } };
export const dynamic = 'force-dynamic';

const COLS = [
  ['energy_kcal', 'kcal'],
  ['protein_g', 'Prot. (g)'],
  ['carbohydrate_g', 'Carb. (g)'],
  ['lipid_g', 'Lip. (g)'],
  ['fiber_g', 'Fibra (g)'],
] as const;

export default async function TacoPage({ searchParams }: { searchParams: Promise<{ q?: string; grupo?: string; fonte?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/alimentos/taco');
  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);

  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q.slice(0, 80) : '';
  const group = typeof sp.grupo === 'string' && (TACO_GROUPS as readonly string[]).includes(sp.grupo) ? sp.grupo : '';
  const source = isPublicSource(sp.fonte) || sp.fonte === 'ALL' ? sp.fonte : '';
  const searching = Boolean(q.trim() || group);
  const foods = searching ? await listTaco({ q, group, source }) : [];

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-6 px-5 py-8">
        <div className="space-y-1">
          <Link href="/app/alimentos" className="text-sm text-muted-foreground hover:underline">← Alimentos do consultório</Link>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Tabelas de composição</h1>
          <p className="text-sm text-muted-foreground">
            TACO (NEPA/Unicamp, 4ª edição) e cerca de 1.900 alimentos e preparações da POF 2008-2009 do IBGE, com medidas caseiras. Em &quot;Todas as tabelas&quot;, também produtos industrializados pelo rótulo (Open Food Facts) e a base do USDA, com micronutrientes completos e nomes traduzidos. Valores por 100 g da parte comestível.
          </p>
        </div>

        <form method="get" className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_12rem_14rem_auto] sm:items-end" role="search" aria-label="Buscar nas tabelas">
          <div className="space-y-1">
            <Label htmlFor="taco-q">Alimento</Label>
            <Input id="taco-q" name="q" defaultValue={q} placeholder="Ex.: feijão cozido, banana prata" autoComplete="off" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="taco-fonte">Tabela</Label>
            <select id="taco-fonte" name="fonte" defaultValue={source} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">TACO e IBGE</option>
              <option value="ALL">Todas as tabelas</option>
              {Object.entries(PUBLIC_SOURCES).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="taco-grupo">Grupo</Label>
            <select id="taco-grupo" name="grupo" defaultValue={group} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">Todos</option>
              {TACO_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <Button type="submit">Buscar</Button>
        </form>

        {!searching ? (
          <p className="text-sm text-muted-foreground">Digite o nome de um alimento ou escolha um grupo.</p>
        ) : foods === null ? (
          <Alert variant="destructive"><AlertDescription>Não foi possível consultar a tabela agora. Tente de novo em instantes.</AlertDescription></Alert>
        ) : foods.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum alimento encontrado. Tente outra palavra (a busca ignora acentos).</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <caption className="sr-only">Alimentos encontrados, valores por 100 g</caption>
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Alimento</th>
                  {COLS.map(([k, l]) => <th key={k} scope="col" className="px-3 py-2 text-right font-medium">{l}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y">
                {foods.map((f) => (
                  <tr key={f.id}>
                    <td className="px-3 py-2">
                      <Link href={`/app/alimentos/taco/${f.id}`} className="font-medium underline-offset-4 hover:underline">{f.name}</Link>
                      <span className="block text-xs text-muted-foreground">{[SOURCE_SHORT[f.source] ?? f.source, !group ? f.group : null].filter(Boolean).join(' · ')}</span>
                    </td>
                    {COLS.map(([k]) => (
                      <td key={k} className="px-3 py-2 text-right tabular-nums">{formatNutrient({ amount: f.per100g[k] ?? null, trace: false })}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">NA = não analisado (na base do IBGE, valor não disponível). Tr = traço (quantidade muito pequena, contada como zero no plano).</p>
      </main>
    </div>
  );
}
