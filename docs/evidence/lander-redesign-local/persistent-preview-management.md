# Helix persistent local preview

URL: http://127.0.0.1:3100/

This user LaunchAgent serves a checked production snapshot. It is independent of Codex terminal sessions and is configured to start at login and restart after its process exits. It binds only to this Mac's loopback address. It is not a remote deployment or a development hot-reload server.

- Service: `gui/501/com.helix.local-preview`
- Definition: `/Users/brandonlee/Library/LaunchAgents/com.helix.local-preview.plist`
- Runtime: `/Users/brandonlee/Library/Application Support/HelixPreview/site`
- Snapshot identity: `snapshot.json` beside this README.
- Logs: `logs/stdout.log`, `logs/stderr.log`, `logs/build.log` beside this README. Logs and configuration are private; do not publish their contents.
- Original editable worktree: `/tmp/helix-lander-review`, branch `codex/plan-lander-redesign-local`. The persistent runtime is a separate copy, not this temporary directory.

## Manage the service

Check status:

```sh
launchctl print gui/501/com.helix.local-preview
curl --fail http://127.0.0.1:3100/ --output /dev/null
```

Restart the current snapshot:

```sh
launchctl kickstart -k gui/501/com.helix.local-preview
```

Stop it for maintenance:

```sh
launchctl bootout gui/501/com.helix.local-preview
```

Start after a manual stop:

```sh
launchctl bootstrap gui/501 /Users/brandonlee/Library/LaunchAgents/com.helix.local-preview.plist
```

Stopping this session does not remove the saved login configuration. Do not start another foreground server on port 3100 while this service is loaded; launchd will restart its process if killed directly.

## Refresh after application edits

Merely editing or building the original worktree does NOT update this runtime snapshot. Ask Codex to refresh the persistent preview after verifying the intended revision:

1. Identify the exact task checkpoint. Preserve unrelated shared-checkout work and the currently working runtime for rollback.
2. Prepare a fresh copy of that checkpoint's tracked files and the matching locked dependencies. Do not include `.git`, generated originals or unrelated/uncommitted shared-checkout files.
3. Keep the existing app configuration private: `.env.local` must be a regular file with mode0600 under the private runtime, not a symlink to Desktop or a public asset. Do not print its values.
4. Stop the service for the runtime update. Build the refreshed site in its final runtime directory, using the existing Node24 installation. On failure, restore the previous working snapshot before starting the service.
5. Start with launchctl, verify HTTP200, the intended page/assets, and loopback-only binding. Keep this README and update snapshot.json with the actual source checkpoint.

The service uses `/Users/brandonlee/.nvm/versions/node/v24.19.0/bin/node` directly, without depending on shell startup files. If that Node installation is removed, update the plist's executable/PATH to an installed supported Node24 version and reload the service.

## Availability limits

The Mac must be awake and the user session logged in. Sleep, shutdown, logout, manual stop, missing configuration or runtime files can make the URL unavailable. KeepAlive supervises process exits; it does not guarantee that every application/provider request succeeds. Do not change power, firewall, authentication or Full Disk Access settings merely to keep this preview up.

Login/reboot behavior is configured, but must not be described as tested unless an actual login/reboot test has been performed. See verification.json for observed shell-survival and controlled process-restart results.
