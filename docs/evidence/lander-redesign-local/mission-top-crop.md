# Mission portrait top anchor

The user requested top-pinned cropping so the model's head is retained. Continue the local preview from `fdca827`; no push, merge, deployment, or Storage write. Plan SHA-256 `1fea4046aef11f3d6519c806d87a162ad121a52ce871d5aeb609c841cfbeb04b` received independent Spec and Standards approval before implementation, with no actionable findings. Full local plan: `/tmp/helix-mission-top-crop-plan.md`.

Only application change: Mission's image position in `lib/content/home.ts` changes from `50% 68%` to `50% 0%`. The same immutable Supabase image remains horizontally centered and uses cover sizing. Other images, focal positions, layout, controls, transitions, CTAs, and the prior title trial are unchanged. The original source image is untouched.

Existing homepage and principles tests, lint, typecheck, whitespace, helper preparation, committed review, and persistent-preview production/browser checks are the verification path. No new test mirrors the focal value. Desktop and mobile headroom must be inspected at the refreshed checkpoint. Wider frame ratios can still trim the bottom of the portrait; top anchoring preserves the head without stretching the image.
