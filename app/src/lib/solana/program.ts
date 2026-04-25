import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, setProvider, type Idl } from "@coral-xyz/anchor";
import { RPC_URL, PROGRAM_ID } from "@/lib/constants";
import idl from "./idl.json";

export type TradeosIDL = Idl;
const tradeosIdl = idl as unknown as Idl;

/**
 * PDA seed chunks must be <= 32 bytes.
 * DB trade IDs are UUIDs (36 chars with dashes), so we compact first.
 */
export function normalizeTradeSeed(tradeId: string): string {
  const compact = tradeId.replace(/-/g, "");
  return compact.length <= 32 ? compact : compact.slice(0, 32);
}

/** Returns a read-only Anchor connection — no wallet needed */
export function getConnection(): Connection {
  return new Connection(RPC_URL, "confirmed");
}

/**
 * Returns a read-only Anchor program instance.
 * Used for fetching account data without signing.
 */
export function getReadonlyProgram(): Program<TradeosIDL> {
  const connection = getConnection();
  // Dummy wallet for read-only — never signs anything
  const dummyWallet = {
    publicKey: PublicKey.default,
    signTransaction: async (tx: unknown) => tx,
    signAllTransactions: async (txs: unknown[]) => txs,
  };
  const provider = new AnchorProvider(connection, dummyWallet as never, {
    commitment: "confirmed",
  });
  setProvider(provider);
  return new Program<TradeosIDL>(tradeosIdl, provider);
}

/**
 * Returns an Anchor program instance bound to a signing wallet.
 * Used for all instructions that need a signature.
 */
export function getSigningProgram(wallet: {
  publicKey: PublicKey;
  signTransaction: (tx: unknown) => Promise<unknown>;
  signAllTransactions: (txs: unknown[]) => Promise<unknown[]>;
}): Program<TradeosIDL> {
  const connection = getConnection();
  const provider = new AnchorProvider(connection, wallet as never, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  setProvider(provider);
  return new Program<TradeosIDL>(tradeosIdl, provider);
}

/** Derive the escrow PDA from a trade ID */
export function deriveEscrowPda(tradeId: string): [PublicKey, number] {
  const seed = normalizeTradeSeed(tradeId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), Buffer.from(seed)],
    new PublicKey(PROGRAM_ID)
  );
}

/** Derive the escrow token account PDA from the escrow PDA */
export function deriveEscrowTokenPda(escrowPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow_token"), escrowPda.toBuffer()],
    new PublicKey(PROGRAM_ID)
  );
}

/** Derive the milestone config PDA from the escrow PDA */
export function deriveMilestoneConfigPda(escrowPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("milestones"), escrowPda.toBuffer()],
    new PublicKey(PROGRAM_ID)
  );
}
