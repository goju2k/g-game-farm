import { AnimLab, RogueliteGame, ROGUELITE_OPENING_SCENE, ROGUELITE_ROOM_IDS } from '@g-game-farm/roguelite';
import { createRoot } from 'react-dom/client';
import { installErrorOverlay } from './error-overlay.js';
import { browserAudioContext, browserStorage } from './platform.js';

// First of all: anything uncaught shows on screen (a phone has no console, D-045).
const errors = installErrorOverlay(__BUILD_LABEL__);

const root = document.getElementById('root');
if (!root) {
  throw new Error('roguelite-playground: #root element not found.');
}

const params = new URLSearchParams(window.location.search);

// ?debug: debug HUDs, the test room (cast-lab), placeholder beeps for sounds that have no file yet.
const debug = params.has('debug');
/** Test rooms only reachable with ?debug (demo plan §1). */
const DEBUG_ROOMS = ['cast-lab'];

// ?anim=<asset id> opens the animation lab for public/game/characters/<id>/<id>.anim.json instead of the game.
const animAsset = params.get('anim');

// ?room=<room id> boots straight into that room (e.g. ?room=zone-6); without it the playground starts the opening.
const requestedRoom = params.get('room');
if (requestedRoom !== null && !ROGUELITE_ROOM_IDS.includes(requestedRoom)) {
  console.warn(`roguelite-playground: unknown ?room=${requestedRoom} — known rooms: ${ROGUELITE_ROOM_IDS.join(', ')}. Starting from the first room.`);
}
const roomAllowed = requestedRoom !== null && ROGUELITE_ROOM_IDS.includes(requestedRoom) && (debug || !DEBUG_ROOMS.includes(requestedRoom));
const bootScene = roomAllowed ? requestedRoom : ROGUELITE_OPENING_SCENE;

// ?touch=1 / ?touch=0 force the on-screen touch controls on/off; otherwise they follow the last input device.
const touchParam = params.get('touch');
const touch = touchParam === '1' ? 'on' : touchParam === '0' ? 'off' : 'auto';

// React giving up on the whole tree (an error in render) is fatal: say so on screen instead of a blank page.
createRoot(root, { onUncaughtError: (error) => errors.report(error, true) }).render(animAsset ? <AnimLab assetId={animAsset} /> : <RogueliteGame
      showDevHud={debug}
      debug={debug}
      bootScene={bootScene}
      skipTitle={roomAllowed} // ?room= jumps straight into that room
      touch={touch}
      platform={{ storage: browserStorage(), createAudioContext: browserAudioContext }}
      buildLabel={__BUILD_LABEL__}
    />);
