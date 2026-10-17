import { Composition } from "remotion";
import { WarReport, DEFAULT_PROPS } from "./WarReport";
import { SocialClip, DEFAULT_SOCIAL_PROPS } from "./SocialClip";
import { ComingSoon, DEFAULT_COMING_SOON } from "./ComingSoon";
import { Dispatch, DEFAULT_DISPATCH } from "./Dispatch";
import { CommanderDemo, COMMANDER_DEMO_SECONDS } from "./CommanderDemo";
import { CommanderClip, DEFAULT_COMMANDER_CLIP } from "./CommanderClip";

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
        id="Dispatch"
        component={Dispatch}
        durationInFrames={Math.round(DEFAULT_DISPATCH.seconds * FPS)}
        fps={FPS}
        width={720}
        height={1280}
        defaultProps={DEFAULT_DISPATCH}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.round((props.seconds || 12) * FPS),
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
      <Composition
        id="CommanderClip"
        component={CommanderClip}
        durationInFrames={Math.round(DEFAULT_COMMANDER_CLIP.seconds * FPS)}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={DEFAULT_COMMANDER_CLIP}
        calculateMetadata={({ props }) => ({ durationInFrames: Math.round((props.seconds || 15) * FPS) })}
      />
      <Composition
        id="CommanderDemo"
        component={CommanderDemo}
        durationInFrames={COMMANDER_DEMO_SECONDS * FPS}
        fps={FPS}
        width={1080}
        height={1080}
      />
    </>
  );
};
