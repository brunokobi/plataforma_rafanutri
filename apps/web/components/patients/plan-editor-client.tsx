'use client';

import { useRouter } from 'next/navigation';
import { MealPlanEditor, type MealPlanEditorProps } from '@/components/clinical/meal-plan-editor';
import { publishMealPlan, saveMealPlan } from '@/lib/meal-plans/actions';
import type { PlanContent } from '@/lib/meal-plans/schema';

/** Liga o editor às ações de salvar e publicar do plano do paciente. */
export function PlanEditorClient({ patientId, planId, editable, ...props }: Omit<MealPlanEditorProps, 'onSave' | 'onPublish' | 'readOnly'> & { patientId: string; planId: string; editable: boolean }) {
  const router = useRouter();
  return (
    <MealPlanEditor
      {...props}
      readOnly={!editable}
      onSave={editable ? (c: PlanContent) => saveMealPlan(patientId, planId, c) : undefined}
      onPublish={
        editable
          ? async (c: PlanContent) => {
              const r = await publishMealPlan(patientId, planId, c);
              if (r.ok) router.refresh();
              return r;
            }
          : undefined
      }
    />
  );
}
