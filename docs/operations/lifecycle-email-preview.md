# White-only lifecycle draft preview

Ticket504 changes only the shared presentation of the four lifecycle draft sources: white document/body/wrapper/content, explicit dark text and underlined links. Subjects, plain text, words, URLs, variables, offer terms and consent contracts are unchanged. There is no dedicated dark-mode CSS or anti-inversion workaround. HTML fingerprints change: actual native-template publication and new immutable approval are separate activation prerequisites, not performed here. Existing approved generations remain unchanged.

`/helix-verification/lifecycle` is local-only, requires `HELIX_VERIFICATION_ADAPTER=1` and rejects any Vercel environment. It uses the real renderer with synthetic receipts and an injected in-memory native source. Four sandboxed email frames have all links neutralized; download links save the same standalone synthetic HTML. No provider calls, coupons or subscriptions are created. The real popup uses an injected in-memory transport, retains its12-second delay, unchecked consent, Escape and focus behavior; reset remounts it. Addresses are not logged or persisted. The banner clarifies that successful confirmation copy is simulated.

Run repository-supported `CI=1 pnpm verify:production` with only public catalog config and all campaigns/checkout disabled. Never use service or provider credentials for this preview. Browser proof covers ordinary light Chromium at390/1440px, white backgrounds, dark text/links, no overflow, non-operative links and memory-only popup reset/submit. It does not establish Gmail, Outlook or Apple Mail rendering: clients may transform colors or strip styles. No dedicated dark-mode validation is claimed.

A separately started loopback preview depends on the Mac staying awake and the process remaining alive. Do not expose the verification adapter on a hosted environment. Existing landing3100 and review3102 processes belong to other tasks and must remain untouched.

## Brand refinement

The four drafts now use the existing email-safe Helix PNG wordmark and Marcellus headings with Georgia fallback. Marcellus is self-hosted with its SIL OFL license. Inbox support for web fonts varies; the preview is not proof of an actual inbox rendering. Preview asset mapping is restricted to the two known public image/font paths. Downloaded HTML needs those local assets and is not self-contained.

New sources opt into `HELIX_OFFER_EXPIRES_LABEL` in both HTML and text. It expresses the unchanged expiry instant as a full month/date/year and 12-hour time in explicitly named Pacific Standard/Daylight Time. Seconds/fractions are retained when present. Legacy approved sources using `HELIX_OFFER_EXPIRES_AT` retain exact ISO formatting and terms. Mixed/missing modes fail closed. This is display only, not a change to offer duration or eligibility; updated native drafts still require separate publication and fingerprint approval.
