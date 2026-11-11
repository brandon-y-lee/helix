# Mission portrait: user-selected Supabase asset

The user authorized uploading the saved bottle-removed image with a conventional name and replacing only the first hover/Mission image locally. No push, merge, or deployment. Exact plan SHA-256 `ee02fe16b092b68301470ce56b8bb8a89a384da41e892a513e327563778de851` received independent Spec and Standards approval before upload and source changes, with no actionable findings. Full local plan: `/tmp/helix-mission-image-plan.md`.

The input PNG is 1121 × 1403, 1,788,863 bytes, SHA-256 `6b2db0ffc07bdbc12e1674130ca8ba875247bcb7425f73827daf502f748653b8`. Parent verified attachment identity; this executor independently checked its hash, dimensions, and pixels. It shows a seated man in a black jacket against a pale background with the bottle removed. The original remains unchanged.

Lossless WebP conversion preserves dimensions and decoded RGB pixels exactly, removes EXIF/XMP, and yields 1,186,484 bytes. Payload SHA-256: `53676dcc05da072cd1155e7cb189c57001338cdede56bf7da695fb0df2780d66`.

Verified target: healthy approved project `erasogmsqpgiirovubjh`, existing public bucket `helix-catalog`, 16 MiB limit with WebP allowed. The name extends the existing page-owned owner/role/content-hash pattern used by the FAQ hero. New object:

`pages/home/principles/mission/53676dcc05da072cd1155e7cb189c57001338cdede56bf7da695fb0df2780d66.webp`

Public URL: https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/helix-catalog/pages/home/principles/mission/53676dcc05da072cd1155e7cb189c57001338cdede56bf7da695fb0df2780d66.webp

Live SQL and an immediate SDK lookup verified the destination was unused. One upload completed with `upsert:false`, `image/webp`, and cache lifetime 31,536,000 seconds, using an existing private server credential. An unauthenticated public GET at `2026-11-11T05:38:55.047Z` returned HTTP 200, `image/webp`, and `public, max-age=31536000`; complete bytes, hash, and dimensions matched. A private operation journal records attempted, uploaded, and verified states. No credential or token is retained in source or evidence.

No existing object was overwritten or deleted. No bucket, policy, schema, provider configuration, Product, or Catalog change occurred. The new object remains available if local code is rolled back.

The immutable URL is centralized in `lib/content/home-principles-media.ts`; only Mission's image source changes in `lib/content/home.ts`, retaining the initial `50% 68%` focal position. The original local portrait and its other consumers, the other two images, controls, transitions, CTAs, and prior title trial remain intact.

The browser fixture permits this exact editorial URL alongside the existing exact FAQ image. Unknown Storage objects remain blocked. Existing containment tests cover direct and optimized approved delivery plus rejection of unknown paths under the same prefix, preserving Product substitution. All 19 focused tests, lint, typecheck, and whitespace checks passed. Committed delta review and persistent-preview production/browser verification remain pending at this source checkpoint.
