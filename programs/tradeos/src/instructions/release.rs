//tradeos/programs/tradeos/src/instructions/release.rs

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::errors::TradeOSError;
use crate::state::escrow::{EscrowStatus, TradeEscrow};
use crate::state::milestone::MilestoneConfig;

pub fn handler(ctx: Context<ReleaseMilestone>, milestone_index: u8) -> Result<()> {
    // ✅ Capture AccountInfo BEFORE taking the mutable borrow
    let escrow_account_info = ctx.accounts.escrow.to_account_info();

    let escrow = &mut ctx.accounts.escrow;
    let milestone_config = &mut ctx.accounts.milestone_config;

    require!(
        escrow.status == EscrowStatus::Funded || escrow.status == EscrowStatus::InProgress,
        TradeOSError::InvalidEscrowStatus
    );
    require!(
        (milestone_index as usize) < milestone_config.milestones.len(),
        TradeOSError::InvalidMilestoneIndex
    );
    require!(
        milestone_index == escrow.current_milestone,
        TradeOSError::MilestoneOutOfOrder
    );
    require!(
        !milestone_config.milestones[milestone_index as usize].released,
        TradeOSError::MilestoneAlreadyReleased
    );

    let release_bps = milestone_config.milestones[milestone_index as usize].release_bps as u128;
    let release_amount = (escrow.total_amount as u128)
        .checked_mul(release_bps)
        .ok_or(TradeOSError::ArithmeticOverflow)?
        .checked_div(10000)
        .ok_or(TradeOSError::ArithmeticOverflow)? as u64;

    let trade_id = escrow.trade_id.clone();
    let escrow_bump = escrow.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[b"escrow", trade_id.as_bytes(), &[escrow_bump]]];

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        Transfer {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.supplier_token_account.to_account_info(),
            authority: escrow_account_info, // ✅ use pre-captured info
        },
        signer_seeds,
    );
    token::transfer(transfer_ctx, release_amount)?;

    milestone_config.milestones[milestone_index as usize].released = true;
    escrow.released_amount = escrow
        .released_amount
        .checked_add(release_amount)
        .ok_or(TradeOSError::ArithmeticOverflow)?;
    escrow.current_milestone = escrow
        .current_milestone
        .checked_add(1)
        .ok_or(TradeOSError::ArithmeticOverflow)?;
    escrow.status = EscrowStatus::InProgress;

    if escrow.current_milestone == escrow.milestone_count {
        escrow.status = EscrowStatus::Completed;
    }

    Ok(())
}

#[derive(Accounts)]
#[instruction(milestone_index: u8)]
pub struct ReleaseMilestone<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.trade_id.as_bytes()],
        bump = escrow.bump,
        has_one = buyer @ TradeOSError::UnauthorizedBuyerRelease,
    )]
    pub escrow: Account<'info, TradeEscrow>,

    #[account(
        mut,
        seeds = [b"milestones", escrow.key().as_ref()],
        bump = milestone_config.bump,
        has_one = escrow,
    )]
    pub milestone_config: Account<'info, MilestoneConfig>,

    #[account(
        mut,
        seeds = [b"escrow_token", escrow.key().as_ref()],
        bump = escrow.token_bump,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = supplier_token_account.owner == escrow.supplier,
    )]
    pub supplier_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
