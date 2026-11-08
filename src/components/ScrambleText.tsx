"use client";

import React, { useEffect, useRef, useState } from "react";

const CHARS = "0123456789ABCDEF!@#$%&*+=-_~?";

interface ScrambleTextProps {
  text: string;
  duration?: number;
  className?: string;
  onComplete?: () => void;
}

export function ScrambleText({
  text,
  duration = 500,
  className = "",
  onComplete,
}: ScrambleTextProps) {
  const [display, setDisplay] = useState(text);
  const prevTextRef = useRef("");

  useEffect(() => {
    if (prevTextRef.current === text) return;
    prevTextRef.current = text;

    const start = performance.now();
    let frameId: number;

    const update = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);

      if (progress >= 1) {
        setDisplay(text);
        if (onComplete) onComplete();
        return;
      }

      const revealedLength = Math.floor(progress * text.length);
      let nextStr = "";
      for (let i = 0; i < text.length; i++) {
        if (text[i] === " " || text[i] === "." || text[i] === "…") {
          nextStr += text[i];
        } else if (i < revealedLength) {
          nextStr += text[i];
        } else {
          nextStr += CHARS[Math.floor(Math.random() * CHARS.length)];
        }
      }

      setDisplay(nextStr);
      frameId = requestAnimationFrame(update);
    };

    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [text, duration, onComplete]);

  return <span className={className}>{display}</span>;
}
