"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { contactInquiryTypes } from "@/content/support/contact";
import styles from "./support.module.css";

type PhotoState = "selected" | "uploading" | "processing" | "ready" | "rejected" | "failed" | "expired";
type SelectedPhoto = { uploadId: string; file: File; state?: PhotoState };

export function ContactForm({ request = fetch }: { request?: typeof fetch } = {}) {
  const [availability, setAvailability] = useState<"checking" | "available" | "unavailable" | "failed">("checking");
  const [check, setCheck] = useState(0);
  const [photosAvailable, setPhotosAvailable] = useState(false);
  const [pending, setPending] = useState(false);
  const [received, setReceived] = useState(false);
  const [error, setError] = useState("");
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [photoError, setPhotoError] = useState("");
  const [photosPending, setPhotosPending] = useState(false);
  const [draggingPhotos, setDraggingPhotos] = useState(false);
  const attempt = useRef<{ payload: string; id: string; capability: string } | null>(null);
  const admissions = useRef(new Map<string, { photoId: string; uploadUrl: string; uploaded: boolean }>());
  const uploading = useRef(false);
  const submitting = useRef(false);
  const successHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    let active = true;
    void request("/api/support/intake", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        const result = response.ok ? await response.json() : null;
        if (active) {
          setAvailability(result?.available === true ? "available" : result?.available === false ? "unavailable" : "failed");
          setPhotosAvailable(result?.photosAvailable === true);
        }
      })
      .catch(() => { if (active) setAvailability("failed"); })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [check, request]);

  useEffect(() => { if (received) successHeading.current?.focus(); }, [received]);

  function setPhotoState(id: string, state: PhotoState) {
    setPhotos((current) => current.map((photo) => photo.uploadId === id ? { ...photo, state } : photo));
  }

  async function photoRequest(input: Record<string, unknown>) {
    if (!attempt.current) throw new Error("unavailable");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await request("/api/support/photos", { method: "POST", cache: "no-store", credentials: "same-origin", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, submissionId: attempt.current.id, capability: attempt.current.capability }) });
      const result = await response.json();
      if (!response.ok || result?.ok !== true) throw new Error("unavailable");
      return result;
    } finally { window.clearTimeout(timeout); }
  }

  async function uploadPhotos(selected: SelectedPhoto[]) {
    if (uploading.current) return;
    uploading.current = true;
    setPhotosPending(true);
    setPhotoError("");
    try {
      for (const photo of selected) {
        setPhotoState(photo.uploadId, "uploading");
        try {
          let admission = admissions.current.get(photo.uploadId);
          if (!admission) {
            const result = await photoRequest({ action: "admit", uploadId: photo.uploadId, contentType: photo.file.type, byteSize: photo.file.size });
            const url = new URL(result.uploadUrl);
            if (url.origin !== "https://erasogmsqpgiirovubjh.supabase.co" || !url.pathname.startsWith("/storage/v1/object/upload/sign/") || url.username || url.password || typeof result.photoId !== "string") throw new Error("unavailable");
            admission = { photoId: result.photoId, uploadUrl: url.toString(), uploaded: false };
            admissions.current.set(photo.uploadId, admission);
          }
          if (!admission.uploaded) {
            const controller = new AbortController();
            const timeout = window.setTimeout(() => controller.abort(), 60_000);
            try {
              const response = await request(admission.uploadUrl, { method: "PUT", body: photo.file, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal,
                headers: { "Content-Type": photo.file.type, "x-upsert": "false" } });
              // A lost response can leave the immutable object present. Completion verifies it server-side.
              if (!response.ok && response.status !== 400 && response.status !== 409) throw new Error("unavailable");
              admission.uploaded = response.ok;
            } finally { window.clearTimeout(timeout); }
          }
          await photoRequest({ action: "complete", photoId: admission.photoId });
          admission.uploaded = true;
          setPhotoState(photo.uploadId, "processing");
        } catch { setPhotoState(photo.uploadId, "failed"); }
      }
    } finally {
      uploading.current = false;
      setPhotosPending(false);
    }
  }

  async function checkPhotos() {
    if (uploading.current) return;
    uploading.current = true;
    setPhotosPending(true);
    setPhotoError("");
    try {
      const result = await photoRequest({ action: "status" });
      if (!Array.isArray(result.photos) || result.photos.length > 5) throw new Error("unavailable");
      for (const photo of result.photos) {
        if (typeof photo.uploadId !== "string" || !["pending", "processing", "ready", "rejected", "expired"].includes(photo.status)) throw new Error("unavailable");
      }
      setPhotos((current) => current.map((photo) => {
        const status = result.photos.find((item: { uploadId: string }) => item.uploadId === photo.uploadId)?.status;
        return status === "ready" || status === "rejected" || status === "processing" || status === "expired" ? { ...photo, state: status } : photo;
      }));
    } catch {
      setPhotoError("Photo status could not be checked. Your message is still saved. Try again; this page’s photo access may have expired.");
    } finally {
      uploading.current = false;
      setPhotosPending(false);
    }
  }

  function selectPhotos(files: File[]) {
    if (!files.length || submitting.current || pending || received || !photosAvailable) return;
    // Picker, drop and paste share the same bounds; selection never uploads a file.
    if (files.length > 5) {
      setPhotoError("Photos were not added. Choose no more than five photos.");
      return;
    }
    if (files.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
      setPhotoError("Photos were not added. Choose JPEG, PNG, or WebP files.");
      return;
    }
    if (files.some((file) => file.size <= 0 || file.size > 10 * 1024 * 1024)) {
      setPhotoError("Photos were not added. Each photo must be no larger than 10 MiB.");
      return;
    }
    if (files.reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024) {
      setPhotoError("Photos were not added. Photos must total no more than 20 MiB.");
      return;
    }
    setPhotos(files.map((file) => ({ uploadId: crypto.randomUUID(), file })));
    setPhotoError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const fields = new FormData(form);
    const payload = {
      name: String(fields.get("name") ?? "").trim(),
      email: String(fields.get("email") ?? "").trim(),
      inquiryType: String(fields.get("inquiryType") ?? "general"),
      subject: String(fields.get("subject") ?? "").trim(),
      body: String(fields.get("body") ?? "").trim(),
      ...(photos.length ? { photos: photos.map((photo) => ({ uploadId: photo.uploadId, byteSize: photo.file.size, contentType: photo.file.type })) } : {}),
    };
    if (!payload.name || !payload.subject || !payload.body) {
      setError("Enter your name, topic, and message before submitting.");
      return;
    }
    const fingerprint = JSON.stringify(payload);
    if (attempt.current?.payload !== fingerprint) {
      const capability = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      attempt.current = { payload: fingerprint, id: crypto.randomUUID(), capability };
    }
    const body = JSON.stringify({ ...payload, submissionId: attempt.current.id, ...(photos.length ? { uploadCapability: attempt.current.capability } : {}) });
    if (new TextEncoder().encode(body).length > 48 * 1024) {
      setError("Your message is too large. Please shorten it before submitting.");
      return;
    }
    submitting.current = true;
    setPending(true);
    setError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await request("/api/support/intake", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body, signal: controller.signal,
      });
      const result = await response.json();
      if (response.ok && result?.ok === true) {
        setReceived(true);
        if (photos.length) void uploadPhotos(photos);
      } else if (response.status === 429) {
        setError("Too many requests. Please try again later.");
      } else if (response.status === 400 || response.status === 422) {
        setError("Check your details and message, then try again.");
      } else {
        setError("We couldn’t confirm receipt. Retry without changing your message to avoid a duplicate.");
      }
    } catch {
      setError("We couldn’t confirm receipt. Retry without changing your message to avoid a duplicate.");
    } finally {
      window.clearTimeout(timeout);
      submitting.current = false;
      setPending(false);
    }
  }

  if (availability === "checking") return <p className={styles.notice} role="status">Checking support availability…</p>;
  if (availability === "unavailable" || availability === "failed") return (
    <div className={styles.notice}>
      <p role={availability === "failed" ? "alert" : "status"}>{availability === "failed" ? "We couldn’t check support availability. Please try again." : "Support Intake is currently unavailable."}</p>
      <p>Your inquiry has not been submitted. You can still review the guidance below.</p>
      <button className={styles.retry} type="button" onClick={() => { setAvailability("checking"); setCheck((value) => value + 1); }}>Check availability again</button>
    </div>
  );
  if (received) return (
    <div className={styles.notice}>
      <h2 ref={successHeading} tabIndex={-1}>Inquiry received</h2>
      <p role="status">Your message is saved for the Helix support team.</p>
      {photos.length ? <section aria-labelledby="support-photo-status-title" className={styles.photoStatus}>
        <h3 id="support-photo-status-title">Your photos</h3>
        <p>Your message stays saved if a photo cannot be added. Keep this page open to check photos or retry an upload.</p>
        <ul className={styles.photos} aria-live="polite">{photos.map((photo) => <li key={photo.uploadId}>
          <span>{photo.file.name}</span>
          <span>{photo.state === "ready" ? "Added privately for support" : photo.state === "rejected" ? "Not added — this photo could not be accepted" : photo.state === "expired" ? "Photo expired — no longer available" : photo.state === "failed" ? "Upload could not be confirmed" : photo.state === "processing" ? "Processing — not yet available to support" : "Uploading…"}</span>
          {photo.state === "failed" ? <button className={styles.retry} type="button" disabled={photosPending} onClick={() => void uploadPhotos([photo])}>Retry {photo.file.name}</button> : null}
        </li>)}</ul>
        <button className={styles.retry} type="button" disabled={photosPending} onClick={() => void checkPhotos()}>{photosPending ? "Checking photos…" : "Check photo status"}</button>
        {photoError ? <p role="alert" className={styles.error}>{photoError}</p> : null}
      </section> : null}
    </div>
  );
  return (
    <form className={`contact-form ${styles.form}`} onSubmit={submit} aria-labelledby="contact-form-title">
      <h2 className="sr-only" id="contact-form-title">Send an inquiry</h2>
      <p className={styles.requiredNote}>* indicates a required field</p>
      <fieldset className={styles.fields} disabled={pending}>
        <legend className="sr-only">Inquiry details</legend>
        <div className="contact-field"><label htmlFor="support-type">Contact reason</label><select id="support-type" name="inquiryType" defaultValue="general">{contactInquiryTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></div>
        <div className="contact-form__grid">
          <div className="contact-field"><label htmlFor="support-name">First and last name <span aria-hidden="true">*</span></label><input id="support-name" name="name" autoComplete="name" maxLength={100} required /></div>
          <div className="contact-field"><label htmlFor="support-email">Email <span aria-hidden="true">*</span></label><input id="support-email" name="email" type="email" autoComplete="email" maxLength={254} required /></div>
        </div>
        <div className="contact-field"><label htmlFor="support-subject">Topic <span aria-hidden="true">*</span></label><input id="support-subject" name="subject" maxLength={200} required /></div>
        <div className="contact-field"><label htmlFor="support-message">Tell us the details <span aria-hidden="true">*</span></label><p className={styles.helper} id="support-message-help">Include the product name or order reference if relevant, and let us know how we can help.</p><textarea aria-describedby="support-message-help" id="support-message" name="body" rows={7} maxLength={10_000} required /></div>
        {photosAvailable ? <div className="contact-field">
          <label id="support-photos-label" htmlFor="support-photos">Photos (optional)</label>
          <p className={styles.helper} id="support-photo-limits">Add up to five JPEG, PNG, or WebP photos, 10 MiB each and 20 MiB total. Photos are private and checked before support can view them.</p>
          <p className="sr-only" id="support-photo-instructions">Choose Upload to select photos, or paste images while the upload control is focused. A new selection replaces the selected photos.</p>
          <div className={`${styles.uploadZone} ${draggingPhotos ? styles.uploadZoneActive : ""}`}
            onDragOver={(event) => { event.preventDefault(); if (!pending) setDraggingPhotos(true); }}
            onDragLeave={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDraggingPhotos(false); }}
            onDrop={(event) => {
              event.preventDefault();
              setDraggingPhotos(false);
              selectPhotos(Array.from(event.dataTransfer.files));
            }}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.files);
              if (!files.length) return;
              event.preventDefault();
              selectPhotos(files);
            }}>
            <input className={styles.photoInput} id="support-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple
              aria-labelledby="support-photos-label" aria-describedby="support-photo-limits support-photo-instructions"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                selectPhotos(files);
              }} />
            <label className={styles.uploadLabel} htmlFor="support-photos" aria-hidden="true">
              <span className={styles.uploadPrompt}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1" /><circle cx="8" cy="9" r="1.5" /><path d="m3 17 5-5 4 4 4-6 5 7" /></svg>
                <span>Drag or paste image here</span>
              </span>
              <span className={styles.uploadAction}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M12 16V3m-4 4 4-4 4 4M5 12v8h14v-8" /></svg>
                Upload
              </span>
            </label>
          </div>
          <p className="sr-only" role="status">{photos.length ? `${photos.length} ${photos.length === 1 ? "photo selected" : "photos selected"}.` : "No photos selected."}</p>
          {photos.length ? <ul className={styles.photos}>{photos.map((photo) => <li key={photo.uploadId}><span>{photo.file.name}</span><button className={styles.retry} type="button" onClick={() => setPhotos((current) => current.filter((item) => item.uploadId !== photo.uploadId))}>Remove {photo.file.name}</button></li>)}</ul> : null}
          {photoError ? <p role="alert" className={styles.error}>{photoError}</p> : null}
        </div> : <p>Photo attachments are currently unavailable. You can still send your message.</p>}
        <p className={styles.privacy}>Your details are used to respond to your inquiry. Read our <a href="/privacy">Privacy Policy</a>.</p>
        <div className="contact-form__actions"><button type="submit" className={styles.submit}>{pending ? "Submitting…" : "Submit inquiry"}</button></div>
      </fieldset>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    </form>
  );
}
