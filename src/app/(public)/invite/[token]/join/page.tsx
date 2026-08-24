"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Loader2, MessageCircleWarning } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { ChatView } from "@/components/chat/ChatView";
import { Button } from "@/components/ui/button";

const CONVEX_ID_PATTERN = /^[a-z0-9]+$/;
const MIN_CONVEX_ID_LENGTH = 10;

function extractWorkOsSignInUrl(html: string): string | null {
  const documentFragment = new DOMParser().parseFromString(html, "text/html");
  const signInLink = documentFragment.querySelector('a[href*="api.workos.com"][href*="state="]');

  if (!signInLink) {
    return null;
  }

  const href = signInLink.getAttribute("href");
  return href && href.length > 0 ? href : null;
}

function normalizeToken(rawToken: string | string[] | undefined): string {
  if (typeof rawToken === "string") {
    return rawToken.trim();
  }

  if (Array.isArray(rawToken) && typeof rawToken[0] === "string") {
    return rawToken[0].trim();
  }

  return "";
}

export default function InviteJoinPage() {
  const params = useParams<{ token?: string | string[] }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const token = normalizeToken(params.token);
  const channelIdFromQuery = searchParams.get("channel");
  const inviteDetails = useQuery(
    api.ownerInvites.getByToken,
    token ? { invite_token: token } : "skip",
  );

  const hasValidChannel = useMemo(() => {
    if (!channelIdFromQuery) {
      return false;
    }

    return (
      channelIdFromQuery.length >= MIN_CONVEX_ID_LENGTH &&
      CONVEX_ID_PATTERN.test(channelIdFromQuery)
    );
  }, [channelIdFromQuery]);

  const channelId = useMemo(() => {
    if (!channelIdFromQuery || !hasValidChannel || !inviteDetails || inviteDetails === null) {
      return null;
    }

    if (!("channel_id" in inviteDetails) || !inviteDetails.channel_id) {
      return null;
    }

    if (inviteDetails.channel_id !== channelIdFromQuery) {
      return null;
    }

    return channelIdFromQuery as Id<"chat_channels">;
  }, [channelIdFromQuery, hasValidChannel, inviteDetails]);

  const currentUser = useQuery(api.users.getCurrentUser);
  const consumeInvite = useMutation(api.ownerInvites.consumeInvite);
  const setActivePersona = useMutation(api.users.setActivePersona);

  const hasAttemptedJoinRef = useRef(false);
  const [prevToken, setPrevToken] = useState(token);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [signInUrl, setSignInUrl] = useState<string | null>(null);
  const [isResolvingSignInUrl, setIsResolvingSignInUrl] = useState(false);
  const [now] = useState(() => Date.now());

  const activateOwnerPersonaAndRedirect = useCallback(async () => {
    await setActivePersona({ persona: "OWNER" });
    router.replace("/owner/dashboard");
  }, [router, setActivePersona]);

  const startJoin = useCallback(() => {
    if (!token || !currentUser || inviteDetails === undefined || hasAttemptedJoinRef.current) {
      return;
    }

    hasAttemptedJoinRef.current = true;
    setIsJoining(true);
    setJoinError(null);

    if (inviteDetails === null) {
      setJoinError("Invite not found.");
      setIsJoining(false);
      return;
    }

    const consumedChannelId = "channel_id" in inviteDetails ? inviteDetails.channel_id : undefined;
    const consumedInquiryId = "inquiry_id" in inviteDetails ? inviteDetails.inquiry_id : undefined;

    if (inviteDetails.status === "CONSUMED") {
      // Check if current user is the one who consumed the invite
      const consumedByUserId =
        "consumed_by_user_id" in inviteDetails ? inviteDetails.consumed_by_user_id : undefined;

      if (!consumedByUserId) {
        setJoinError("This invite has already been used.");
        setIsJoining(false);
        return;
      }

      if (currentUser._id !== consumedByUserId) {
        setJoinError("This invite has already been used by another account.");
        setIsJoining(false);
        return;
      }

      if (!consumedChannelId || !consumedInquiryId) {
        setJoinError("This invite has already been used.");
        setIsJoining(false);
        return;
      }

      void activateOwnerPersonaAndRedirect()
        .catch((error) => {
          setJoinError(
            error instanceof Error ? error.message : "Unable to switch to owner portal.",
          );
        })
        .finally(() => {
          setIsJoining(false);
        });
      return;
    }

    if (inviteDetails.status !== "PENDING") {
      setJoinError("Invite is no longer valid.");
      setIsJoining(false);
      return;
    }

    void consumeInvite({ invite_token: token })
      .then(async () => {
        await activateOwnerPersonaAndRedirect();
      })
      .catch((error) => {
        setJoinError(error instanceof Error ? error.message : "Unable to join invite.");
      })
      .finally(() => {
        setIsJoining(false);
      });
  }, [activateOwnerPersonaAndRedirect, consumeInvite, currentUser, inviteDetails, token]);

  // Reset join state synchronously during render (rather than in an effect) when the
  // token changes, so we never commit a frame with stale join state for a new token.
  if (token !== prevToken) {
    setPrevToken(token);
    setJoinError(null);
    setIsJoining(false);
  }

  // Refs may only be written outside render, so the ref reset stays in its own effect.
  useEffect(() => {
    hasAttemptedJoinRef.current = false;
  }, [prevToken]);

  useEffect(() => {
    // Legitimately kicks off async work (mutation + redirect) once token/user/invite
    // data are ready; startJoin's internal setState calls are loading-state toggles
    // for that async flow, not a render-time value being synced.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    startJoin();
  }, [startJoin]);

  useEffect(() => {
    // Fetches (and aborts on cleanup) the WorkOS sign-in link for this token; the
    // synchronous setState calls below are pre-fetch loading-state resets, not a
    // value being derived from render.
    if (!token || currentUser !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSignInUrl(null);
      setIsResolvingSignInUrl(false);
      return;
    }

    const controller = new AbortController();
    let isActive = true;
    setSignInUrl(null);
    setIsResolvingSignInUrl(true);

    void fetch(`/invite/${encodeURIComponent(token)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Unable to prepare sign-in link.");
        }

        return response.text();
      })
      .then((html) => {
        if (!isActive) {
          return;
        }

        setSignInUrl(extractWorkOsSignInUrl(html));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        if (!isActive) {
          return;
        }

        setSignInUrl(null);
      })
      .finally(() => {
        if (isActive) {
          setIsResolvingSignInUrl(false);
        }
      });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [currentUser, token]);

  if (!token) {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <MessageCircleWarning className="size-9 text-rose-500" />
        <h1 className="mt-3 text-xl font-semibold text-slate-900">Invalid invite link</h1>
        <p className="mt-2 text-sm text-slate-600">The invite token is missing from this URL.</p>
      </div>
    );
  }

  if (currentUser === undefined || isJoining) {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <Loader2 className="size-8 animate-spin text-indigo-500" />
        <h1 className="mt-3 text-xl font-semibold text-slate-900">Joining conversation</h1>
        <p className="mt-2 text-sm text-slate-600">
          Verifying your invite and opening your chat channel...
        </p>
      </div>
    );
  }

  if (inviteDetails === undefined) {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <Loader2 className="size-8 animate-spin text-indigo-500" />
        <h1 className="mt-3 text-xl font-semibold text-slate-900">Loading invite</h1>
        <p className="mt-2 text-sm text-slate-600">Checking invite details before continuing...</p>
      </div>
    );
  }

  // Check invite validity BEFORE auth check (F1 fix)
  if (inviteDetails === null) {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <MessageCircleWarning className="size-9 text-rose-500" />
        <h1 className="mt-3 text-xl font-semibold text-slate-900">Invalid invite</h1>
        <p className="mt-2 text-sm text-slate-600">This invite link is not valid or has expired.</p>
        <p className="mt-4 text-sm text-slate-500">
          Need help?{" "}
          <Link href="/contact" className="font-medium text-indigo-600 hover:underline">
            Contact support
          </Link>
          .
        </p>
      </div>
    );
  }

  if (inviteDetails && inviteDetails.status === "EXPIRED") {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <MessageCircleWarning className="size-9 text-rose-500" />
        <h1 className="mt-3 text-xl font-semibold text-slate-900">Invite expired</h1>
        <p className="mt-2 text-sm text-slate-600">
          This invite has expired and can no longer be used.
        </p>
        <p className="mt-4 text-sm text-slate-500">
          Need help?{" "}
          <Link href="/contact" className="font-medium text-indigo-600 hover:underline">
            Contact support
          </Link>
          .
        </p>
      </div>
    );
  }

  if (
    inviteDetails.status === "PENDING" &&
    inviteDetails.expires_at &&
    inviteDetails.expires_at <= now
  ) {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <MessageCircleWarning className="size-9 text-rose-500" />
        <h1 className="mt-3 text-xl font-semibold text-slate-900">Invite expired</h1>
        <p className="mt-2 text-sm text-slate-600">
          This invite has expired and can no longer be used.
        </p>
        <p className="mt-4 text-sm text-slate-500">
          Need help?{" "}
          <Link href="/contact" className="font-medium text-indigo-600 hover:underline">
            Contact support
          </Link>
          .
        </p>
      </div>
    );
  }

  if (inviteDetails.status !== "PENDING" && inviteDetails.status !== "CONSUMED") {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <MessageCircleWarning className="size-9 text-rose-500" />
        <h1 className="mt-3 text-xl font-semibold text-slate-900">Invite no longer valid</h1>
        <p className="mt-2 text-sm text-slate-600">
          This invite can no longer be used. Please request a new invite link.
        </p>
        <p className="mt-4 text-sm text-slate-500">
          Need help?{" "}
          <Link href="/contact" className="font-medium text-indigo-600 hover:underline">
            Contact support
          </Link>
          .
        </p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <MessageCircleWarning className="size-9 text-amber-500" />
        <h1 className="mt-3 text-xl font-semibold text-slate-900">Sign-in required</h1>
        <p className="mt-2 text-sm text-slate-600">Please sign in to access this invite.</p>
        {signInUrl ? (
          <Button asChild className="mt-5">
            <Link href={signInUrl}>Sign in with Google</Link>
          </Button>
        ) : (
          <Button asChild className="mt-5" variant="outline">
            <Link href={`/invite/${encodeURIComponent(token)}`}>Visit invite page to sign in</Link>
          </Button>
        )}
        {isResolvingSignInUrl ? (
          <p className="mt-3 text-xs text-slate-500">Preparing secure sign-in...</p>
        ) : null}
      </div>
    );
  }

  if (joinError) {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <MessageCircleWarning className="size-9 text-rose-500" />
        <h1 className="mt-3 text-xl font-semibold text-slate-900">Could not join this invite</h1>
        <p className="mt-2 text-sm text-slate-600">{joinError}</p>
        <Button
          type="button"
          variant="outline"
          className="mt-5"
          onClick={() => {
            hasAttemptedJoinRef.current = false;
            setJoinError(null);
            startJoin();
          }}
        >
          Try again
        </Button>
        <p className="mt-4 text-sm text-slate-500">
          Need help?{" "}
          <Link href="/contact" className="font-medium text-indigo-600 hover:underline">
            Contact support
          </Link>
          .
        </p>
      </div>
    );
  }

  if (!channelId) {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <MessageCircleWarning className="size-9 text-amber-500" />
        <h1 className="mt-3 text-xl font-semibold text-slate-900">Unable to open chat</h1>
        <p className="mt-2 text-sm text-slate-600">
          There was a problem connecting to the conversation.
        </p>
        <Button
          type="button"
          className="mt-5"
          onClick={() => {
            hasAttemptedJoinRef.current = false;
            setJoinError(null);
            startJoin();
          }}
        >
          Try again
        </Button>
        <Button asChild variant="outline" className="mt-3">
          <Link href={`/invite/${encodeURIComponent(token)}`}>Back to invite</Link>
        </Button>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            DemoRentals
          </p>
          <h1 className="text-xl font-semibold text-slate-900">Deal Conversation</h1>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/owner/dashboard">Owner Portal</Link>
        </Button>
      </div>

      <ChatView
        channelId={channelId}
        currentUserId={currentUser._id}
        currentUserRole={currentUser.user_type}
        className="h-[70vh]"
      />
    </main>
  );
}
