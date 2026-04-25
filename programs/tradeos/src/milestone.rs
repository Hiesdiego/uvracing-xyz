use anchor_lang::prelude::*;

#[account]
pub struct MilestoneConfig {
    pub escrow: Pubkey,                  // Parent escrow account
    pub milestones: Vec<MilestoneEntry>, // Max 5 milestones
    pub bump: u8,
}

impl MilestoneConfig {
    // 8 (discriminator)
    // + 32 (escrow pubkey)
    // + 4 (vec length prefix) + 5 * 3 (max 5 entries, each 3 bytes)
    // + 1 (bump)
    pub const LEN: usize = 8 + 32 + 4 + (5 * MilestoneEntry::LEN) + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MilestoneEntry {
    pub release_bps: u16, // Basis points: 3000 = 30%, must all sum to 10000
    pub released: bool,
}

impl MilestoneEntry {
    pub const LEN: usize = 2 + 1; // u16 + bool
}