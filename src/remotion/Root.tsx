import { Composition } from "remotion";
import { WarReport, DEFAULT_PROPS } from "./WarReport";
import { SocialClip, DEFAULT_SOCIAL_PROPS } from "./SocialClip";
import { ComingSoon, DEFAULT_COMING_SOON } from "./ComingSoon";

const FPS = 30;

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="WarReport"
        component={WarReport}
        durationInFrames={Math.round(DEFAULT_PROPS.seconds * FPS)}
        fps={FPS}
        width={1280}
        height={720}
        defaultProps={DEFAULT_PROPS}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.round((props.seconds || 8) * FPS),
        })}
      />
      <Composition
        id="SocialClip"
        component={SocialClip}
        durationInFrames={Math.round(DEFAULT_SOCIAL_PROPS.seconds * FPS)}
        fps={FPS}
        width={720}
        height={1280}
        defaultProps={DEFAULT_SOCIAL_PROPS}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.round((props.seconds || 10) * FPS),
        })}
      />
      <Composition
        id="ComingSoon"
        component={ComingSoon}
        durationInFrames={Math.round(DEFAULT_COMING_SOON.seconds * FPS)}
        fps={FPS}
        width={720}
        height={1280}
        defaultProps={DEFAULT_COMING_SOON}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.round((props.seconds || 7) * FPS),
        })}
      />
    </>
  );
};
