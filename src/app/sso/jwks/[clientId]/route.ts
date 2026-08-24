import { NextResponse } from "next/server";
import { LOCAL_AUTH_CLIENT_ID, isLocalAuthEnabled } from "../../../../../lib/localAuthConfig";
import { getLocalAuthJwks } from "@/lib/local-auth";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ clientId: string }> },
): Promise<Response> {
  const { clientId } = await context.params;

  if (!isLocalAuthEnabled() || clientId !== LOCAL_AUTH_CLIENT_ID) {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.json(getLocalAuthJwks(), {
    headers: { "Cache-Control": "no-store" },
  });
}
