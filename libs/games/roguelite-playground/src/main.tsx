import { RogueliteGame, ROGUELITE_ROOM_IDS } from '@g-game-farm/roguelite';
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (!root) {
  throw new Error('roguelite-playground: #root element not found.');
}

// ?room=<room id> boots straight into that room (e.g. ?room=room-c) — iterate on one room without replaying the demo.
const requestedRoom = new URLSearchParams(window.location.search).get('room');
if (requestedRoom !== null && !ROGUELITE_ROOM_IDS.includes(requestedRoom)) {
  console.warn(`roguelite-playground: unknown ?room=${requestedRoom} — known rooms: ${ROGUELITE_ROOM_IDS.join(', ')}. Starting from the first room.`);
}
const bootScene = requestedRoom !== null && ROGUELITE_ROOM_IDS.includes(requestedRoom) ? requestedRoom : undefined;

createRoot(root).render(<RogueliteGame showDevHud bootScene={bootScene} />);
