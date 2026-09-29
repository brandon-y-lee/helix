"use client";

import { useEffect, useRef, useState } from "react";
import type { SupportPhoto } from "@/lib/support/types";
import styles from "./support.module.css";

export function SupportPhotoViewer({ inquiryId, photo, index, request = fetch }: { inquiryId: string; photo: SupportPhoto; index: number; request?: typeof fetch }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const access = useRef<{ controller: AbortController; objectUrl?: string; timer?: number } | null>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const previewPanel = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);

  function revoke() {
    access.current?.controller.abort();
    if (access.current?.objectUrl) URL.revokeObjectURL(access.current.objectUrl);
    if (access.current?.timer) window.clearTimeout(access.current.timer);
    access.current = null;
  }

  useEffect(() => {
    setPreview(null);
    return revoke;
  }, [photo.id, photo.status]);
  useEffect(() => {
    if (!preview && restoreFocus.current) {
      restoreFocus.current = false;
      openButton.current?.focus();
    }
  }, [preview]);

  async function open() {
    if (access.current || photo.status !== "ready") return;
    const current = { controller: new AbortController(), objectUrl: undefined as string | undefined, timer: undefined as number | undefined };
    access.current = current;
    setPending(true);
    setError("");
    const timeout = window.setTimeout(() => current.controller.abort(), 10_000);
    try {
      const path = `/api/admin/support/${encodeURIComponent(inquiryId)}/photos/${encodeURIComponent(photo.id)}`;
      const response = await request(path, { method: "POST", credentials: "same-origin", cache: "no-store", signal: current.controller.signal,
        headers: { "Content-Type": "application/json" }, body: "{}" });
      const result = await response.json();
      if (!response.ok || typeof result?.url !== "string" || typeof result.expiresAt !== "string") throw new Error("unavailable");
      const expiresAt = Date.parse(result.expiresAt);
      const url = new URL(result.url, window.location.origin);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + 65_000
        || url.origin !== window.location.origin || url.pathname !== path || url.hash
        || url.searchParams.getAll("capability").length !== 1 || [...url.searchParams.keys()].some((key) => key !== "capability")) throw new Error("unavailable");
      const image = await request(`${url.pathname}${url.search}`, { credentials: "same-origin", cache: "no-store", referrerPolicy: "no-referrer", signal: current.controller.signal });
      if (!image.ok || image.headers.get("content-type")?.split(";")[0] !== "image/webp") throw new Error("unavailable");
      const blob = await image.blob();
      if (!blob.size || blob.size > 4 * 1024 * 1024 || expiresAt <= Date.now() || access.current !== current) throw new Error("unavailable");
      current.objectUrl = URL.createObjectURL(blob);
      setPreview(current.objectUrl);
      current.timer = window.setTimeout(() => {
        if (access.current !== current) return;
        restoreFocus.current = previewPanel.current?.contains(document.activeElement) ?? false;
        revoke();
        setPreview(null);
        setError("Photo access expired. Open it again to continue viewing.");
      }, expiresAt - Date.now());
    } catch {
      if (access.current === current) {
        revoke();
        setPreview(null);
        setError("This photo could not be opened. Refresh the inquiry or check your support access, then try again.");
      }
    } finally {
      window.clearTimeout(timeout);
      setPending(false);
    }
  }

  if (photo.status !== "ready") return <p className={styles.muted}>Photo {index}: {photo.status === "rejected" ? "Not accepted" : photo.status === "expired" ? "Expired" : photo.status === "pending" || photo.status === "processing" ? "Processing" : "Unavailable"}</p>;
  return <div className={styles.photo}>
    <button ref={openButton} className={styles.textButton} type="button" disabled={pending || Boolean(preview)} onClick={() => void open()}>{pending ? `Opening photo ${index}…` : `View private photo ${index}`}</button>
    {preview ? <div ref={previewPanel} className={styles.photoPreview}>
      {/* Clean private bytes use a short-lived local blob; the public image optimizer must not receive this content. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview} alt={`Customer attachment ${index}`} />
      <button className={styles.textButton} type="button" onClick={() => { revoke(); restoreFocus.current = true; setPreview(null); }}>Close photo {index}</button>
    </div> : null}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
  </div>;
}
