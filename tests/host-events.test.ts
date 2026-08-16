
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

describe('when the bed retires', () => {
  const feedFor = (world: ReturnType<typeof createWorld>, audio: Audio): HostEventFeed =>
    new HostEventFeed({
      audio,
      cam: makeCamera(100, 100),
      world: () => world,
      combat: () => DEFAULT_COMBAT,
      cueForEvent: () => null,
      panAnchor: () => world.players[0],
    });

  const bossDied = { tick: 1, type: 'enemy_died', actor: 1, data: { archetype: 'first_blade' } };

  it('retires it when the boss falling is the end of the room', () => {
    const world = createWorld(ENCOUNTERS.first_blade, DEFAULT_COMBAT, 1);
    world.outcome = 'cleared';
    const audio = new Audio();
    const retire = vi.spyOn(audio, 'retireMusic');

    feedFor(world, audio).absorb([bossDied as never]);

    expect(retire).toHaveBeenCalled();
  });

  it('leaves it playing when the room is still running', () => {
    const world = createWorld(ENCOUNTERS.first_blade, DEFAULT_COMBAT, 1);
    world.outcome = 'running';
    const audio = new Audio();
    const retire = vi.spyOn(audio, 'retireMusic');

    feedFor(world, audio).absorb([bossDied as never]);


    expect(retire).not.toHaveBeenCalled();
  });
});
