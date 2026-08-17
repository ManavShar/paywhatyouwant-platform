"use client";

import { useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";

/**
 * Max's explainer animation, carried over from the old site's "What is
 * Paywhatyouwant.io" section.
 *
 * Deliberately not a plain <iframe>. YouTube's embed pulls roughly a megabyte
 * of script and sets cookies on every single homepage view, whether or not
 * anyone presses play — and this sits below a masonry wall of images that is
 * already the heaviest thing on the page. So the default state is a poster
 * image served from our own origin, and the real embed is mounted only once
 * someone asks for it.
 *
 * The poster is the video's own thumbnail, copied into `public/` rather than
 * hotlinked, so nothing reaches Google until there has been a click.
 */

const VIDEO_ID = "PJH_Sg0VHNc";

export function VideoIntro() {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="relative aspect-video overflow-hidden rounded-card bg-surface">
      {playing ? (
        <iframe
          // youtube-nocookie keeps this out of ad personalisation. autoplay is
          // honest here: the user just clicked play, so it is what they asked
          // for rather than something starting at them unprompted.
          src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1&rel=0`}
          title="What is Paywhatyouwant"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label="Play: what is Paywhatyouwant"
          className="group absolute inset-0 h-full w-full cursor-pointer"
        >
          <Image
            src="/what-is-paywhatyouwant.jpg"
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 900px"
            className="object-cover"
          />

          {/* Darkened just enough that the play control stays legible over a
              bright frame, without dulling the artwork underneath. */}
          <span className="absolute inset-0 bg-black/20 transition-colors group-hover:bg-black/30" />

          <span className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-brand text-ink-inverse shadow-lg transition-transform group-hover:scale-105">
            {/* Nudged right because a triangle's visual centre sits left of
                its bounding box. */}
            <Play aria-hidden className="ml-0.5 h-7 w-7 fill-current" />
          </span>
        </button>
      )}
    </div>
  );
}
