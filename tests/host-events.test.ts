
import { addPlayer, createWorld } from '../src/sim/encounter';
import { DEFAULT_COMBAT } from '../src/lab/config';
import { ENCOUNTERS } from '../src/lab/encounters';
import { Audio } from '../src/render/audio';
import { makeCamera } from '../src/render/iso';
import { HostEventFeed } from '../src/app/host-events';

it('anchors player events on the king local to this screen', () => {
  const world = createWorld(ENCOUNTERS.kernel_guard, DEFAULT_COMBAT, 1);
  world.players[0].pos = { x: -1, y: 1 };
  const local = addPlayer(world, DEFAULT_COMBAT, { x: 1, y: -1 });
  const cam = makeCamera(100, 100);
  const audio = new Audio();
  const play = vi.spyOn(audio, 'play');
  const feed = new HostEventFeed({
    audio,
    cam,
    world: () => world,
    combat: () => DEFAULT_COMBAT,
    cueForEvent: () => 'hit',
    panAnchor: () => local,
  });

  feed.absorb([{ tick: 1, type: 'run_started', actor: 0 }]);

  expect(play).toHaveBeenCalledWith('hit', 1, { spanMs: undefined, intensity: undefined });
});
