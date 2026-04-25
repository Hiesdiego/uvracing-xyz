import { Connection } from "@solana/web3.js";
import { RPC_URL } from "@/lib/constants";
import { ApiValidationError } from "@/lib/api/validation";

const connection = new Connection(RPC_URL, "confirmed");

export async function assertChainBackedTx(txSignature: string) {
  const statusResp = await connection.getSignatureStatuses([txSignature], {
    searchTransactionHistory: true,
  });
  const status = statusResp.value[0];

  if (!status) {
    throw new ApiValidationError("Transaction signature not found on-chain");
  }
  if (status.err) {
    throw new ApiValidationError("Transaction failed on-chain");
  }

  const tx = await connection.getTransaction(txSignature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  if (!tx) {
    throw new ApiValidationError("Transaction is not yet confirmed on-chain");
  }
}

function getTokenAmountForOwnerAndMint(
  balances: {
    mint: string;
    owner?: string;
    uiTokenAmount: { amount: string };
  }[],
  owner: string,
  mint: string
): bigint {
  return balances
    .filter((entry) => entry.mint === mint && entry.owner === owner)
    .reduce((sum, entry) => sum + BigInt(entry.uiTokenAmount.amount), BigInt(0));
}

export async function assertEscrowFundingTx(params: {
  txSignature: string;
  buyerWalletAddress: string;
  escrowPubkey: string;
  usdcMint: string;
  expectedAmountAtoms: bigint;
}) {
  const {
    txSignature,
    buyerWalletAddress,
    escrowPubkey,
    usdcMint,
    expectedAmountAtoms,
  } = params;

  const parsed = await connection.getParsedTransaction(txSignature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });

  if (!parsed) {
    throw new ApiValidationError("Funding transaction not found on-chain");
  }
  if (parsed.meta?.err) {
    throw new ApiValidationError("Funding transaction failed on-chain");
  }

  const accountKeys = parsed.transaction.message.accountKeys.map((key) =>
    typeof key === "string" ? key : key.pubkey.toBase58()
  );

  if (!accountKeys.includes(buyerWalletAddress)) {
    throw new ApiValidationError(
      "Funding transaction does not include the buyer wallet"
    );
  }

  if (!accountKeys.includes(escrowPubkey)) {
    throw new ApiValidationError(
      "Funding transaction does not include the expected escrow account"
    );
  }

  const pre = parsed.meta?.preTokenBalances ?? [];
  const post = parsed.meta?.postTokenBalances ?? [];

  const escrowBefore = getTokenAmountForOwnerAndMint(pre, escrowPubkey, usdcMint);
  const escrowAfter = getTokenAmountForOwnerAndMint(post, escrowPubkey, usdcMint);
  const escrowDelta = escrowAfter - escrowBefore;

  if (escrowDelta !== expectedAmountAtoms) {
    throw new ApiValidationError(
      "Funding amount does not match the expected trade amount"
    );
  }
}
