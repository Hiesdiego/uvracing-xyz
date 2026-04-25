import { NextResponse } from "next/server";

export class ApiValidationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApiValidationError";
    this.status = status;
  }
}

export async function safeJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiValidationError("Invalid JSON body");
  }
}

export function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiValidationError(`${field} is required`);
  }
  return value.trim();
}

export function asPositiveNumber(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ApiValidationError(`${field} must be a positive number`);
  }
  return parsed;
}

export function asPositiveInt(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiValidationError(`${field} must be a positive integer`);
  }
  return parsed;
}

export function validationErrorResponse(error: unknown) {
  if (error instanceof ApiValidationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  throw error;
}
