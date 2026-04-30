import {
  PublicKey,
  SendTransactionError,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { getConnection, getSigningProgram } from "@/lib/solana/program";
import { RPC_URL, SOLANA_NETWORK } from "@/lib/constants";

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

type SigningWallet = {
  publicKey: PublicKey;
  signTransaction: (tx: unknown) => Promise<unknown>;
  signAllTransactions: (txs: unknown[]) => Promise<unknown[]>;
};

export async function anchorProofHashOnChain(input: {
  wallet: SigningWallet;
  tradeId: string;
  milestoneNumber: number;
  proofHashSha256: string;
}): Promise<string> {
  const connection = getConnection();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const memo = `tradeos:witness:v1:trade=${input.tradeId}:m=${input.milestoneNumber}:h=${input.proofHashSha256}`;
  const instruction = new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memo, "utf8"),
  });

  const tx = new Transaction({
    feePayer: input.wallet.publicKey,
    recentBlockhash: blockhash,
  }).add(instruction);

  let sig: string;
  try {
    const program = getSigningProgram(input.wallet);
    const provider = program.provider as AnchorProvider;
    sig = await provider.sendAndConfirm(tx, [], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
      maxRetries: 3,
      skipPreflight: false,
    });
  } catch (error) {
    if (error instanceof SendTransactionError) {
      const logs = await error.getLogs(connection).catch(() => null);
      throw new Error(
        `Proof attestation simulation failed on ${SOLANA_NETWORK} (RPC ${RPC_URL}): ${error.message}${logs ? `\nLogs:\n${logs.join("\n")}` : ""}`
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Proof attestation send failed on ${SOLANA_NETWORK} (RPC ${RPC_URL}): ${message}`
    );
  }

  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  return sig;
}
