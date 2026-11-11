import { MealPlanEditor } from '@/components/clinical/meal-plan-editor';
import { DEMO_PLAN } from '@/lib/demo/foods';
import { DEMO_TACO_CODES, demoFoodsAsFoods, demoPlanWithTaco } from '@/lib/demo/taco-plan';
import { tacoFoodsByCodeRepo } from '@/lib/foods/repository';

export const dynamic = 'force-dynamic';

export default async function DemoMealPlanPage() {
  const byCode = await tacoFoodsByCodeRepo(DEMO_TACO_CODES);
  const taco = byCode ? demoPlanWithTaco(byCode) : null;
  if (taco) return <MealPlanEditor initialPlan={taco.plan} initialFoods={taco.foods} />;
  // Directus fora do ar: o editor continua funcionando com a base de exemplo local.
  return <MealPlanEditor initialPlan={DEMO_PLAN} initialFoods={demoFoodsAsFoods()} offline />;
}
