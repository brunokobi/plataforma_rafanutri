export declare const PRACTICE_PLANS: readonly ('essential' | 'professional' | 'clinic')[];
export declare const PAID_PLANS: readonly ('essential' | 'professional' | 'clinic')[];
export declare const MATERNAL_PLANS: readonly ('professional' | 'clinic')[];
export declare const AI_DAILY_LIMIT: Readonly<Record<'free' | 'essential' | 'professional' | 'clinic' | 'enterprise_uan', number>>;

export type LegalDocument = 'professional_terms' | 'patient_terms' | 'privacy';
export declare const LEGAL_VERSIONS: Readonly<Record<LegalDocument, string>>;
export type ShareKey = 'show_kcal' | 'show_macros' | 'show_weight_history' | 'show_maternal' | 'show_body' | 'self_weight' | 'water' | 'goals' | 'meal_checks' | 'weight_neutral';
export declare const SHARE_KEYS: readonly ShareKey[];

export type NotificationKind =
  | 'appointment_reminder' | 'appointment_scheduled' | 'appointment_changed' | 'appointment_cancelled' | 'plan_published' | 'patient_invite' | 'test'
  | 'invoice_created' | 'invoice_due' | 'payment_reported' | 'payment_confirmed' | 'subscription_ended' | 'feeding_reaction'
  | 'message_to_patient' | 'message_to_professional' | 'water_reminder';
export declare const NOTIFICATION_KINDS: Readonly<Record<NotificationKind, { label: string; important: boolean }>>;
export declare const REMINDER_HOURS: readonly (72 | 48 | 24 | 12 | 6 | 3 | 2 | 1)[];

export type AttentionReason = 'no_return' | 'never_seen' | 'plan_expired' | 'plan_expiring' | 'no_plan' | 'no_assessment' | 'risk_high' | 'pending_anamnesis' | 'home_idle';
export declare const ATTENTION_REASONS: Readonly<Record<AttentionReason, string>>;
export declare const ATTENTION_RULES: Readonly<{ defaultReturnDays: number; neverSeenGraceDays: number; planExpiringDays: number; noAssessmentDays: number; homeIdleDays: number }>;

export interface FeedingCatalogItem { code: string; label: string; fromMonths: number; tip: string }
export declare const ALLERGENS: readonly FeedingCatalogItem[];
export declare const TEXTURES: readonly FeedingCatalogItem[];
export type Reaction = 'none' | 'mild' | 'moderate' | 'severe';
export declare const REACTION_LABEL: Readonly<Record<Reaction, string>>;
export declare const SERIOUS_REACTIONS: readonly Reaction[];
export type FeedingType = 'exclusive' | 'predominant' | 'complemented' | 'mixed';
export declare const FEEDING_TYPE_LABEL: Readonly<Record<FeedingType, string>>;
export type Relationship = 'mother' | 'father' | 'grandparent' | 'legal_guardian' | 'other';
export declare const RELATIONSHIP_LABEL: Readonly<Record<Relationship, string>>;
export type ConsentMethod = 'in_person' | 'signed_form' | 'other';
export declare const CONSENT_LABEL: Readonly<Record<ConsentMethod, string>>;

export declare const SCREENING_TOOL_VERSIONS: Readonly<Record<'nrs_2002' | 'must' | 'sga', string>>;
