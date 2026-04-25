use anchor_lang::prelude::*;

#[account]
pub struct TradeEscrow {
    pub trade_id: String,        // UUID from DB, max 36 chars
    pub buyer: Pubkey,           // Lagos/Accra merchant wallet
    pub supplier: Pubkey,        // Dubai supplier wallet
    pub arbiter: Pubkey,         // Platform admin/arbiter wallet
    pub total_amount: u64,       // Total USDC in atomic units (6 decimals)
    pub released_amount: u64,    // How much has been paid out so far
    pub milestone_count: u8,     // Total number of milestones (1-5)
    pub current_milestone: u8,   // Index of next milestone to release
    pub status: EscrowStatus,
    pub bump: u8,                // Escrow PDA bump
    pub token_bump: u8,          // Escrow token account PDA bump
}

impl TradeEscrow {
    // 8 (discriminator)
    // + 40 (4 len prefix + 36 max string bytes for trade_id)
    // + 32 + 32 + 32 (three pubkeys)
    // + 8 + 8 (two u64s)
    // + 1 + 1 (two u8s)
    // + 1 (enum)
    // + 1 + 1 (two bump u8s)
    pub const LEN: usize = 8 + 40 + 32 + 32 + 32 + 8 + 8 + 1 + 1 + 1 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum EscrowStatus {
    PendingFunding, // Initialized, waiting for buyer to deposit
    Funded,         // Buyer funded, supplier can begin shipment
    InProgress,     // At least one milestone released
    Disputed,       // Dispute raised, escrow frozen
    Completed,      // All milestones released, trade done
    Refunded,       // Cancelled, full refund sent to buyer
}