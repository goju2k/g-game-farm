import { RogueliteGame } from '@g-game-farm/roguelite';
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (!root) {
  throw new Error('roguelite-playground: #root element not found.');
}

createRoot(root).render(<RogueliteGame showDevHud />);
