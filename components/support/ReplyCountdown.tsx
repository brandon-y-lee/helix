"use client";

import { useEffect, useState } from "react";
import { formatReplyCountdown, nextReplyTarget } from "@/lib/support/reply-target";
import styles from "./reply-countdown.module.css";

const targetCalendar = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "long",
  month: "short",
  day: "numeric",
});

export function ReplyCountdown({ className }: { className?: string }) {
  const [countdown, setCountdown] = useState<{ target: number; remainingMs: number } | null>(null);

  useEffect(() => {
    const synchronize = () => {
      const now = Date.now();
      const target = nextReplyTarget(now);
      setCountdown({ target, remainingMs: target - now });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") synchronize();
    };

    synchronize();
    const interval = window.setInterval(onVisibilityChange, 1000);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", synchronize);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", synchronize);
    };
  }, []);

  return (
    <div className={styles.countdown}>
      <h1 className={[styles.heading, className].filter(Boolean).join(" ")}>
        <span className={styles.srOnly}>Next weekday reply target: noon Pacific</span>
        <span className={styles.label} aria-hidden="true">Reply target in</span>
        <span className={countdown === null ? styles.fallback : styles.digits} aria-hidden="true">
          {countdown === null ? "Next weekday at noon Pacific" : formatReplyCountdown(countdown.remainingMs)}
        </span>
      </h1>
      <p className={styles.target}>
        {countdown === null ? "Monday–Friday at noon Pacific" : (
          <time dateTime={new Date(countdown.target).toISOString()}>
            {targetCalendar.format(countdown.target)} at noon Pacific
          </time>
        )}
      </p>
    </div>
  );
}
