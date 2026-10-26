/**
 * The draw-order rule of a `sortByDepth` layer (see LayerConfig): each run
 * of consecutive submissions that carry a depth is drawn in ascending depth
 * — a 3/4-view game passes the feet's y, so whoever stands lower on screen
 * is drawn in front. Equal depths keep their submission order. A submission
 * without a depth ends the run and keeps its own place (an effect drawn
 * after everything stays on top).
 */
export class DepthRun<T> {
  private items: { readonly depth: number; readonly item: T }[] = [];

  add(depth: number, item: T): void {
    this.items.push({ depth, item });
  }

  /** Hands the held run over in draw order and starts a new one. */
  drain(draw: (item: T) => void): void {
    if (this.items.length === 0) return;
    const run = this.items;
    this.items = [];
    run.sort((a, b) => a.depth - b.depth); // Array.prototype.sort is stable
    for (const { item } of run) draw(item);
  }
}
