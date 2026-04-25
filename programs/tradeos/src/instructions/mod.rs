// programs/tradeos/src/instructions/mod.rs

pub mod initialize;
pub mod fund;
pub mod release;
pub mod dispute;
pub mod resolve;
pub mod refund;

// Glob re-exports are required — named re-exports miss the
// __client_accounts_* structs that #[program] generates via #[derive(Accounts)]
pub use dispute::*;
pub use fund::*;
pub use initialize::*;
pub use refund::*;
pub use release::*;
pub use resolve::*;