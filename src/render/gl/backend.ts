
import { Mesh as ThreeMesh, Object3D, Scene, WebGLRenderer } from 'three';

import type { World } from '../../sim/types';
import type { Camera } from '../iso';
import { ELEVATION_Y } from '../iso';
import { IsoCamera, syncIsoCamera } from './camera';
import { ActorBody, actorMaterial } from './actors';
import { RoomScene, type RoomColours } from './scene';
import type { SunkBody } from './sink';

const setColourWrite = (object: Object3D, enabled: boolean): void => {
  if (!(object instanceof ThreeMesh)) return;
  const material = object.material;
  if (Array.isArray(material)) {
    for (const entry of material) entry.colorWrite = enabled;
    return;
  }
  material.colorWrite = enabled;
};

export class GlBackend {
  private readonly renderer: WebGLRenderer;

  private readonly scene = new Scene();

  private readonly camera = new IsoCamera();

  private readonly material = actorMaterial();

  private readonly bodies = new Map<string, ActorBody>();

  private room: { scene: RoomScene; arena: World['arena'] } | null = null;

  private size = { width: 0, height: 0 };

  constructor(canvas?: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.sortObjects = false;
    this.renderer.autoClear = true;
  }

  private syncRoom(world: World, colours: RoomColours): void {
    if (this.room !== null && this.room.arena === world.arena) return;
    this.room?.scene.dispose();
    if (this.room !== null) this.scene.remove(this.room.scene.group);
    const scene = new RoomScene(world.arena, colours);
    this.scene.add(scene.group);
    this.room = { scene, arena: world.arena };
  }

  private syncBodies(actors: readonly SunkBody[], cam: Camera): void {
    actors.forEach((actor, index) => {
      const id = String(index);
      let body = this.bodies.get(id);
      if (body === undefined) {
        body = new ActorBody(this.material);
        this.bodies.set(id, body);
        this.scene.add(body.object);
      }
      const lift = actor.liftPx / (ELEVATION_Y * cam.zoom);
      body.update(actor.mesh, actor.opts, lift);
      body.object.visible = true;
    });
    for (const [id, body] of this.bodies) {
      if (Number(id) < actors.length) continue;
      body.object.visible = false;
    }
  }

  private resize(cam: Camera): void {
    const ratio = Math.min(2, globalThis.devicePixelRatio ?? 1);
    if (this.size.width === cam.width && this.size.height === cam.height) return;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(cam.width, cam.height, false);
    this.size = { width: cam.width, height: cam.height };
  }

  renderRoom(ctx: CanvasRenderingContext2D, world: World, cam: Camera, colours: RoomColours): void {
    this.resize(cam);
    this.syncRoom(world, colours);
    for (const body of this.bodies.values()) body.object.visible = false;
    syncIsoCamera(this.camera, cam);
    this.renderer.render(this.scene, this.camera);
    ctx.drawImage(this.renderer.domElement, 0, 0, cam.width, cam.height);
  }

  renderBodies(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    actors: readonly SunkBody[],
  ): void {
    if (actors.length === 0) return;
    this.resize(cam);
    this.syncBodies(actors, cam);
    const room = this.room?.scene.group;
    if (room !== undefined) room.traverse((object) => setColourWrite(object, false));
    syncIsoCamera(this.camera, cam);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (room !== undefined) room.traverse((object) => setColourWrite(object, true));
    ctx.drawImage(this.renderer.domElement, 0, 0, cam.width, cam.height);
  }

  readonly drawsPerFrame = 1;

  dispose(): void {
    for (const body of this.bodies.values()) body.dispose();
    this.bodies.clear();
    this.room?.scene.dispose();
    this.room = null;
    this.material.dispose();
    this.renderer.dispose();
  }
}
