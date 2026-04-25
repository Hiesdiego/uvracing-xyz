//tradeos/programs/tradeos/src/instructions/refund.rs

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::errors::TradeOSError;
use crate::state::escrow::{EscrowStatus, TradeEscrow};

pub fn handler(ctx: Context<RefundEscrow>) -> Result<()> {
    // ✅ Capture AccountInfo BEFORE taking the mutable borrow
    let escrow_account_info = ctx.accounts.escrow.to_account_info();

    let escrow = &mut ctx.accounts.escrow;
    require!(escrow.released_amount == 0, TradeOSError::RefundNotAllowed);

    let escrow_balance = ctx.accounts.escrow_token_account.amount;

    if escrow_balance > 0 {
        let trade_id = escrow.trade_id.clone();
        let escrow_bump = escrow.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[b"escrow", trade_id.as_bytes(), &[escrow_bump]]];

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.buyer_token_account.to_account_info(),
                authority: escrow_account_info, // ✅
            },
            signer_seeds,
        );
        token::transfer(transfer_ctx, escrow_balance)?;
    }

    escrow.status = EscrowStatus::Refunded;

    Ok(())
}

#[derive(Accounts)]
pub struct RefundEscrow<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.trade_id.as_bytes()],
        bump = escrow.bump,
        has_one = buyer @ TradeOSError::UnauthorizedRefund,
        constraint = (
            escrow.status == EscrowStatus::PendingFunding
            || escrow.status == EscrowStatus::Funded
        ) @ TradeOSError::RefundNotAllowed,
        constraint = escrow.released_amount == 0 @ TradeOSError::RefundNotAllowed,
    )]
    pub escrow: Account<'info, TradeEscrow>,

    #[account(
        mut,
        seeds = [b"escrow_token", escrow.key().as_ref()],
        bump = escrow.token_bump,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(mut, constraint = buyer_token_account.owner == buyer.key())]
    pub buyer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}