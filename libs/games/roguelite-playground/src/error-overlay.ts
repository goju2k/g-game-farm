/**
 * Errors on screen (D-045): a phone has no console, so anything uncaught —
 * a script error, a rejected promise, or React giving up on the whole tree —
 * is written over the page in small text, with the build label, for the
 * player to screenshot. Plain DOM, outside React, so it survives React
 * unmounting. A WebGL failure gets a plain-language line first.
 */

const MAX_SHOWN = 4;

export interface ErrorOverlay {
  /** Reports an error (deduplicated by message); `fatal` = the game has stopped. */
  report(error: unknown, fatal?: boolean): void;
}

function describe(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, stack: (error.stack ?? '').split('\n').slice(1, 5).join('\n') };
  return { message: String(error), stack: '' };
}

/** A line a player can act on, for failures that are the device's, not the game's. */
function plainWords(message: string): string | undefined {
  if (/WebGL/i.test(message)) return '이 기기·브라우저에서는 WebGL2를 쓸 수 없어 게임을 그릴 수 없습니다. 크롬 최신 버전으로 열어 보세요.';
  if (/context lost/i.test(message)) return '그래픽 장치가 초기화됐습니다. 새로고침해 주세요.';
  return undefined;
}

export function installErrorOverlay(buildLabel: string): ErrorOverlay {
  const seen = new Set<string>();
  let box: HTMLDivElement | undefined;
  let list: HTMLDivElement | undefined;
  let heading: HTMLDivElement | undefined;

  const ensure = () => {
    if (box) return;
    box = document.createElement('div');
    box.setAttribute('role', 'alert');
    Object.assign(box.style, {
      position: 'fixed',
      left: '8px',
      right: '8px',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
      maxHeight: '60%',
      overflow: 'auto',
      zIndex: '2147483647',
      background: 'rgba(20, 6, 10, 0.92)',
      border: '1px solid rgba(255, 120, 120, 0.6)',
      borderRadius: '6px',
      padding: '8px 10px',
      color: '#ffd9d9',
      font: '11px/1.4 monospace',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      touchAction: 'pan-y',
      pointerEvents: 'auto',
    });
    heading = document.createElement('div');
    heading.style.marginBottom = '6px';
    heading.style.color = '#fff';
    list = document.createElement('div');
    const close = document.createElement('div');
    close.textContent = '닫기 ✕';
    Object.assign(close.style, { marginTop: '6px', textAlign: 'right', opacity: '0.7', cursor: 'pointer' });
    close.addEventListener('pointerup', () => box?.remove());
    close.addEventListener('click', () => box?.remove());
    box.append(heading, list, close);
    document.body.appendChild(box);
  };

  const report = (error: unknown, fatal = false) => {
    const { message, stack } = describe(error);
    if (seen.has(message)) return;
    seen.add(message);
    ensure();
    if (!heading || !list || !box) return;
    if (!box.isConnected) document.body.appendChild(box);
    heading.textContent = `${fatal ? '오류로 게임이 멈췄습니다' : '오류가 났습니다'} — 이 화면을 캡처해 보내 주세요. (${buildLabel}, ${navigator.userAgent.replace(/^Mozilla\/5\.0 /, '')})`;
    if (seen.size > MAX_SHOWN) return;
    const item = document.createElement('div');
    const plain = plainWords(message);
    item.textContent = `${plain ? `${plain}\n` : ''}${message}${stack ? `\n${stack}` : ''}`;
    item.style.marginTop = '4px';
    list.appendChild(item);
  };

  window.addEventListener('error', (e) => report(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => report(e.reason));
  return { report };
}
