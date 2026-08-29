"use client";

import { useEffect, useRef, useState } from "react";

/**
 * StreamingText — animates text character by character with a blinking cursor,
 * simulating a live typing effect. Once fully revealed, the cursor disappears.
 */
export function StreamingText({ text, speed = 30 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState(0);
  const [done, setDone] = useState(false);
  const idxRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Reset when text changes
    idxRef.current = 0;
    setDisplayed(0);
    setDone(false);

    if (!text) {
      setDone(true);
      return;
    }

    timerRef.current = setInterval(() => {
      idxRef.current += 1;
      if (idxRef.current >= text.length) {
        setDisplayed(text.length);
        setDone(true);
        if (timerRef.current) clearInterval(timerRef.current);
      } else {
        setDisplayed(idxRef.current);
      }
    }, speed);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [text, speed]);

  // If done, just show the full text without cursor
  if (done) {
    return <span>{text}</span>;
  }

  return (
    <span>
      {text.slice(0, displayed)}
      <span className="inline-block w-[2px] h-[1em] bg-gold/70 align-text-bottom ml-0.5 animate-pulse" />
    </span>
  );
}