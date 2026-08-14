import Link from "next/link";
import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProfileForm } from "@/components/vendor/ProfileForm";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = (await currentUser())!;
  const profile = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      name: true,
      bio: true,
      website: true,
      twitter: true,
      instagram: true,
      username: true,
    },
  });

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">Profile</h1>
        <p className="mt-1 text-[0.9375rem] text-ink-muted">
          This is what people see at{" "}
          <Link
            href={`/vendor/${profile.username}`}
            className="font-medium text-brand hover:underline"
          >
            /vendor/{profile.username}
          </Link>
          .
        </p>
      </header>
      <ProfileForm initial={profile} />
    </div>
  );
}
