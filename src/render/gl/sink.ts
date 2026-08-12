
import type { Mesh, MeshDrawOpts } from '../mesh';

export interface SunkBody {
  mesh: Mesh;
  opts: MeshDrawOpts;
  liftPx: number;
}

let sink: ((body: SunkBody) => void) | null = null;

export const bodySink = (): ((body: SunkBody) => void) | null => sink;

export const withBodySink = <T>(next: (body: SunkBody) => void, run: () => T): T => {
  const previous = sink;
  sink = next;
  try {
    return run();
  } finally {
    sink = previous;
  }
};
