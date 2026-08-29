import { GameCanvas } from './game-canvas';

export default function Page() {
  return (
    <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <GameCanvas />
    </main>
  );
}
