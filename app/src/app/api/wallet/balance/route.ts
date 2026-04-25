import { NextResponse } from "next/server";
import { withAuth, type AuthedRequest } from "@/lib/auth/withAuth";
import { Connection, PublicKey } from "@solana/web3.js";
import { RPC_URL, USDC_MINT, USDC_DECIMALS } from "@/lib/constants";

// GET /api/wallet/balance — fetch live USDC balance from Solana
export const GET = withAuth(async (req: AuthedRequest) => {
  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const walletPubkey = new PublicKey(req.walletAddress);
    const mintPubkey = new PublicKey(USDC_MINT);
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletPubkey,
      { mint: mintPubkey },
      "confirmed"
    );
    const raw = tokenAccounts.value.reduce((sum, account) => {
      const amount =
        account.account.data.parsed.info.tokenAmount.amount ?? "0";
      return sum + BigInt(amount);
    }, BigInt(0));
    const balance = Number(raw) / Math.pow(10, USDC_DECIMALS);

    return NextResponse.json({ balance, raw: raw.toString() });
  } catch {
    // No token account or RPC issue — show zero.
    return NextResponse.json({ balance: 0, raw: "0" });
  }
});
