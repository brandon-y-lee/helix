import { HomeBackgroundVideo } from "@/components/HomeBackgroundVideo";

const PLUG_POSTER = "/media/home/plug-and-play-poster.webp";
const PLUG_WEBM = "/media/home/plug-and-play-loop.webm?v=72384950eb3e";
const PLUG_MP4 = "/media/home/plug-and-play-loop.mp4?v=4907f7e08e94";

export function HomePlugVideo() {
  return (
    <HomeBackgroundVideo
      frameClassName="home-plug-media__frame"
      poster={PLUG_POSTER}
      posterClassName="home-plug-media__poster"
      posterSizes="(max-width: 900px) 100vw, 65vw"
      sources={[
        { src: PLUG_WEBM, type: "video/webm" },
        { src: PLUG_MP4, type: "video/mp4" },
      ]}
      videoClassName="home-plug-media__video"
    />
  );
}
