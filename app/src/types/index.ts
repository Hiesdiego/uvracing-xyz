//app/src/types/index.ts

export type TradeStatus =
  | "pending_supplier"
  | "pending_funding"
  | "funded"
  | "in_progress"
  | "milestone_1_released"
  | "milestone_2_released"
  | "completed"
  | "disputed"
  | "cancelled"
  | "refunded";

export type MilestoneStatus =
  | "pending"
  | "proof_uploaded"
  | "released"
  | "disputed";

export type UserRole = "buyer" | "supplier" | "both";

export interface User {
  id: string;
  wallet_address: string;
  display_name: string | null;
  email: string | null;
  telegram_chat_id: string | null;
  telegram_username: string | null;
  role: UserRole | null;
  country: string | null;
  business_name: string | null;
  reputation_score: number;
  total_trades: number;
  completed_trades: number;
  disputed_trades: number;
  created_at: string;
}

export interface Trade {
  id: string;
  trade_number: string;
  buyer_id: string;
  supplier_id: string | null;
  supplier_invite_token?: string | null;
  supplier_invite_link?: string | null;
  goods_description: string;
  goods_category: string | null;
  quantity: string | null;
  total_amount_usdc: number;
  escrow_pubkey: string | null;
  status: TradeStatus;
  corridor: string;
  pickup_location?: string | null;
  dropoff_location?: string | null;
  buyer_contact_name?: string | null;
  buyer_contact_phone?: string | null;
  supplier_contact_name?: string | null;
  supplier_contact_phone?: string | null;
  expected_ship_date?: string | null;
  expected_delivery_date?: string | null;
  shipping_reference?: string | null;
  incoterm?: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  buyer?: User;
  supplier?: User;
  milestones?: Milestone[];
}

export interface Milestone {
  id: string;
  trade_id: string;
  milestone_number: number;
  description: string;
  release_percentage: number;
  release_amount_usdc: number | null;
  status: MilestoneStatus;
  proof_url: string | null;
  proof_hash_sha256: string | null;
  proof_anchor_tx: string | null;
  proof_rejection_reason: string | null;
  proof_rejected_at: string | null;
  proof_version: number;
  proof_uploaded_at: string | null;
  released_at: string | null;
  tx_signature: string | null;
}

export interface Dispute {
  id: string;
  trade_id: string;
  milestone_id: string | null;
  raised_by: string;
  reason: string;
  status: "open" | "under_review" | "resolved_buyer" | "resolved_supplier" | "resolved_split";
  arbiter_notes: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface ReputationEvent {
  id: string;
  user_id: string;
  trade_id: string;
  event_type: string;
  score_delta: number;
  created_at: string;
}
