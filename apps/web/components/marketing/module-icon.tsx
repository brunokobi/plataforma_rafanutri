import { Baby, Briefcase, ChefHat, Dumbbell, Landmark, MessageCircle, Smartphone, Sparkles, Stethoscope, type LucideIcon } from 'lucide-react';
import type { ModuleIcon as Key } from '@/lib/marketing/modules';

const ICONS: Record<Key, LucideIcon> = {
  stethoscope: Stethoscope, smartphone: Smartphone, message: MessageCircle, dumbbell: Dumbbell, baby: Baby,
  briefcase: Briefcase, sparkles: Sparkles, chef: ChefHat, landmark: Landmark,
};

export function ModuleIcon({ icon, className }: { icon: Key; className?: string }) {
  const Icon = ICONS[icon];
  return <Icon className={className} aria-hidden="true" />;
}
