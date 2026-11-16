# Persistent preview and paragraph removal — local results

User authority: keep the local preview running, start it immediately while investigating, and remove the quoted second usage paragraph. No remote delivery authority. Source candidate `ec11d9970fa009fef8b4384990aae7dedc97764c`, based on `ece67ba9edaa78856100b99fa75ae63b16a144e6`.

## Scope and approvals

Both independent roles `/root/spec_review` and `/root/standards_review` approved the exact persistent-preview plan SHA256 `d7ceacbac75fbbe0a93b48c6e3b55ea6d2d3947d5d424eb0cc3025aa8aa9dfc0` and plist SHA256 `8608557dbde6108aa4781e2435d3c42749ebe46cd5efd46cdec4270f486c4814` before service installation. Both approved paragraph-removal plan SHA256 `4635fc3e1f70343c201e5b69367e7cee7b36c03dbfca3692fec81ecafea498dd` before editing. The later copy request is an explicitly approved delta to the original no-app-change service plan.

Only application change: delete the second paragraph from `HomeSuperSerumSpotlight.tsx`; update its existing homepage assertion to absence. The remaining description is exactly: “A lightweight serum with PDRN, humectants, niacinamide, peptides, and adenosine for hydrated, supple-looking skin.” Title, image, badge, CTA, CSS and unrelated shared-checkout legal work are preserved.

## Service outcome

Installed user LaunchAgent `gui/501/com.helix.local-preview`, serving http://127.0.0.1:3100/. Definition is `~/Library/LaunchAgents/com.helix.local-preview.plist`; private durable state is `~/Library/Application Support/HelixPreview`, with runtime `site`, private logs, source manifest, management README, verification JSON and desktop/mobile screenshots. Repository config sample and management guide match the installed files. No system daemon, new software, security/power settings, LAN binding, Git remote operation or cloud deployment.

Snapshot contains exact source candidate tracked files and matching existing dependencies; no `.git` or unrelated work. Private parent directories are0700, copied regular `.env.local`0600. A1584-symlink audit found zero references outside the runtime site. Absolute existing Node24.19.0 executable avoids shell initialization and protected Desktop/tmp startup dependencies.

The prior setup had no persistent supervisor or retained exit log. Foreground terminal sessions and temporary storage were fragile; the exact earlier termination cause remains unknown. Do not describe it as a proven app crash or Codex kill.

## Verification

- PASS: focused homepage Vitest11/11, lint, typecheck, snapshot production build, installed/sample plist validation, diff whitespace and task prepare.
- PASS: service survived bootstrap shell completion, PID89079 parent1, root and image HTTP200, only127.0.0.1:3100 listening. Latest copy confirmed.
- PASS: controlled SIGTERM of the identified owned service caused automatic recovery to PID90201 parent1 and HTTP200 in3.2seconds. No manual restart used. Later independent completed-shell check found the same PID and HTTP200 after277.5seconds.
- PASS: Browser1440×900 and390×844: image loaded, one correct paragraph, no horizontal overflow; desktop58/42 split intact. Core/Beyond intro gaps72/36px desktop and19.5/9.75px mobile remain5vw/2.5vw. Mobile CTA keyboard focus has visible2px outline. Screenshots saved privately as `screenshots/desktop.jpg` and `screenshots/mobile.jpg`.
- NOT RUN: full ticket/integration CI gates; logout/login, reboot, Codex quit, sleep/wake. Login autostart is configured, not observed. No remote integration claim.

See sanitized `persistent-preview-verification.json` and `persistent-preview-browser-checks.json` for machine-recorded observations. Runtime app checkpoint remains `ec11d99`; later evidence-only commits do not alter its application bytes.

## Management and limits

Restart: `launchctl kickstart -k gui/501/com.helix.local-preview`. Stop: `launchctl bootout gui/501/com.helix.local-preview`. Management guide includes bootstrap/status and refresh/rollback procedure. Leave the service running at handoff.

This is a production snapshot, not hot reload: future source edits must be explicitly copied and built in the durable runtime before restart. The original editable worktree remains `/tmp/helix-lander-review`. Mac must be awake and logged in. KeepAlive restarts exited processes; it does not guarantee every provider request. No power/security setting was changed to evade those limits.

## Independent final review

Both roles reviewed committed candidate `0d21ed9db897e8de12da78efd4e55cc5e7467922` against `ece67ba9edaa78856100b99fa75ae63b16a144e6`, including installed configuration, runtime, copy delta, evidence and screenshots. `/root/spec_review`: **approve**, no actionable findings. `/root/standards_review`: **approve**, no actionable findings. Both independently checked installed plist identity, running service, loopback listener, private modes and runtime source match. Standards also confirmed all1584symlinks remain inside the site; its additional ps inspection was sandbox-restricted, so it reviewed recorded PPID/restart evidence. Neither edited files or interrupted the service. This later evidence-only receipt does not change the reviewed application/configuration candidate.
