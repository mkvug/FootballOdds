"use client";

import Image from "next/image";
import { useState } from "react";
import { readableText } from "@/lib/colors";
import type { Team } from "@/lib/providers/types";

interface Props {
  team: Team;
  size: number;
  /** Use ESPN's dark-theme artwork. Needed on dark surfaces. */
  dark?: boolean;
  priority?: boolean;
}

/** Team logo, falling back to a monogram when the URL is missing or fails (spec §9). */
export function TeamLogo({ team, size, dark = false, priority = false }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = (dark ? team.logoDarkUrl : team.logoUrl) || team.logoUrl;

  if (!src || failedSrc === src) {
    return (
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold"
        style={{
          width: size,
          height: size,
          background: team.color,
          color: readableText(team.color),
          fontSize: size * 0.34,
        }}
      >
        {team.abbreviation.slice(0, 3)}
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      priority={priority}
      onError={() => setFailedSrc(src)}
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}
