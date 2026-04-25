import { NextResponse } from "next/server";
import { withAuth, type AuthedRequest } from "@/lib/auth/withAuth";
import { prisma } from "@/lib/db/prisma";
import {
  asNonEmptyString,
  safeJson,
  validationErrorResponse,
} from "@/lib/api/validation";
import { assertEscrowFundingTx } from "@/lib/solana/verify";
import { USDC_FACTOR, USDC_MINT } from "@/lib/constants";

type Context = { params: { tradeId: string } };

// POST /api/trades/[tradeId]/fund
// Called AFTER the on-chain fund_escrow tx is confirmed
// Records the escrow pubkey and flips trade status to funded
export const POST = withAuth(async (req: AuthedRequest, ctx: Context) => {
  try {
    const { tradeId } = ctx.params;
    const body = await safeJson<Record<string, unknown>>(req);
    const escrow_pubkey = asNonEmptyString(body.escrow_pubkey, "escrow_pubkey");
    const tx_signature = asNonEmptyString(body.tx_signature, "tx_signature");

    const trade = await prisma.trade.findUnique({
      where: { id: tradeId },
      include: { buyer: true },
    });
    if (!trade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    if (trade.buyer_id !== req.user.id) {
      return NextResponse.json(
        { error: "Only the buyer can fund" },
        { status: 403 }
      );
    }

    if (trade.status !== "pending_funding") {
      return NextResponse.json(
        { error: "Trade is not awaiting funding" },
        { status: 400 }
      );
    }
    if (trade.escrow_pubkey && trade.escrow_pubkey !== escrow_pubkey) {
      return NextResponse.json(
        { error: "Escrow pubkey does not match existing trade escrow" },
        { status: 409 }
      );
    }

    const expectedAmountAtoms = BigInt(
      Math.round(Number(trade.total_amount_usdc) * USDC_FACTOR)
    );

    await assertEscrowFundingTx({
      txSignature: tx_signature,
      buyerWalletAddress: trade.buyer.wallet_address,
      escrowPubkey: escrow_pubkey,
      usdcMint: USDC_MINT,
      expectedAmountAtoms,
    });

    const updated = await prisma.trade.update({
      where: { id: tradeId },
      data: {
        escrow_pubkey,
        status: "funded",
      },
      include: {
        buyer: true,
        supplier: true,
        milestones: { orderBy: { milestone_number: "asc" } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return validationErrorResponse(error);
  }
});
