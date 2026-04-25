import { NextResponse } from "next/server";
import { withAuth, type AuthedRequest } from "@/lib/auth/withAuth";
import { prisma } from "@/lib/db/prisma";
import { generateTradeNumber } from "@/lib/db/tradeNumber";
import {
  asNonEmptyString,
  asPositiveNumber,
  safeJson,
  validationErrorResponse,
} from "@/lib/api/validation";
import { randomBytes } from "node:crypto";

// GET /api/trades — list all trades where user is buyer or supplier
export const GET = withAuth(async (req: AuthedRequest) => {
  const trades = await prisma.trade.findMany({
    where: {
      OR: [
        { buyer_id: req.user.id },
        { supplier_id: req.user.id },
      ],
    },
    include: {
      buyer: true,
      supplier: true,
      milestones: { orderBy: { milestone_number: "asc" } },
    },
    orderBy: { created_at: "desc" },
  });

  return NextResponse.json(trades);
});

// POST /api/trades — create a new trade order
export const POST = withAuth(async (req: AuthedRequest) => {
  try {
    const body = await safeJson<Record<string, unknown>>(req);
    const goods_description = asNonEmptyString(
      body.goods_description,
      "goods_description"
    );
    const total_amount_usdc = asPositiveNumber(
      body.total_amount_usdc,
      "total_amount_usdc"
    );
    const goods_category =
      typeof body.goods_category === "string" ? body.goods_category : null;
    const quantity = typeof body.quantity === "string" ? body.quantity : null;
    const corridor =
      typeof body.corridor === "string" && body.corridor.trim()
        ? body.corridor
        : "NG-UAE";
    const notes = typeof body.notes === "string" ? body.notes : null;
    const pickup_location =
      typeof body.pickup_location === "string" ? body.pickup_location : null;
    const dropoff_location =
      typeof body.dropoff_location === "string" ? body.dropoff_location : null;
    const buyer_contact_name =
      typeof body.buyer_contact_name === "string"
        ? body.buyer_contact_name
        : null;
    const buyer_contact_phone =
      typeof body.buyer_contact_phone === "string"
        ? body.buyer_contact_phone
        : null;
    const supplier_contact_name =
      typeof body.supplier_contact_name === "string"
        ? body.supplier_contact_name
        : null;
    const supplier_contact_phone =
      typeof body.supplier_contact_phone === "string"
        ? body.supplier_contact_phone
        : null;
    const shipping_reference =
      typeof body.shipping_reference === "string" ? body.shipping_reference : null;
    const incoterm = typeof body.incoterm === "string" ? body.incoterm : null;
    const expected_ship_date =
      typeof body.expected_ship_date === "string"
        ? new Date(body.expected_ship_date)
        : null;
    const expected_delivery_date =
      typeof body.expected_delivery_date === "string"
        ? new Date(body.expected_delivery_date)
        : null;
    const milestones = Array.isArray(body.milestones) ? body.milestones : null;
    if (expected_ship_date && Number.isNaN(expected_ship_date.getTime())) {
      return NextResponse.json(
        { error: "expected_ship_date must be a valid date" },
        { status: 400 }
      );
    }
    if (
      expected_delivery_date &&
      Number.isNaN(expected_delivery_date.getTime())
    ) {
      return NextResponse.json(
        { error: "expected_delivery_date must be a valid date" },
        { status: 400 }
      );
    }

  // Validate milestone percentages sum to 100
    const milestonesToCreate =
      milestones?.map((m) => {
        const milestone = m as Record<string, unknown>;
        return {
          description: asNonEmptyString(
            milestone.description,
            "milestones.description"
          ),
          release_percentage: asPositiveNumber(
            milestone.release_percentage,
            "milestones.release_percentage"
          ),
        };
      }) ?? [
        { description: "Shipping proof uploaded", release_percentage: 30 },
        {
          description: "Customs cleared / arrived at destination",
          release_percentage: 40,
        },
        { description: "Buyer confirms receipt of goods", release_percentage: 30 },
      ];

    const percentageSum = milestonesToCreate.reduce(
      (sum: number, m: { release_percentage: number }) =>
        sum + m.release_percentage,
      0
    );

    if (percentageSum !== 100) {
      return NextResponse.json(
        { error: "Milestone percentages must sum to 100" },
        { status: 400 }
      );
    }

    for (let i = 0; i < 5; i += 1) {
      try {
        const trade = await prisma.trade.create({
          data: {
            trade_number: generateTradeNumber(),
            buyer_id: req.user.id,
            goods_description,
            goods_category,
            quantity,
            total_amount_usdc,
            corridor,
            supplier_invite_token: randomBytes(16).toString("hex"),
            pickup_location,
            dropoff_location,
            buyer_contact_name,
            buyer_contact_phone,
            supplier_contact_name,
            supplier_contact_phone,
            expected_ship_date,
            expected_delivery_date,
            shipping_reference,
            incoterm,
            notes,
            status: "pending_supplier",
            milestones: {
              create: milestonesToCreate.map(
                (
                  m: { description: string; release_percentage: number },
                  idx: number
                ) => ({
                  milestone_number: idx + 1,
                  description: m.description,
                  release_percentage: m.release_percentage,
                  release_amount_usdc:
                    (Number(total_amount_usdc) * m.release_percentage) / 100,
                  status: "pending",
                })
              ),
            },
          },
          include: {
            buyer: true,
            milestones: { orderBy: { milestone_number: "asc" } },
          },
        });

        return NextResponse.json(
          {
            ...trade,
            supplier_invite_link: `${process.env.NEXT_PUBLIC_APP_URL}/trades/${trade.id}?invite_token=${trade.supplier_invite_token}`,
          },
          { status: 201 }
        );
      } catch (error) {
        const maybeKnown = error as { code?: string };
        if (maybeKnown.code !== "P2002" || i === 4) {
          throw error;
        }
      }
    }

    return NextResponse.json(
      { error: "Failed to generate a unique trade number" },
      { status: 500 }
    );
  } catch (error) {
    return validationErrorResponse(error);
  }
});