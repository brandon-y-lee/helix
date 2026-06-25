# Homepage Hero Video

## Source Audit

- Source filename: `Mei-Pelle-3.mov`
- Source container: QuickTime movie
- Source video codec: H.264 / `avc1`
- Source dimensions: 1920 x 1080
- Source frame rate: 25 fps
- Source duration: 10.24 seconds
- Source bitrate: approximately 7.5 Mbps
- Source size: approximately 9.3 MB
- Source audio: AAC stereo track present
- Orientation: landscape 16:9

The footage moves from close right-side grooming details into a wider standing composition, then ends with a right-biased profile. The lower-left area stays available for restrained homepage copy when supported by a localized contrast scrim.

## Committed Outputs

- `public/media/home/mei-pelle-hero.mp4`
  - H.264 MP4
  - 1920 x 1080
  - 10.24 seconds
  - no audio track
  - 9,651,904 bytes
- `public/media/home/mei-pelle-hero.webm`
  - VP9 WebM
  - 1920 x 1080
  - 10.24 seconds
  - no audio track
  - 4,869,964 bytes
- `public/media/home/mei-pelle-hero-poster.webp`
  - representative frame near 0.2 seconds
  - WebP
  - 22,608 bytes

No separate mobile derivative was created. The source composition holds up with responsive `object-position`, and a second full video would increase transfer weight without materially improving the crop.

## Hero Behavior

The homepage hero renders `ascension.` as the semantic H1 using the existing Marcellus font variable and a restrained `display-secondary` scale. The only action is the rounded outlined `EXPLORE NOW` link to `/products`.

The poster renders immediately. The decorative video is mounted only when `prefers-reduced-motion` allows motion, then fades in after media readiness. If playback or loading fails, the poster remains visible and the headline and CTA continue to work.

Desktop crop uses `object-position: 58% center`; tablet and mobile shift toward the subject with `62% center` and `64% center`. The hero uses a subtle left and bottom scrim to keep text contrast consistent across the bright footage without darkening the entire video.
