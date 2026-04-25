//tradeos/programs/tradeos/src/errors.rs

use anchor_lang::prelude::*;

#[error_code]
pub enum TradeOSError {
    #[msg("Trade ID must be 36 characters or less")]
    TradeTooLong,
    #[msg("Milestone basis points must sum to 10000")]
    InvalidMilestoneBps,
    #[msg("Maximum 5 milestones allowed, minimum 1")]
    InvalidMilestoneCount,
    #[msg("Escrow is not in the correct state for this action")]
    InvalidEscrowStatus,
    #[msg("Milestone index is out of range")]
    InvalidMilestoneIndex,
    #[msg("This milestone has already been released")]
    MilestoneAlreadyReleased,
    #[msg("Milestones must be released in order")]
    MilestoneOutOfOrder,
    #[msg("Only the arbiter can perform this action")]
    UnauthorizedArbiter,
    #[msg("Only the buyer or supplier can raise a dispute")]
    UnauthorizedDispute,
    #[msg("Only the buyer can request a refund")]
    UnauthorizedRefund,
    #[msg("Cannot refund after a milestone has been released")]
    RefundNotAllowed,
    #[msg("Escrow is currently in disputed state")]
    EscrowDisputed,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Release basis points cannot exceed 10000")]
    InvalidReleaseBps,
}