export type QuestionType = 'text' | 'textarea' | 'number' | 'single' | 'multiple' | 'yesno' | 'date' | 'scale';

export interface QuestionOption {
  value: string;
  label: string;
}

/** Condição de exibição: a resposta de uma pergunta anterior é igual a (`equals`) ou contém (`includes`, múltipla escolha). */
export type ShowIf = { question: string; equals: string | number | boolean } | { question: string; includes: string };

export interface Question {
  id: string;
  type: QuestionType;
  label: string;
  help?: string;
  required?: boolean;
  options?: QuestionOption[];
  min?: number;
  max?: number;
  unit?: string;
  /** Rótulos das pontas da escala (ex.: "nada", "muito"). */
  min_label?: string;
  max_label?: string;
  show_if?: ShowIf;
}

export interface Section {
  id?: string;
  title: string;
  description?: string;
  questions: Question[];
}

export interface Questionnaire {
  version: 1;
  sections: Section[];
}

export type AnswerValue = string | number | boolean | string[];
export type Answers = Record<string, AnswerValue>;

export declare const QUESTION_TYPES: QuestionType[];
export declare const FORMAT_VERSION: 1;
export declare function allQuestions(schema: Questionnaire): Question[];
export declare function validateQuestionnaire(schema: unknown): string[];
export declare function isVisible(question: Question, answers: Answers): boolean;
export declare function validateAnswers(
  schema: Questionnaire,
  input: unknown,
  options?: { partial?: boolean },
): { ok: boolean; errors: Record<string, string>; answers: Answers };
export declare function formatAnswer(question: Question, value: AnswerValue | undefined | null): string;
