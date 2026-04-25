//tradeos/programs/tradeos/src/instructions/resolve.rs

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::errors::TradeOSError;
use crate::state::escrow::{EscrowStatus, TradeEscrow};

pub fn handler(ctx: Context<ResolveDispute>, release_to_supplier_bps: u16) -> Result<()> {
    require!(
        release_to_supplier_bps <= 10_000,
        TradeOSError::InvalidReleaseBps
    );

    // ✅ Capture AccountInfo BEFORE taking the mutable borrow
    let escrow_account_info = ctx.accounts.escrow.to_account_info();

    let escrow = &mut ctx.accounts.escrow;
    require!(
        escrow.status == EscrowStatus::Disputed,
        TradeOSError::EscrowDisputed
    );

    let escrow_balance = ctx.accounts.escrow_token_account.amount;
    let supplier_amount = (escrow_balance as u128)
        .checked_mul(release_to_supplier_bps as u128)
        .ok_or(TradeOSError::ArithmeticOverflow)?
        .checked_div(10_000)
        .ok_or(TradeOSError::ArithmeticOverflow)? as u64;
    let buyer_amount = escrow_balance
        .checked_sub(supplier_amount)
        .ok_or(TradeOSError::ArithmeticOverflow)?;

    let trade_id = escrow.trade_id.clone();
    let escrow_bump = escrow.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[b"escrow", trade_id.as_bytes(), &[escrow_bump]]];

    if supplier_amount > 0 {
        let supplier_transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.supplier_token_account.to_account_info(),
                authority: escrow_account_info.clone(), // ✅
            },
            signer_seeds,
        );
        token::transfer(supplier_transfer_ctx, supplier_amount)?;
    }

    if buyer_amount > 0 {
        let buyer_transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.buyer_token_account.to_account_info(),
                authority: escrow_account_info, // ✅
            },
            signer_seeds,
        );
        token::transfer(buyer_transfer_ctx, buyer_amount)?;
    }

    escrow.released_amount = escrow
        .released_amount
        .checked_add(supplier_amount)
        .ok_or(TradeOSError::ArithmeticOverflow)?;
    escrow.status = EscrowStatus::Completed;

    Ok(())
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(mut)]
    pub arbiter: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.trade_id.as_bytes()],
        bump = escrow.bump,
        has_one = arbiter @ TradeOSError::UnauthorizedArbiter,
        constraint = escrow.status == EscrowStatus::Disputed @ TradeOSError::EscrowDisputed,
    )]
    pub escrow: Account<'info, TradeEscrow>,

    #[account(
        mut,
        seeds = [b"escrow_token", escrow.key().as_ref()],
        bump = escrow.token_bump,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(mut, constraint = supplier_token_account.owner == escrow.supplier)]
    pub supplier_token_account: Account<'info, TokenAccount>,

    #[account(mut, constraint = buyer_token_account.owner == escrow.buyer)]
    pub buyer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}