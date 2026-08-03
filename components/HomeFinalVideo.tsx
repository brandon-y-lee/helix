import { HomeBackgroundVideo } from "@/components/HomeBackgroundVideo";

const FINAL_CTA_POSTER = "/media/home/final-cta-poster.webp";
const FINAL_CTA_WEBM = "/media/home/final-cta-loop.webm?v=8de3ea79725b";
const FINAL_CTA_MP4 = "/media/home/final-cta-loop.mp4?v=0fc8a75fd1c4";

export function HomeFinalVideo() {
  return (
    <HomeBackgroundVideo
      frameClassName="home-final-media"
      poster={FINAL_CTA_POSTER}
      posterClassName="home-final-media__poster"
      posterSizes="100vw"
      sources={[
        { src: FINAL_CTA_WEBM, type: "video/webm" },
        { src: FINAL_CTA_MP4, type: "video/mp4" },
      ]}
      videoClassName="home-final-media__video"
    />
  );
}
