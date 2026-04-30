// app/src/lib/solana/program.ts

import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  AnchorProvider,
  Program,
  setProvider,
  type Idl,
} from "@coral-xyz/anchor";
import { RPC_URL, RPC_WS_URL, PROGRAM_ID } from "@/lib/constants";
import idl from "./idl.json";

export type TradeosIDL = Idl;
const tradeosIdl = idl as unknown as Idl;
let sharedConnection: Connection | null = null;

/**
 * PDA seed chunks must be <= 32 bytes.
 * DB trade IDs are UUIDs (36 chars with dashes), so we compact first.
 */
export function normalizeTradeSeed(tradeId: string): string {
  const compact = tradeId.replace(/-/g, "");
  return compact.length <= 32 ? compact : compact.slice(0, 32);
}

/** Returns a read-only Anchor connection (no wallet needed). */
export function getConnection(): Connection {
  if (sharedConnection) return sharedConnection;
  sharedConnection = new Connection(RPC_URL, {
    commitment: "confirmed",
    wsEndpoint: RPC_WS_URL,
  });
  return sharedConnection;
}

/** Best-effort websocket cleanup for app unmount/HMR/reloads. */
export function cleanupConnection(): void {
  if (!sharedConnection) return;
  const maybeWs = (sharedConnection as unknown as { _rpcWebSocket?: { close?: () => void } })
    ._rpcWebSocket;
  if (maybeWs && typeof maybeWs.close === "function") {
    try {
      maybeWs.close();
    } catch {
      // noop
    }
  }
  sharedConnection = null;
}

// ---------------------------------------------------------------------------
// buildAnchorWallet
//
// Anchor and Privy (in this app stack) expect Transaction-like objects as
// signing inputs. Keep return handling flexible in case a wallet adapter
// returns signed bytes instead of a transaction object.
// ---------------------------------------------------------------------------
function buildAnchorWallet(wallet: {
  publicKey: PublicKey;
  signTransaction: (tx: unknown) => Promise<unknown>;
  signAllTransactions: (txs: unknown[]) => Promise<unknown[]>;
}) {
  async function signOne<T extends Transaction | VersionedTransaction>(
    tx: T
  ): Promise<T> {
    const isVersioned = tx instanceof VersionedTransaction;
    const result = await wallet.signTransaction(tx);

    // Wallet adapters may return:
    //   (a) signed bytes -> deserialize to Transaction/VersionedTransaction
    //   (b) Transaction / VersionedTransaction directly
    const isBytes =
      result instanceof Uint8Array ||
      ArrayBuffer.isView(result) ||
      (result != null &&
        typeof result === "object" &&
        "byteLength" in (result as object) &&
        !("serialize" in (result as object)));

    if (isBytes) {
      const signedBytes = result as Uint8Array;
      if (isVersioned) {
        return VersionedTransaction.deserialize(signedBytes) as T;
      }
      return Transaction.from(signedBytes) as T;
    }

    return result as T;
  }

  return {
    publicKey: wallet.publicKey,

    signTransaction: <T extends Transaction | VersionedTransaction>(
      tx: T
    ): Promise<T> => signOne(tx),

    signAllTransactions: <T extends Transaction | VersionedTransaction>(
      txs: T[]
    ): Promise<T[]> => Promise.all(txs.map((tx) => signOne(tx))),
  };
}

/**
 * Returns a read-only Anchor program instance.
 * Used for fetching account data without signing.
 */
export function getReadonlyProgram(): Program<TradeosIDL> {
  const connection = getConnection();
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
 * buildAnchorWallet keeps signing input/output compatible across adapters.
 */
export function getSigningProgram(wallet: {
  publicKey: PublicKey;
  signTransaction: (tx: unknown) => Promise<unknown>;
  signAllTransactions: (txs: unknown[]) => Promise<unknown[]>;
}): Program<TradeosIDL> {
  const connection = getConnection();
  const anchorWallet = buildAnchorWallet(wallet);

  const provider = new AnchorProvider(connection, anchorWallet as never, {
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
export function deriveEscrowTokenPda(
  escrowPda: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow_token"), escrowPda.toBuffer()],
    new PublicKey(PROGRAM_ID)
  );
}

/** Derive the milestone config PDA from the escrow PDA */
export function deriveMilestoneConfigPda(
  escrowPda: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("milestones"), escrowPda.toBuffer()],
    new PublicKey(PROGRAM_ID)
  );
}
