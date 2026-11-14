export type RecommendationStatus = 'draft' | 'published';

export interface Recommendation {
  id: string;
  category: string;
  title: string;
  body: string;
  pinned: boolean;
  status: RecommendationStatus;
  published_at: string | null;
  read_at: string | null;
  date_created: string;
  date_updated: string | null;
}

/** Como o paciente vê (só publicadas). */
export type PatientRecommendation = Pick<Recommendation, 'id' | 'category' | 'title' | 'body' | 'pinned' | 'published_at' | 'read_at'>;

export interface RecommendationInput {
  category: string;
  title: string;
  body: string;
  pinned?: boolean;
}

export type RecommendationResult = { ok: true } | { ok: false; message: string; fields?: Record<string, string> };
