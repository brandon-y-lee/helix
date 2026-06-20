# Homepage Hero Video

## Source Audit

- Source filename: `Mei-Pelle-Hero.mov`
- Source container: QuickTime movie
- Source video codec: H.264 / `avc1`
- Source dimensions: 1920 x 1080
- Source frame rate: 25 fps
- Source duration: 12.32 seconds
- Source bitrate: approximately 7.2 Mbps
- Source size: approximately 11.2 MB
- Source audio: AAC stereo track present
- Orientation: landscape 16:9

The first and final frames do not match perfectly, but the loop has no black flash or blank transition. The subject stays mostly center-to-right, leaving the lower-left area available for restrained homepage copy when supported by a localized contrast scrim.

## Committed Outputs

- `public/media/home/mei-pelle-hero.mp4`
  - H.264 MP4
  - 1920 x 1080
  - 12.32 seconds
  - no audio track
  - 11,135,021 bytes
- `public/media/home/mei-pelle-hero-poster.webp`
  - representative frame near 3 seconds
  - WebP
  - 16,428 bytes

No separate mobile derivative was created. The source composition holds up with responsive `object-position`, and a second full video would increase transfer weight without materially improving the crop.

No WebM file was committed. The available local tooling could not produce a reliable VP8/VP9 export from the supplied H.264 source; the MP4 remains the practical web-compatible delivery asset for this task.

## Hero Behavior

The homepage hero renders `Ascension awaits.` as the semantic H1 using the existing Marcellus font variable and a restrained `display-secondary` scale. The only action is the rounded outlined `EXPLORE NOW` link to `/products`.

The poster renders immediately. The decorative video is mounted only when `prefers-reduced-motion` allows motion, then fades in after media readiness. If playback or loading fails, the poster remains visible and the headline and CTA continue to work.

Desktop crop uses `object-position: 58% center`; tablet and mobile shift toward the subject with `62% center` and `64% center`. The hero uses a subtle left and bottom scrim to keep text contrast consistent across the bright footage without darkening the entire video.
