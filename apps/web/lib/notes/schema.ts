/** Evolução do prontuário (RN-023), como devolvida por GET /rafanutri/patients/:id/notes. */
export interface ClinicalNote {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  body: string;
  supersedes_id: string | null;
  user_created: string | null;
  date_created: string;
  date_updated: string | null;
  signed_at: string | null;
  signer_name: string | null;
  signer_crn: string | null;
  /** true = escrita pelo usuário logado (só o autor edita, assina ou apaga o rascunho). */
  own: boolean;
}

export type NoteResult = { ok: true; id?: string } | { ok: false; message: string };
