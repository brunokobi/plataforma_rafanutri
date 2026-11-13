import type { MealPlanPdfData } from './meal-plan-data';

/**
 * Plano em texto para o WhatsApp (formatação do próprio WhatsApp: *negrito*).
 * Usa os mesmos dados do PDF: refeições, medidas caseiras, substituições, orientações e validade.
 */
export function planToWhatsappText(data: MealPlanPdfData, firstName: string): string {
  const lines: string[] = [];
  lines.push(`Olá, ${firstName}! Segue o seu plano alimentar${data.validUntil ? `, válido até ${data.validUntil}` : ''}.`);
  for (const m of data.meals) {
    if (m.items.length === 0) continue;
    lines.push('', `*${m.time} · ${m.name}*`);
    for (const i of m.items) {
      const qty = data.mode === 'quantitative' && i.measure ? `${i.measure} de ` : '';
      lines.push(`• ${qty}${data.mode === 'quantitative' && i.measure ? i.name.toLowerCase() : i.name}`);
      if (i.substitutions.length) lines.push(`  ou ${i.substitutions.join(' / ')}`);
    }
  }
  if (data.guidelines.length) {
    lines.push('', '*Orientações*');
    for (const g of data.guidelines) lines.push(`• ${g}`);
  }
  if (data.recipes.length) {
    lines.push('', '*Preparações*');
    for (const r of data.recipes) lines.push(`• ${r.name}: ${r.ingredients.join('; ')}.${r.instructions ? ` ${r.instructions}` : ''}`);
  }
  lines.push('', `${data.practice.professionalName} · ${data.practice.crnRegion} ${data.practice.crn}`.trim());
  return lines.join('\n');
}

/** Link `wa.me` com a mensagem; sem telefone, o WhatsApp pede para escolher o contato. */
export function whatsappShareLink(phoneE164: string | null | undefined, text: string): string {
  const phone = phoneE164 ? phoneE164.replace(/\D/g, '') : '';
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
