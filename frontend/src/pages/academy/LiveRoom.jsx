import { LiveKitRoom, VideoConference, RoomAudioRenderer } from '@livekit/components-react';
import '@livekit/components-styles';

/** LiveKit video room (same SFU + TURN stack as EcoMeet). Loaded lazily to keep the main bundle small. */
export default function LiveRoom({ info, onLeave, onEnd }) {
  return (
    <div className="-mx-4 -my-8 sm:-mx-8">
      <div className="flex items-center justify-between gap-3 bg-night px-4 py-3 text-dawn">
        <p className="truncate font-display text-xl font-semibold text-gold-light">{info.meeting?.title}</p>
        <div className="flex gap-2">
          {onEnd && <button type="button" className="btn-ghost-light btn-sm" onClick={() => { if (window.confirm('End this meeting for everyone?')) onEnd(); }}>End for all</button>}
          <button type="button" className="btn-gold btn-sm" onClick={onLeave}>Leave</button>
        </div>
      </div>
      <div data-lk-theme="default" className="h-[calc(100vh-7.5rem)] bg-night">
        <LiveKitRoom
          serverUrl={info.serverUrl}
          token={info.token}
          connect
          video={false}
          audio
          onDisconnected={onLeave}
          options={{ adaptiveStream: true, dynacast: true }}
          connectOptions={{ rtcConfig: { iceServers: info.iceServers } }}
          style={{ height: '100%' }}
        >
          <VideoConference />
          <RoomAudioRenderer />
        </LiveKitRoom>
      </div>
    </div>
  );
}
