import { NextResponse } from "next/server";
import { withAuth, type AuthedRequest } from "@/lib/auth/withAuth";
import { prisma } from "@/lib/db/prisma";

// GET /api/users/me — fetch the current user's full profile
export const GET = withAuth(async (req: AuthedRequest) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
  });
  return NextResponse.json(user);
});

// PATCH /api/users/me — update profile fields
export const PATCH = withAuth(async (req: AuthedRequest) => {
  const body = await req.json();
  const { display_name, business_name, country, role, telegram_username } = body;

  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: {
      ...(display_name !== undefined && { display_name }),
      ...(business_name !== undefined && { business_name }),
      ...(country !== undefined && { country }),
      ...(role !== undefined && { role }),
      ...(telegram_username !== undefined && { telegram_username }),
    },
  });

  return NextResponse.json(updated);
});