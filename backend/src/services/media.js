'use strict';
/**
 * Online meetings — LiveKit SFU + Coturn TURN (same stack as EcoMeet).
 * Backend mints short-lived per-participant join tokens; React uses livekit-client.
 */
const crypto = require('crypto');
const config = require('../config');
const { logger } = require('../utils');

let sdk = null;
try { sdk = require('livekit-server-sdk'); } catch { /* optional */ } // eslint-disable-line global-require

const livekitReady = () => !!(sdk && config.media.livekitUrl && config.media.livekitApiKey && config.media.livekitApiSecret);

function roomNameFor(meeting) {
  return `${config.media.roomPrefix}${meeting.tenantId.slice(0, 8)}-${meeting.id}`;
}

async function ensureRoom(room, maxParticipants = 100) {
  if (!livekitReady()) return;
  try {
    const svc = new sdk.RoomServiceClient(config.media.livekitUrl.replace(/^ws/, 'http'), config.media.livekitApiKey, config.media.livekitApiSecret);
    await svc.createRoom({ name: room, maxParticipants, emptyTimeout: 600 });
  } catch (e) { logger.warn('livekit createRoom', { err: e.message }); }
}

async function joinToken({ room, user, isHost }) {
  const at = new sdk.AccessToken(config.media.livekitApiKey, config.media.livekitApiSecret, {
    identity: user.id, name: user.fullName, ttl: '4h', metadata: JSON.stringify({ host: !!isHost }),
  });
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true, roomAdmin: !!isHost });
  return at.toJwt();
}

/** Coturn time-limited HMAC credentials (use-auth-secret) */
function iceServers(ttlSec = 3600) {
  const servers = [{ urls: ['stun:stun.l.google.com:19302'] }];
  if (config.media.turnSecret && config.media.turnUrl) {
    const username = `${Math.floor(Date.now() / 1000) + ttlSec}`;
    const credential = crypto.createHmac('sha1', config.media.turnSecret).update(username).digest('base64');
    servers.push({
      urls: ['turn:turn.eshcloud.com:3478?transport=udp', 'turn:turn.eshcloud.com:3478?transport=tcp', 'turns:turn.eshcloud.com:5349?transport=tcp'],
      username, credential,
    });
  }
  return servers;
}

/** Returns what the frontend needs to join a meeting */
async function joinInfo(meeting, user, isHost) {
  if (meeting.provider === 'external') return { provider: 'external', url: meeting.joinUrl };
  if (meeting.provider === 'jitsi' || !livekitReady()) {
    const room = meeting.roomName || roomNameFor(meeting);
    return { provider: 'jitsi', url: `https://${config.media.jitsiDomain}/${encodeURIComponent(room)}`, room };
  }
  const room = meeting.roomName || roomNameFor(meeting);
  await ensureRoom(room, meeting.capacity || 100);
  return { provider: 'livekit', serverUrl: config.media.livekitUrl, token: await joinToken({ room, user, isHost }), room, iceServers: iceServers() };
}

module.exports = { joinInfo, roomNameFor, iceServers, livekitReady };
