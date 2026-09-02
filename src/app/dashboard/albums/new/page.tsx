import type { Metadata } from "next";
import { requireVendor } from "@/lib/auth";
import { AlbumBuilder } from "@/components/vendor/AlbumBuilder";

export const metadata: Metadata = { title: "New album" };

export default async function NewAlbumPage() {
  await requireVendor();

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">
          Create an album
        </h1>
        <p className="mt-1 max-w-2xl text-[0.9375rem] text-ink-muted">
          A collection sold as one item — an album, a photo set, a series. Every
          item inside it also goes on sale on its own, so people can take the
          whole thing or just the one they came for. Both are pay what you want.
        </p>
      </header>

      <AlbumBuilder />
    </div>
  );
}
