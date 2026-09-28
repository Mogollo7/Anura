import type { NextRequest } from "next/server";
import { proxyTo } from "@/lib/auth/server-proxy";

function handler(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return params.then(({ path }) => proxyTo("observation-service", req, ["observations", ...path]));
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
