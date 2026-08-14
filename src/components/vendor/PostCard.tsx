import Image from "next/image";
import Link from "next/link";

export type PostCardData = {
  id: string;
  body: string;
  imageUrl: string | null;
  createdAt: Date;
  author?: { username: string; name: string | null; avatarUrl: string | null };
};

/**
 * A vendor update — "talking about their upcoming work", per the brief.
 *
 * Shown on the creator's page and in the follower feed. The author block is
 * optional because on a creator's own page it would repeat the header.
 */
export function PostCard({
  post,
  action,
}: {
  post: PostCardData;
  /** Slot for an owner-only control, e.g. delete. */
  action?: React.ReactNode;
}) {
  return (
    <article className="rounded-card border border-hairline p-4">
      {post.author && (
        <header className="mb-3 flex items-center gap-2.5">
          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-surface">
            {post.author.avatarUrl ? (
              <Image
                src={post.author.avatarUrl}
                alt=""
                fill
                sizes="32px"
                className="object-cover"
              />
            ) : (
              <span className="grid h-full w-full place-items-center text-xs font-bold text-ink-subtle">
                {(post.author.name || post.author.username).charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <Link
            href={`/vendor/${post.author.username}`}
            className="text-sm font-semibold text-ink hover:underline"
          >
            {post.author.name || post.author.username}
          </Link>
          <time
            dateTime={post.createdAt.toISOString()}
            className="ml-auto text-xs text-ink-subtle"
          >
            {relativeTime(post.createdAt)}
          </time>
          {action}
        </header>
      )}

      <p className="whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink">
        {post.body}
      </p>

      {post.imageUrl && (
        <div className="relative mt-3 overflow-hidden rounded-lg bg-surface">
          <Image
            src={post.imageUrl}
            alt=""
            width={800}
            height={0}
            sizes="(max-width: 640px) 100vw, 640px"
            className="h-auto w-full object-cover"
          />
        </div>
      )}

      {!post.author && (
        <footer className="mt-3 flex items-center gap-3">
          <time
            dateTime={post.createdAt.toISOString()}
            className="text-xs text-ink-subtle"
          >
            {relativeTime(post.createdAt)}
          </time>
          {action}
        </footer>
      )}
    </article>
  );
}

/** Short relative time; falls back to a date once it stops being useful. */
function relativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
