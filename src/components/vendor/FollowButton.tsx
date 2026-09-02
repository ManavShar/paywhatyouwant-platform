"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { toggleFollow } from "@/lib/actions/social";
import { cn, formatCount } from "@/lib/utils";

/**
 * Follow / unfollow.
 *
 * Optimistic: the button flips the instant it is pressed, before the server
 * answers. A follow is a low-stakes, high-frequency action — making someone
 * watch a spinner for it is the difference between a feature people use and
 * one they don't. If the write fails, the state rolls back and the reason is
 * shown rather than silently swallowed.
 *
 * The follower count moves with the button for the same reason: a count that
 * lags the action it describes reads as broken.
 */
export function FollowButton({
  username,
  initialFollowing,
  initialCount,
  signedIn,
}: {
  username: string;
  initialFollowing: boolean;
  initialCount: number;
  /** Resolved on the server. Read from a client session it arrives late, and
      until it does a signed-in follower is bounced to the sign-in page. */
  signedIn: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [state, setState] = useState({
    following: initialFollowing,
    count: initialCount,
  });
  const [optimistic, applyOptimistic] = useOptimistic(
    state,
    (current, next: boolean) => ({
      following: next,
      count: current.count + (next ? 1 : -1),
    }),
  );

  function onClick() {
    if (!signedIn) {
      router.push(`/signin?next=/vendor/${username}`);
      return;
    }

    setError(null);
    const next = !optimistic.following;

    startTransition(async () => {
      applyOptimistic(next);
      const result = await toggleFollow(username);
      if (result.error) {
        setError(result.error);
        return; // optimistic value is discarded when the transition ends
      }
      setState({
        following: result.following,
        count: state.count + (result.following ? 1 : -1),
      });
    });
  }

  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-pressed={optimistic.following}
        className={cn(
          "inline-flex h-11 items-center gap-2 rounded-control px-5 text-sm font-semibold transition-colors disabled:opacity-60",
          optimistic.following
            ? "border border-hairline-strong text-ink hover:bg-surface-hover"
            : "bg-brand text-ink-inverse hover:bg-brand-hover",
        )}
      >
        {optimistic.following ? (
          <>
            <Check className="h-4 w-4" aria-hidden />
            Following
          </>
        ) : (
          <>
            <Plus className="h-4 w-4" aria-hidden />
            Follow
          </>
        )}
      </button>

      <p className="mt-1.5 text-center text-xs text-ink-subtle">
        {formatCount(optimistic.count)}{" "}
        {optimistic.count === 1 ? "follower" : "followers"}
      </p>

      {error && (
        <p role="alert" className="mt-1 max-w-[12rem] text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
