use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::errors::TradeOSError;
use crate::state::escrow::{EscrowStatus, TradeEscrow};

pub fn handler(ctx: Context<FundEscrow>, amount: u64) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;

    // Amount must exactly match the agreed trade total
    require!(
        amount == escrow.total_amount,
        TradeOSError::InvalidEscrowStatus
    );

    // Transfer USDC from buyer's wallet into the escrow token account
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.key(),
        Transfer {
            from: ctx.accounts.buyer_token_account.to_account_info(),
            to: ctx.accounts.escrow_token_account.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, amount)?;

    escrow.status = EscrowStatus::Funded;

    Ok(())
}

#[derive(Accounts)]
pub struct FundEscrow<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// Escrow must be in PendingFunding state, and caller must be the buyer
    #[account(
        mut,
        seeds = [b"escrow", escrow.trade_id.as_bytes()],
        bump = escrow.bump,
        has_one = buyer @ TradeOSError::UnauthorizedRefund,
        constraint = escrow.status == EscrowStatus::PendingFunding @ TradeOSError::InvalidEscrowStatus,
    )]
    pub escrow: Account<'info, TradeEscrow>,

    /// The escrow's USDC holding account — funds land here
    #[account(
        mut,
        seeds = [b"escrow_token", escrow.key().as_ref()],
        bump = escrow.token_bump,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    /// Buyer's personal USDC account — funds come from here
    #[account(
        mut,
        constraint = buyer_token_account.owner == buyer.key(),
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
