//tradeos/programs/tradeos/src/lib.rs

//tradeos/programs/tradeos/src/lib.rs

use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

pub use instructions::*;

declare_id!("AJxre8cru2aZNHynSBtFSUSfioCVFHHNiSoPedq8nYP9");

#[program]
pub mod tradeos {
    use super::*;

    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        trade_id: String,
        supplier: Pubkey,
        arbiter: Pubkey,
        total_amount: u64,
        milestone_bps: Vec<u16>,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, trade_id, supplier, arbiter, total_amount, milestone_bps)
    }

    pub fn fund_escrow(ctx: Context<FundEscrow>, amount: u64) -> Result<()> {
        instructions::fund::handler(ctx, amount)
    }

    pub fn release_milestone(ctx: Context<ReleaseMilestone>, milestone_index: u8) -> Result<()> {
        instructions::release::handler(ctx, milestone_index)
    }

    pub fn raise_dispute(ctx: Context<RaiseDispute>, milestone_index: u8, reason: String) -> Result<()> {
        instructions::dispute::handler(ctx, milestone_index, reason)
    }

    pub fn resolve_dispute(ctx: Context<ResolveDispute>, release_to_supplier_bps: u16) -> Result<()> {
        instructions::resolve::handler(ctx, release_to_supplier_bps)
    }

    pub fn refund_escrow(ctx: Context<RefundEscrow>) -> Result<()> {
        instructions::refund::handler(ctx)
    }
}