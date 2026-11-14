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
import { formatNutrient, TACO_GROUPS } from '@/lib/foods/taco-data';

export const metadata: Metadata = { title: 'Tabela TACO', robots: { index: false } };
export const dynamic = 'force-dynamic';

const COLS = [
  ['energy_kcal', 'kcal'],
  ['protein_g', 'Prot. (g)'],
  ['carbohydrate_g', 'Carb. (g)'],
  ['lipid_g', 'Lip. (g)'],
  ['fiber_g', 'Fibra (g)'],
] as const;

export default async function TacoPage({ searchParams }: { searchParams: Promise<{ q?: string; grupo?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/alimentos/taco');
  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);

  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q.slice(0, 80) : '';
  const group = typeof sp.grupo === 'string' && (TACO_GROUPS as readonly string[]).includes(sp.grupo) ? sp.grupo : '';
  const searching = Boolean(q.trim() || group);
  const foods = searching ? await listTaco({ q, group }) : [];

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-6 px-5 py-8">
        <div className="space-y-1">
          <Link href="/app/alimentos" className="text-sm text-muted-foreground hover:underline">← Alimentos do consultório</Link>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Tabela TACO</h1>
          <p className="text-sm text-muted-foreground">597 alimentos da Tabela Brasileira de Composição de Alimentos (NEPA/Unicamp, 4ª edição). Valores por 100 g da parte comestível.</p>
        </div>

        <form method="get" className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_16rem_auto] sm:items-end" role="search" aria-label="Buscar na TACO">
          <div className="space-y-1">
            <Label htmlFor="taco-q">Alimento</Label>
            <Input id="taco-q" name="q" defaultValue={q} placeholder="Ex.: feijão cozido, banana prata" autoComplete="off" />
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
                      {!group && <span className="block text-xs text-muted-foreground">{f.group}</span>}
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
        <p className="text-xs text-muted-foreground">NA = não analisado. Tr = traço (quantidade muito pequena, contada como zero no plano).</p>
      </main>
    </div>
  );
}
