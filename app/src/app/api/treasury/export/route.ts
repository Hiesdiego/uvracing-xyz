import { NextResponse } from "next/server";
import { withAuth, type AuthedRequest } from "@/lib/auth/withAuth";
import { prisma } from "@/lib/db/prisma";

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export const GET = withAuth(async (req: AuthedRequest) => {
  const trades = await prisma.trade.findMany({
    where: {
      OR: [{ buyer_id: req.user.id }, { supplier_id: req.user.id }],
    },
    include: {
      milestones: { orderBy: { milestone_number: "asc" } },
      receipt: true,
      disputes: { orderBy: { created_at: "asc" } },
      _count: { select: { disputes: true } },
    },
    orderBy: { created_at: "asc" },
  });

  const rows: string[][] = [
    [
      "trade_id",
      "trade_number",
      "role",
      "status",
      "created_at",
      "updated_at",
      "total_amount_usdc",
      "released_amount_usdc",
      "locked_amount_usdc",
      "has_dispute",
      "dispute_count",
      "latest_dispute_status",
      "receipt_hash",
      "previous_receipt_hash",
      "proof_hashes_sha256",
      "proof_anchor_txs",
    ],
  ];

  for (const trade of trades) {
    const role = trade.buyer_id === req.user.id ? "buyer" : "supplier";
    const total = Number(trade.total_amount_usdc);
    const released = (trade.milestones ?? []).reduce((sum, m) => {
      if (m.status !== "released") return sum;
      return sum + (Number(trade.total_amount_usdc) * m.release_percentage) / 100;
    }, 0);
    const locked = Math.max(0, total - released);
    const proofHashes = (trade.milestones ?? [])
      .map((m) => m.proof_hash_sha256)
      .filter(Boolean)
      .join("|");
    const proofAnchors = (trade.milestones ?? [])
      .map((m) => m.proof_anchor_tx)
      .filter(Boolean)
      .join("|");
    const latestDispute = trade.disputes[trade.disputes.length - 1];

    rows.push([
      trade.id,
      trade.trade_number,
      role,
      trade.status,
      trade.created_at.toISOString(),
      trade.updated_at.toISOString(),
      total.toFixed(2),
      released.toFixed(2),
      locked.toFixed(2),
      trade._count.disputes > 0 ? "yes" : "no",
      String(trade._count.disputes),
      latestDispute?.status ?? "",
      trade.receipt?.receipt_hash ?? "",
      trade.receipt?.previous_receipt_hash ?? "",
      proofHashes,
      proofAnchors,
    ]);
  }

  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const filename = `tradeos_treasury_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
