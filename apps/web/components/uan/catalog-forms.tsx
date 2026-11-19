'use client';

import { Loader2, Plus, Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addPrice, saveIngredient, saveSupplier, searchUanFoods, type IngredientInput, type SupplierInput } from '@/lib/uan/catalog-actions';
import { ALLERGEN_LABEL, CATEGORY_LABEL, STORAGE_LABEL, UNIT_LABEL, type Allergen, type Ingredient, type IngredientCategory, type Storage, type Supplier } from '@/lib/uan/catalog';

const SELECT = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
const TEXTAREA = 'min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm';
const txt = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
type Err = { message: string; fields?: Record<string, string> } | null;

/** Busca na base pública (TACO/TBCA) para ligar o insumo aos nutrientes. */
function FoodPicker({ value, onChange }: { value: { id: number; name: string } | null; onChange: (v: { id: number; name: string } | null) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Array<{ id: number; name: string; source: string }>>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => {
      setLoading(true);
      setResults(await searchUanFoods(q));
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
        <span>Ligado a: <span className="font-medium">{value.name}</span></span>
        <Button type="button" size="icon" variant="ghost" aria-label="Desligar da base de alimentos" onClick={() => onChange(null)}><X className="size-4" /></Button>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="relative">
        <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden="true" />
        <Input aria-label="Buscar na TACO" className="pl-8" placeholder="Ex.: arroz branco cozido" value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value.trim().length < 2) setResults([]); }} />
      </div>
      {loading && <p className="text-xs text-muted-foreground">Buscando…</p>}
      {results.length > 0 && (
        <ul aria-label="Alimentos encontrados" className="max-h-48 overflow-y-auto rounded-md border border-border text-sm">
          {results.map((f) => (
            <li key={f.id}>
              <button type="button" className="w-full px-3 py-1.5 text-left hover:bg-muted" onClick={() => { onChange({ id: f.id, name: f.name }); setQ(''); setResults([]); }}>
                {f.name} <span className="text-xs text-muted-foreground">({f.source})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Cadastro ou edição de insumo. */
export function IngredientForm({ orgId, ingredient, food, onDone }: { orgId: string; ingredient?: Ingredient; food?: { id: number; name: string } | null; onDone?: (id?: string) => void }) {
  const router = useRouter();
  const [v, setV] = useState<IngredientInput>({
    name: ingredient?.name ?? '',
    category: ingredient?.category ?? 'produce',
    purchase_unit: ingredient?.purchase_unit ?? 'kg',
    storage: ingredient?.storage ?? 'ambient',
    default_fc: txt(ingredient?.default_fc ?? 1),
    density_g_ml: txt(ingredient?.density_g_ml),
    unit_weight_g: txt(ingredient?.unit_weight_g),
    pack_grams: txt(ingredient?.pack_grams),
    min_stock: txt(ingredient?.min_stock),
    added_sugar_g_100g: txt(ingredient?.added_sugar_g_100g),
    allergens: ingredient?.allergens ?? [],
    food_id: ingredient?.food_id ?? null,
    ...(ingredient ? { active: ingredient.active } : {}),
  });
  const [linked, setLinked] = useState<{ id: number; name: string } | null>(food ?? null);
  const [error, setError] = useState<Err>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof IngredientInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  const u = v.purchase_unit;

  return (
    <form
      aria-label={ingredient ? 'Dados do insumo' : 'Novo insumo'}
      className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSaved(null);
        startTransition(async () => {
          const r = await saveIngredient(orgId, ingredient?.id ?? null, { ...v, food_id: linked?.id ?? null });
          if (!r.ok) return setError(r);
          if (ingredient) setSaved('Insumo salvo.');
          router.refresh();
          onDone?.(r.id);
        });
      }}
    >
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="ing-name">Nome do insumo</Label>
        <Input id="ing-name" maxLength={120} value={v.name} onChange={set('name')} aria-invalid={Boolean(error?.fields?.name)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ing-cat">Categoria</Label>
        <select id="ing-cat" className={SELECT} value={v.category} onChange={set('category')}>
          {(Object.keys(CATEGORY_LABEL) as IngredientCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ing-storage">Armazenamento</Label>
        <select id="ing-storage" className={SELECT} value={v.storage} onChange={set('storage')}>
          {(Object.keys(STORAGE_LABEL) as Storage[]).map((s) => <option key={s} value={s}>{STORAGE_LABEL[s]}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ing-unit">Unidade de compra</Label>
        <select id="ing-unit" className={SELECT} value={u} onChange={set('purchase_unit')}>
          {Object.entries(UNIT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      {(u === 'l' || u === 'ml') && (
        <div className="space-y-1.5">
          <Label htmlFor="ing-density">Densidade (g/mL)</Label>
          <Input id="ing-density" inputMode="decimal" placeholder="1 se não souber" value={v.density_g_ml} onChange={set('density_g_ml')} />
        </div>
      )}
      {(u === 'un' || u === 'dz') && (
        <div className="space-y-1.5">
          <Label htmlFor="ing-unitw">Peso de uma unidade (g)</Label>
          <Input id="ing-unitw" inputMode="decimal" value={v.unit_weight_g} onChange={set('unit_weight_g')} aria-invalid={Boolean(error?.fields?.unit_weight_g)} />
        </div>
      )}
      {(u === 'cx' || u === 'pct') && (
        <div className="space-y-1.5">
          <Label htmlFor="ing-pack">Peso da embalagem (g)</Label>
          <Input id="ing-pack" inputMode="decimal" value={v.pack_grams} onChange={set('pack_grams')} aria-invalid={Boolean(error?.fields?.pack_grams)} />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="ing-fc">Fator de correção (FC)</Label>
        <Input id="ing-fc" inputMode="decimal" value={v.default_fc} onChange={set('default_fc')} aria-invalid={Boolean(error?.fields?.default_fc)} />
        <p className="text-xs text-muted-foreground">Peso bruto ÷ peso limpo. 1 = sem perda.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ing-min">Estoque mínimo ({UNIT_LABEL[u as keyof typeof UNIT_LABEL]})</Label>
        <Input id="ing-min" inputMode="decimal" value={v.min_stock} onChange={set('min_stock')} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ing-sugar">Açúcares adicionados (g por 100 g)</Label>
        <Input id="ing-sugar" inputMode="decimal" value={v.added_sugar_g_100g ?? ''} onChange={set('added_sugar_g_100g')} aria-invalid={Boolean(error?.fields?.added_sugar_g_100g)} />
        <p className="text-xs text-muted-foreground">Para o rótulo nutricional. Açúcar refinado = 100; deixe vazio se não tiver.</p>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Base de alimentos (nutrientes da ficha técnica)</Label>
        <FoodPicker value={linked} onChange={setLinked} />
      </div>
      <fieldset className="space-y-1.5 sm:col-span-2">
        <legend className="text-sm font-medium">Alergênicos (RDC 26/2015)</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {(Object.keys(ALLERGEN_LABEL) as Allergen[]).map((a) => (
            <label key={a} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={v.allergens.includes(a)}
                onChange={(e) => setV({ ...v, allergens: e.target.checked ? [...v.allergens, a] : v.allergens.filter((x) => x !== a) })} />
              {ALLERGEN_LABEL[a]}
            </label>
          ))}
        </div>
      </fieldset>
      {ingredient && (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="size-4" checked={v.active ?? true} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Insumo em uso
        </label>
      )}
      {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error.message}</p>}
      {saved && <p role="status" className="text-sm text-muted-foreground sm:col-span-2">{saved}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} {ingredient ? 'Salvar insumo' : 'Cadastrar insumo'}</Button>
        {onDone && !ingredient && <Button type="button" variant="ghost" onClick={() => onDone()}>Cancelar</Button>}
      </div>
    </form>
  );
}

export function NewIngredient({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (open) return <IngredientForm orgId={orgId} onDone={(id) => (id ? router.push(`/app/uan/insumos/${id}`) : setOpen(false))} />;
  return <Button type="button" onClick={() => setOpen(true)}><Plus className="size-4" /> Novo insumo</Button>;
}

/** Registro de preço (por unidade de compra), com fornecedor e vigência. */
export function PriceForm({ ingredientId, unitLabel, suppliers }: { ingredientId: string; unitLabel: string; suppliers: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [v, setV] = useState({ price: '', supplier_id: '', valid_from: '' });
  const [error, setError] = useState<Err>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      aria-label="Registrar preço"
      className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-4 sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setDone(null);
        startTransition(async () => {
          const r = await addPrice(ingredientId, v);
          if (!r.ok) return setError(r);
          setDone('Preço registrado.');
          setV({ price: '', supplier_id: v.supplier_id, valid_from: '' });
          router.refresh();
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="pr-price">Preço por {unitLabel} (R$)</Label>
        <Input id="pr-price" inputMode="decimal" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} aria-invalid={Boolean(error?.fields?.price)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pr-sup">Fornecedor</Label>
        <select id="pr-sup" className={SELECT} value={v.supplier_id} onChange={(e) => setV({ ...v, supplier_id: e.target.value })}>
          <option value="">Sem fornecedor</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pr-from">Vale a partir de</Label>
        <Input id="pr-from" type="date" value={v.valid_from} onChange={(e) => setV({ ...v, valid_from: e.target.value })} />
      </div>
      <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Registrar preço</Button>
      {error && <p role="alert" className="text-sm text-destructive sm:col-span-4">{error.message}</p>}
      {done && <p role="status" className="text-sm text-muted-foreground sm:col-span-4">{done}</p>}
    </form>
  );
}

/** Cadastro ou edição de fornecedor. */
export function SupplierForm({ orgId, supplier, onDone }: { orgId: string; supplier?: Supplier; onDone?: () => void }) {
  const router = useRouter();
  const [v, setV] = useState<SupplierInput>({
    name: supplier?.name ?? '', cnpj: supplier?.cnpj ?? '', contact_name: supplier?.contact_name ?? '', phone: supplier?.phone ?? '',
    email: supplier?.email ?? '', notes: supplier?.notes ?? '', ...(supplier ? { active: supplier.active } : {}),
  });
  const [error, setError] = useState<Err>(null);
  const [pending, startTransition] = useTransition();
  const id = (k: string) => `sup-${supplier?.id ?? 'new'}-${k}`;
  const set = (k: keyof SupplierInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form
      aria-label={supplier ? `Dados de ${supplier.name}` : 'Novo fornecedor'}
      className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await saveSupplier(orgId, supplier?.id ?? null, v);
          if (!r.ok) return setError(r);
          router.refresh();
          onDone?.();
        });
      }}
    >
      <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={id('name')}>Nome do fornecedor</Label><Input id={id('name')} maxLength={120} value={v.name} onChange={set('name')} /></div>
      <div className="space-y-1.5"><Label htmlFor={id('cnpj')}>CNPJ (opcional)</Label><Input id={id('cnpj')} inputMode="numeric" value={v.cnpj} onChange={set('cnpj')} /></div>
      <div className="space-y-1.5"><Label htmlFor={id('contact')}>Contato</Label><Input id={id('contact')} maxLength={120} value={v.contact_name} onChange={set('contact_name')} /></div>
      <div className="space-y-1.5"><Label htmlFor={id('phone')}>Telefone</Label><Input id={id('phone')} inputMode="tel" maxLength={30} value={v.phone} onChange={set('phone')} /></div>
      <div className="space-y-1.5"><Label htmlFor={id('email')}>E-mail</Label><Input id={id('email')} type="email" value={v.email} onChange={set('email')} /></div>
      <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={id('notes')}>Observações</Label><textarea id={id('notes')} className={TEXTAREA} maxLength={1000} value={v.notes} onChange={set('notes')} /></div>
      {supplier && (
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="size-4" checked={v.active ?? true} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Fornecedor ativo</label>
      )}
      {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error.message}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} {supplier ? 'Salvar fornecedor' : 'Cadastrar fornecedor'}</Button>
        {onDone && <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>}
      </div>
    </form>
  );
}

export function NewSupplier({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  if (open) return <SupplierForm orgId={orgId} onDone={() => setOpen(false)} />;
  return <Button type="button" onClick={() => setOpen(true)}><Plus className="size-4" /> Novo fornecedor</Button>;
}

export function EditSupplier({ orgId, supplier }: { orgId: string; supplier: Supplier }) {
  const [open, setOpen] = useState(false);
  if (open) return <SupplierForm orgId={orgId} supplier={supplier} onDone={() => setOpen(false)} />;
  return <Button type="button" size="sm" variant="ghost" aria-label={`Editar ${supplier.name}`} onClick={() => setOpen(true)}>Editar</Button>;
}
