import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { withAuth, type AuthedRequest } from "@/lib/auth/withAuth";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

function cloudinarySignature(params: Record<string, string>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(`${toSign}${apiSecret}`).digest("hex");
}

export const POST = withAuth(async (req: AuthedRequest) => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "Cloudinary is not configured on the server." },
      { status: 500 }
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  const tradeId = (form.get("tradeId") as string | null) ?? "unknown";
  const milestoneNumber = (form.get("milestoneNumber") as string | null) ?? "unknown";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "Only JPG, PNG, WEBP, and PDF files are allowed." },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 10MB." },
      { status: 400 }
    );
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folder = `tradeos/proofs/${tradeId}`;
  const publicId = `milestone-${milestoneNumber}-${timestamp}`;
  const signParams = { folder, public_id: publicId, timestamp };
  const signature = cloudinarySignature(signParams, apiSecret);

  const uploadForm = new FormData();
  uploadForm.append("file", file);
  uploadForm.append("api_key", apiKey);
  uploadForm.append("timestamp", timestamp);
  uploadForm.append("folder", folder);
  uploadForm.append("public_id", publicId);
  uploadForm.append("signature", signature);

  const uploadRes = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
    {
      method: "POST",
      body: uploadForm,
    }
  );

  const uploadData = (await uploadRes.json()) as {
    secure_url?: string;
    public_id?: string;
    bytes?: number;
    error?: { message?: string };
  };

  if (!uploadRes.ok || !uploadData.secure_url) {
    return NextResponse.json(
      { error: uploadData.error?.message ?? "Cloudinary upload failed" },
      { status: 500 }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const proofHashSha256 = createHash("sha256").update(bytes).digest("hex");

  return NextResponse.json({
    secure_url: uploadData.secure_url,
    public_id: uploadData.public_id ?? null,
    bytes: uploadData.bytes ?? file.size,
    proof_hash_sha256: proofHashSha256,
  });
});
