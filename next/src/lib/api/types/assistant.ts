export type AssistantConversation = {
  id: string;
  title?: string | null;
  status: string;
  last_message_at?: string | null;
  summary?: string | null;
  inserted_at?: string | null;
  updated_at?: string | null;
};

export type AssistantMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool" | string;
  content: string;
  inserted_at?: string | null;
};

export type AssistantDocumentChunk = {
  id: string;
  chunk_index: number;
  heading_path?: string | null;
  content: string;
  token_count?: number | null;
};

export type AssistantDocument = {
  id: string;
  title: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  content_sha256: string;
  status: string;
  uploaded_by_id: string;
  approved_by_id?: string | null;
  approved_at?: string | null;
  inserted_at?: string | null;
  updated_at?: string | null;
  chunks?: AssistantDocumentChunk[];
};

export type AssistantFaq = {
  id: string;
  question: string;
  answer: string;
  status: string;
  source: string;
  usage_count: number;
  created_by_id?: string | null;
  approved_by_id?: string | null;
  approved_at?: string | null;
  inserted_at?: string | null;
  updated_at?: string | null;
};

export type AssistantFaqDraft = {
  id: string;
  question_digest_key: string;
  suggested_question: string;
  suggested_answer?: string | null;
  evidence_count: number;
  sample_message_ids?: { ids?: string[] } | Record<string, unknown> | null;
  status: string;
  inserted_at?: string | null;
  updated_at?: string | null;
};

export type AssistantQuestionDigest = {
  id: string;
  digest_key: string;
  normalized_question: string;
  count: number;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  latest_conversation_id?: string | null;
};

export type AssistantAnalytics = {
  total_chat_volume: number;
  active_users: number;
  pending_faq_drafts: number;
  approved_faqs: number;
  approved_documents: number;
  top_question_digests: AssistantQuestionDigest[];
};
