import { HomeBackgroundVideo } from "@/components/HomeBackgroundVideo";

const HERO_POSTER = "/media/home/mei-pelle-hero-poster.webp";
const HERO_WEBM = "/media/home/mei-pelle-hero.webm?v=469b5c0022c8";
const HERO_MP4 = "/media/home/mei-pelle-hero.mp4?v=7048d1daaa75";

export function HomeHeroVideo() {
  return (
    <HomeBackgroundVideo
      eager
      frameClassName="home-video-hero__media"
      poster={HERO_POSTER}
      posterClassName="home-video-hero__poster"
      posterPriority
      posterSizes="100vw"
      sources={[
        { src: HERO_WEBM, type: "video/webm" },
        { src: HERO_MP4, type: "video/mp4" },
      ]}
      videoClassName="home-video-hero__video"
    />
  );
}
