import {
  PublicKey,
  Transaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import {
  getSigningProgram,
  getConnection,
  deriveEscrowPda,
  deriveEscrowTokenPda,
  deriveMilestoneConfigPda,
  normalizeTradeSeed,
} from "./program";
import { USDC_MINT, USDC_FACTOR, ARBITER_WALLET } from "@/lib/constants";

type SigningWallet = {
  publicKey: PublicKey;
  signTransaction: (tx: unknown) => Promise<unknown>;
  signAllTransactions: (txs: unknown[]) => Promise<unknown[]>;
};

/**
 * initialize_escrow — buyer creates the on-chain escrow account
 * Called when trade moves from pending_supplier → pending_funding
 */
export async function initializeEscrow({
  wallet,
  tradeId,
  supplierWallet,
  totalAmountUsdc,
  milestoneBps,
}: {
  wallet: SigningWallet;
  tradeId: string;
  supplierWallet: string;
  totalAmountUsdc: number;
  milestoneBps: number[]; // e.g. [3000, 4000, 3000]
}): Promise<string> {
  const program = getSigningProgram(wallet);
  const connection = getConnection();
  const tradeSeed = normalizeTradeSeed(tradeId);

  const [escrowPda] = deriveEscrowPda(tradeSeed);
  const [escrowTokenPda] = deriveEscrowTokenPda(escrowPda);
  const [milestoneConfigPda] = deriveMilestoneConfigPda(escrowPda);
  const usdcMint = new PublicKey(USDC_MINT);

  const totalAtoms = new BN(Math.round(totalAmountUsdc * USDC_FACTOR));

  const tx = await program.methods
    .initializeEscrow(
      tradeSeed,
      new PublicKey(supplierWallet),
      new PublicKey(ARBITER_WALLET),
      totalAtoms,
      milestoneBps
    )
    .accounts({
      buyer: wallet.publicKey,
      escrow: escrowPda,
      milestoneConfig: milestoneConfigPda,
      escrowTokenAccount: escrowTokenPda,
      usdcMint,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc({ commitment: "confirmed" });

  return tx;
}

/**
 * fund_escrow — buyer deposits USDC into the on-chain escrow
 * Called after initialize_escrow succeeds
 */
export async function fundEscrow({
  wallet,
  tradeId,
  totalAmountUsdc,
}: {
  wallet: SigningWallet;
  tradeId: string;
  totalAmountUsdc: number;
}): Promise<string> {
  const program = getSigningProgram(wallet);
  const connection = getConnection();

  const [escrowPda] = deriveEscrowPda(tradeId);
  const [escrowTokenPda] = deriveEscrowTokenPda(escrowPda);
  const usdcMint = new PublicKey(USDC_MINT);

  // Get or create the buyer's USDC associated token account
  const buyerAta = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);

  // Check if the ATA exists; if not, create it first
  const ataInfo = await connection.getAccountInfo(buyerAta);
  const preInstructions = [];
  if (!ataInfo) {
    preInstructions.push(
      createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        buyerAta,
        wallet.publicKey,
        usdcMint
      )
    );
  }

  const totalAtoms = new BN(Math.round(totalAmountUsdc * USDC_FACTOR));

  const tx = await program.methods
    .fundEscrow(totalAtoms)
    .accounts({
      buyer: wallet.publicKey,
      escrow: escrowPda,
      escrowTokenAccount: escrowTokenPda,
      buyerTokenAccount: buyerAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions(preInstructions)
    .rpc({ commitment: "confirmed" });

  return tx;
}

/**
 * release_milestone — arbiter releases a milestone payment to the supplier
 * In MVP, this is signed by the platform admin wallet
 */
export async function releaseMilestone({
  wallet,
  tradeId,
  milestoneIndex,
  supplierWallet,
}: {
  wallet: SigningWallet;
  tradeId: string;
  milestoneIndex: number;
  supplierWallet: string;
}): Promise<string> {
  const program = getSigningProgram(wallet);

  const [escrowPda] = deriveEscrowPda(tradeId);
  const [escrowTokenPda] = deriveEscrowTokenPda(escrowPda);
  const [milestoneConfigPda] = deriveMilestoneConfigPda(escrowPda);
  const usdcMint = new PublicKey(USDC_MINT);
  const supplierPubkey = new PublicKey(supplierWallet);

  const supplierAta = await getAssociatedTokenAddress(usdcMint, supplierPubkey);

  const tx = await program.methods
    .releaseMilestone(milestoneIndex)
    .accounts({
      arbiter: wallet.publicKey,
      escrow: escrowPda,
      milestoneConfig: milestoneConfigPda,
      escrowTokenAccount: escrowTokenPda,
      supplierTokenAccount: supplierAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed" });

  return tx;
}

/**
 * raise_dispute — buyer or supplier freezes the escrow
 */
export async function raiseDispute({
  wallet,
  tradeId,
  milestoneIndex,
  reason,
}: {
  wallet: SigningWallet;
  tradeId: string;
  milestoneIndex: number;
  reason: string;
}): Promise<string> {
  const program = getSigningProgram(wallet);

  const [escrowPda] = deriveEscrowPda(tradeId);
  const [milestoneConfigPda] = deriveMilestoneConfigPda(escrowPda);

  const tx = await program.methods
    .raiseDispute(milestoneIndex, reason)
    .accounts({
      caller: wallet.publicKey,
      escrow: escrowPda,
      milestoneConfig: milestoneConfigPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed" });

  return tx;
}

/**
 * refund_escrow — buyer cancels and reclaims all USDC
 * Only valid before any milestone has been released
 */
export async function refundEscrow({
  wallet,
  tradeId,
}: {
  wallet: SigningWallet;
  tradeId: string;
}): Promise<string> {
  const program = getSigningProgram(wallet);

  const [escrowPda] = deriveEscrowPda(tradeId);
  const [escrowTokenPda] = deriveEscrowTokenPda(escrowPda);
  const usdcMint = new PublicKey(USDC_MINT);
  const buyerAta = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);

  const tx = await program.methods
    .refundEscrow()
    .accounts({
      buyer: wallet.publicKey,
      escrow: escrowPda,
      escrowTokenAccount: escrowTokenPda,
      buyerTokenAccount: buyerAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed" });

  return tx;
}

/**
 * Fetch the live escrow account state from the chain
 */
export async function fetchEscrowAccount(tradeId: string) {
  const { getReadonlyProgram } = await import("./program");
  const program = getReadonlyProgram();
  const [escrowPda] = deriveEscrowPda(tradeId);
  try {
    const accountNamespace = program.account as unknown as Record<
      string,
      { fetch: (pubkey: PublicKey) => Promise<unknown> }
    >;
    const accountFetcher =
      accountNamespace.tradeEscrow ??
      accountNamespace.TradeEscrow ??
      accountNamespace.escrow;
    if (!accountFetcher) return null;
    const account = await accountFetcher.fetch(escrowPda);
    return account;
  } catch {
    return null;
  }
}
