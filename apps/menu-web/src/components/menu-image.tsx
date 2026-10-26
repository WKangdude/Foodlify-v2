"use client";

import Image, { type ImageProps } from "next/image";
import { Sprout } from "lucide-react";
import { useState } from "react";

/** Unsplash delivers resized demo assets directly; production uses catalog assets. */
export function MenuImage(props: ImageProps) {
  const [failedSource, setFailedSource] = useState<ImageProps["src"] | null>(
    null,
  );
  if (failedSource === props.src) {
    return (
      <div
        className={`image-fallback ${props.className ?? ""}`}
        role={props.alt ? "img" : undefined}
        aria-label={
          props.alt ? `${props.alt}: fotografía no disponible` : undefined
        }
        aria-hidden={!props.alt || undefined}
      >
        <Sprout size={30} strokeWidth={1.3} />
      </div>
    );
  }
  return (
    <Image
      {...props}
      alt={props.alt}
      unoptimized
      onError={() => setFailedSource(props.src)}
    />
  );
}
