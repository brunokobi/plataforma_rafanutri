'use client';

import { useRouter } from 'next/navigation';
import { RecipeForm, type RecipeInitial } from '@/components/foods/recipe-form';

export function RecipeEditor({ initial, missing }: { initial: RecipeInitial; missing: number }) {
  const router = useRouter();
  return (
    <>
      {missing > 0 && (
        <p role="status" className="text-sm text-destructive">
          {missing} ingrediente(s) não estão mais disponíveis e foram retirados. Revise antes de salvar.
        </p>
      )}
      <RecipeForm initial={initial} onCancel={() => router.push('/app/alimentos')} onDone={() => router.push('/app/alimentos')} />
    </>
  );
}
