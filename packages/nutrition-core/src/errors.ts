export type NutritionErrorCode =
  | 'OUT_OF_RANGE'
  | 'MISSING_FIELD'
  | 'UNSUPPORTED_AGE'
  | 'INVALID_INPUT';

/** Erro de entrada inválida para um cálculo nutricional. */
export class NutritionInputError extends Error {
  constructor(
    public readonly code: NutritionErrorCode,
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'NutritionInputError';
  }
}

export function assertRange(field: string, value: number, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new NutritionInputError('OUT_OF_RANGE', field, `${field} deve estar entre ${min} e ${max} (recebido: ${value})`);
  }
}
