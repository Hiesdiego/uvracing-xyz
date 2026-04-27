//tradeos/programs/tradeos/src/instructions/initialize.rs


use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::errors::TradeOSError;
use crate::state::escrow::{EscrowStatus, TradeEscrow};
use crate::state::milestone::{MilestoneConfig, MilestoneEntry};

pub fn handler(
    ctx: Context<InitializeEscrow>,
    trade_id: String,
    supplier: Pubkey,
    arbiter: Pubkey,
    total_amount: u64,
    milestone_bps: Vec<u16>,
) -> Result<()> {
    // Validate inputs
    require!(trade_id.len() <= 36, TradeOSError::TradeTooLong);
    require!(
        !milestone_bps.is_empty() && milestone_bps.len() <= 5,
        TradeOSError::InvalidMilestoneCount
    );
    let bps_sum: u16 = milestone_bps.iter().sum();
    require!(bps_sum == 10000, TradeOSError::InvalidMilestoneBps);

    // Initialize escrow account
    let escrow = &mut ctx.accounts.escrow;
    escrow.trade_id = trade_id;
    escrow.buyer = ctx.accounts.buyer.key();
    escrow.supplier = supplier;
    escrow.arbiter = arbiter;
    escrow.total_amount = total_amount;
    escrow.released_amount = 0;
    escrow.milestone_count = milestone_bps.len() as u8;
    escrow.current_milestone = 0;
    escrow.status = EscrowStatus::PendingFunding;
    escrow.bump = ctx.bumps.escrow;
    escrow.token_bump = ctx.bumps.escrow_token_account;

    // Initialize milestone config
    let milestone_config = &mut ctx.accounts.milestone_config;
    milestone_config.escrow = ctx.accounts.escrow.key();
    milestone_config.milestones = milestone_bps
        .iter()
        .map(|&bps| MilestoneEntry {
            release_bps: bps,
            released: false,
        })
        .collect();
    milestone_config.bump = ctx.bumps.milestone_config;

    Ok(())
}

#[derive(Accounts)]
#[instruction(trade_id: String)]
pub struct InitializeEscrow<'info> {
    /// Buyer pays for account creation and will fund the escrow
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// Escrow PDA — holds all trade state
    /// Seeds: ["escrow", trade_id] — deterministic from DB trade ID
    #[account(
        init,
        payer = buyer,
        space = TradeEscrow::LEN,
        seeds = [b"escrow", trade_id.as_bytes()],
        bump
    )]
    pub escrow: Account<'info, TradeEscrow>,

    /// Milestone config PDA — stores the payment split configuration
    /// Seeds: ["milestones", escrow_pubkey]
    #[account(
        init,
        payer = buyer,
        space = MilestoneConfig::LEN,
        seeds = [b"milestones", escrow.key().as_ref()],
        bump
    )]
    pub milestone_config: Account<'info, MilestoneConfig>,

    /// USDC token account owned by the escrow PDA — holds the locked funds
    /// Seeds: ["escrow_token", escrow_pubkey]
    /// Authority is the escrow PDA so only the program can sign releases
    #[account(
        init,
        payer = buyer,
        token::mint = usdc_mint,
        token::authority = escrow,
        seeds = [b"escrow_token", escrow.key().as_ref()],
        bump
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    /// The USDC mint — used to validate the token account
    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}