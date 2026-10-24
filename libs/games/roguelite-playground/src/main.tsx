import { AnimLab, RogueliteGame, ROGUELITE_ROOM_IDS } from '@g-game-farm/roguelite';
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (!root) {
  throw new Error('roguelite-playground: #root element not found.');
}

const params = new URLSearchParams(window.location.search);

// ?anim=<asset id> opens the animation lab for public/game/characters/<id>/<id>.anim.json instead of the game.
const animAsset = params.get('anim');

// ?room=<room id> boots straight into that room (e.g. ?room=room-c) — iterate on one room without replaying the demo.
const requestedRoom = params.get('room');
if (requestedRoom !== null && !ROGUELITE_ROOM_IDS.includes(requestedRoom)) {
  console.warn(`roguelite-playground: unknown ?room=${requestedRoom} — known rooms: ${ROGUELITE_ROOM_IDS.join(', ')}. Starting from the first room.`);
}
const bootScene = requestedRoom !== null && ROGUELITE_ROOM_IDS.includes(requestedRoom) ? requestedRoom : undefined;

// ?touch=1 / ?touch=0 force the on-screen touch controls on/off; otherwise they follow the last input device.
const touchParam = params.get('touch');
const touch = touchParam === '1' ? 'on' : touchParam === '0' ? 'off' : 'auto';

createRoot(root).render(animAsset ? <AnimLab assetId={animAsset} /> : <RogueliteGame showDevHud bootScene={bootScene} touch={touch} />);
