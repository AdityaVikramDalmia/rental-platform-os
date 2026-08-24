import Link from "next/link";
import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { fetchQuery } from "convex/nextjs";
import { AlertCircle, CheckCircle2, Clock3, Sparkles } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { OWNER_INVITE_STATUS } from "../../../../../lib/constants";
import { formatDateTime } from "../../../../../lib/dates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  params: Promise<{ token: string }>;
};

type InviteViewState =
  | {
      kind: "valid";
      signInUrl: string;
      listingContext: {
        buildingName: string | null;
        societyName: string | null;
        bhkConfig: string;
      } | null;
      expiresAt: number;
    }
  | {
      kind: "consumed";
      title: string;
      message: string;
      icon: React.ReactNode;
      signInUrl: string;
    }
  | {
      kind: "expired" | "invalid";
      title: string;
      message: string;
      icon: React.ReactNode;
    };

function encodeInviteState(token: string): string {
  return Buffer.from(JSON.stringify({ invite_token: token }), "utf-8").toString("base64");
}

async function resolveInviteState(token: string): Promise<InviteViewState> {
  const invite = await fetchQuery(api.ownerInvites.getByToken, { invite_token: token });

  if (!invite) {
    return {
      kind: "invalid",
      title: "Invalid invite link",
      message: "This invite link is invalid or no longer available.",
      icon: <AlertCircle className="size-9 text-rose-500" />,
    };
  }

  const isExpired = invite.expires_at <= Date.now();

  if (invite.status === OWNER_INVITE_STATUS.CONSUMED) {
    const signInUrl = await getSignInUrl({ state: encodeInviteState(token) });

    return {
      kind: "consumed",
      title: "Invite already used",
      message: "This invite has already been used to join the conversation.",
      icon: <CheckCircle2 className="size-9 text-emerald-500" />,
      signInUrl,
    };
  }

  if (invite.status === OWNER_INVITE_STATUS.EXPIRED || isExpired) {
    return {
      kind: "expired",
      title: "Invite expired",
      message: "This invite has expired. Please contact your property manager for a new link.",
      icon: <Clock3 className="size-9 text-amber-500" />,
    };
  }

  if (invite.status !== OWNER_INVITE_STATUS.PENDING) {
    return {
      kind: "invalid",
      title: "Invalid invite link",
      message: "This invite is no longer active. Please request a fresh invite link.",
      icon: <AlertCircle className="size-9 text-rose-500" />,
    };
  }

  const signInUrl = await getSignInUrl({ state: encodeInviteState(token) });

  return {
    kind: "valid",
    signInUrl,
    expiresAt: invite.expires_at,
    listingContext: invite.listing_context
      ? {
          buildingName: invite.listing_context.building_name,
          societyName: invite.listing_context.society_name,
          bhkConfig: invite.listing_context.bhk_config,
        }
      : null,
  };
}

export default async function OwnerInviteLandingPage({ params }: Props) {
  const { token } = await params;
  const viewState = await resolveInviteState(token);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-800 px-4 py-16 text-slate-100">
      <div className="mx-auto max-w-md">
        <p className="mb-6 text-center font-mono text-xs uppercase tracking-[0.26em] text-slate-400">
          DemoRentals
        </p>

        <Card className="overflow-hidden border-slate-700/80 bg-slate-900/80 shadow-2xl shadow-slate-950/60 backdrop-blur-sm">
          <div className="h-1 w-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-indigo-400" />

          {viewState.kind === "valid" ? (
            <>
              <CardHeader className="space-y-3">
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-200">
                  <Sparkles className="size-3.5" />
                  Owner Invite
                </div>
                <CardTitle className="text-2xl font-semibold leading-tight text-white">
                  You&apos;ve been invited to discuss property terms
                </CardTitle>
                <p className="text-sm text-slate-300">
                  Sign in with Google to join the conversation securely.
                </p>
              </CardHeader>

              <CardContent className="space-y-5">
                <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-3 text-sm">
                  <p className="text-xs uppercase tracking-[0.1em] text-slate-400">
                    Listing context
                  </p>
                  <div className="mt-2 space-y-1 text-slate-200">
                    <p>
                      <span className="text-slate-400">Society:</span>{" "}
                      {viewState.listingContext?.societyName ?? "—"}
                    </p>
                    <p>
                      <span className="text-slate-400">Building:</span>{" "}
                      {viewState.listingContext?.buildingName ?? "—"}
                    </p>
                    <p>
                      <span className="text-slate-400">Type:</span>{" "}
                      {viewState.listingContext?.bhkConfig ?? "—"}
                    </p>
                  </div>
                </div>

                <Button
                  asChild
                  className="h-11 w-full rounded-lg bg-white text-base font-semibold text-slate-900 hover:bg-slate-200"
                >
                  <Link href={viewState.signInUrl}>Sign in with Google</Link>
                </Button>

                <p className="text-center text-xs text-slate-400">
                  Invite expires on {formatDateTime(viewState.expiresAt)}.
                </p>
              </CardContent>
            </>
          ) : (
            <CardContent className="space-y-4 px-6 py-8 text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-slate-700 bg-slate-800">
                {viewState.icon}
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white">{viewState.title}</h1>
                <p className="mt-2 text-sm text-slate-300">{viewState.message}</p>
              </div>
              {viewState.kind === "consumed" && (
                <Button
                  asChild
                  className="h-11 w-full rounded-lg bg-white text-base font-semibold text-slate-900 hover:bg-slate-200"
                >
                  <Link href={viewState.signInUrl}>Sign in to continue</Link>
                </Button>
              )}
              <p className="text-sm text-slate-400">
                Need help?{" "}
                <Link href="/contact" className="font-medium text-cyan-300 hover:text-cyan-200">
                  Contact support
                </Link>
                .
              </p>
            </CardContent>
          )}
        </Card>
      </div>
    </main>
  );
}
