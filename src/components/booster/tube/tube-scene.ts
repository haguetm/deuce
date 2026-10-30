import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  WebGLRenderer,
  type Object3D,
  type Texture,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { TUBE_TIMING } from "./tube-timing";

/**
 * Tennis-ball tube in 3D (Three.js, no React). Built from primitives: clear
 * glossy plastic with three felt balls inside, lacquered base and rims in
 * the pack color, printed label, aluminium seal with its pull ring, and a
 * halo, a light pool and twinkling stars around it. The React wrapper
 * drives it: pull() peels the seal to mid-course while the server answers,
 * resolve(golden) plays gold, puff and rising cards then calls onEmerged,
 * reject() reseals. Frame rate at rest is reported once.
 */
export interface TubeSceneOptions {
  wordmark: string;
  label: string;
  font: string;
  colors: {
    pack: string;
    metal: string;
    aluminium: string;
    gold: string;
    puff: string;
    cream: string;
    ball: string;
    emerald: string;
  };
  onPull: () => void;
  onEmerged: () => void;
  /** Average frame rate over the first 2 visible seconds at rest. */
  onFps: (average: number) => void;
}

export interface TubeScene {
  setLabel(label: string, packColor: string): void;
  setEnabled(enabled: boolean): void;
  pull(): void;
  resolve(golden: boolean): void;
  reject(): void;
  dispose(): void;
}

const RADIUS = 0.68;
const HEIGHT = 4;
const TOP = HEIGHT / 2;
const BALL = RADIUS * 0.94;
/** Seal angles (radians, around its back edge). */
const SEAL_HALF = -0.9;
const SEAL_OFF = -2.6;
const FPS_WINDOW_MS = 2000;
const DRAG_TO_PULL_PX = 50;
/** Hand spin: one turn per ~300 px dragged, then inertia back to idle. */
const SPIN_PER_PX = (Math.PI * 2) / 300;
const SPIN_MAX_SPEED = 9;
const SPIN_DAMPING = 2.5;
const IDLE_SPEED = 0.35;

type Stage =
  | { name: "rest" }
  | { name: "pulling"; from: number; start: number }
  | { name: "waiting" }
  | { name: "resealing"; from: number; start: number }
  | { name: "exit"; golden: boolean; start: number }
  | { name: "out" };

const ease = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);

const shade = (hex: string, lightness: number) =>
  `#${new Color(hex).offsetHSL(0, 0, lightness).getHexString()}`;

function drawLabel(
  canvas: HTMLCanvasElement,
  options: TubeSceneOptions,
  label: string,
  pack: string,
) {
  const ctx = canvas.getContext("2d")!;
  const { width: w, height: h } = canvas;
  const { cream, ball, gold } = options.colors;
  const deep = shade(pack, -0.3);

  // Glossy band: light from the top, deeper at the bottom.
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, shade(pack, 0.16));
  bg.addColorStop(0.45, pack);
  bg.addColorStop(1, deep);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Speed stripes all around.
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = cream;
  for (let x = -h; x < w + h; x += 90) {
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + 34, h);
    ctx.lineTo(x + 34 + h * 0.6, 0);
    ctx.lineTo(x + h * 0.6, 0);
    ctx.fill();
  }
  ctx.restore();

  // Ball-colored bands, each with a gold pinstripe.
  ctx.fillStyle = ball;
  ctx.fillRect(0, h * 0.03, w, h * 0.05);
  ctx.fillRect(0, h * 0.92, w, h * 0.05);
  ctx.fillStyle = gold;
  ctx.fillRect(0, h * 0.1, w, h * 0.012);
  ctx.fillRect(0, h * 0.89, w, h * 0.012);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const face = (cx: number) => {
    // Court lines behind the wordmark.
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = cream;
    ctx.lineWidth = h * 0.012;
    const cw = h * 1.5;
    const top = h * 0.17;
    const ch = h * 0.66;
    ctx.strokeRect(cx - cw / 2, top, cw, ch);
    ctx.strokeRect(cx - cw * 0.36, top, cw * 0.72, ch);
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(cx, top + ch);
    ctx.stroke();
    ctx.restore();

    // Wordmark: thick, outlined, with a drop shadow.
    const word = options.wordmark.split("").join(" ");
    ctx.font = `900 ${h * 0.24}px ${options.font}`;
    ctx.lineJoin = "round";
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillText(word, cx + h * 0.012, h * 0.436);
    ctx.lineWidth = h * 0.03;
    ctx.strokeStyle = deep;
    ctx.strokeText(word, cx, h * 0.42);
    const text = ctx.createLinearGradient(0, h * 0.3, 0, h * 0.54);
    text.addColorStop(0, "white");
    text.addColorStop(1, cream);
    ctx.fillStyle = text;
    ctx.fillText(word, cx, h * 0.42);

    // Booster name in a ball-colored pill.
    ctx.font = `800 ${h * 0.1}px ${options.font}`;
    const name = label.toUpperCase();
    const pill = Math.max(ctx.measureText(name).width + h * 0.18, h * 0.5);
    ctx.fillStyle = ball;
    ctx.beginPath();
    ctx.roundRect(cx - pill / 2, h * 0.6, pill, h * 0.14, h * 0.07);
    ctx.fill();
    ctx.fillStyle = deep;
    ctx.fillText(name, cx, h * 0.672);

    ctx.fillStyle = "white";
    for (const [dx, dy, r] of [
      [-0.64, 0.3, 0.04],
      [0.68, 0.52, 0.03],
      [-0.5, 0.76, 0.024],
      [0.56, 0.22, 0.022],
    ]) {
      star(ctx, cx + dx * h, dy * h, r * h);
    }
  };
  // Front: middle of the texture. Back: the seam, drawn as two halves at
  // both edges, so the booster name shows whichever side faces the player.
  face(w / 2);
  face(0);
  face(w);
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const d = i % 2 === 0 ? r : r * 0.28;
    ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.fill();
}

/** Optic-yellow felt with its white seam, wrapped around a sphere. */
function ballTexture(color: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.10)" : "rgba(60,80,0,0.10)";
    ctx.fillRect(Math.random() * 512, Math.random() * 256, 2, 2);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 9;
  ctx.shadowColor = "rgba(255,255,255,0.6)";
  ctx.shadowBlur = 6;
  ctx.beginPath();
  for (let x = 0; x <= 512; x += 4) {
    const y = 128 + 62 * Math.sin((x / 512) * Math.PI * 4);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Soft radial glow, white in the middle: halo, light pool, stars. */
function glowTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new CanvasTexture(canvas);
}

/** Back of a card: night blue, gold frame, wordmark and a ball. */
function cardBackTexture(options: TubeSceneOptions): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 358;
  const ctx = canvas.getContext("2d")!;
  const { gold, ball, cream, pack } = options.colors;
  const bg = ctx.createLinearGradient(0, 0, 256, 358);
  bg.addColorStop(0, shade(pack, -0.05));
  bg.addColorStop(1, shade(pack, -0.38));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 358);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 10;
  ctx.strokeRect(9, 9, 238, 340);
  ctx.lineWidth = 2;
  ctx.strokeRect(22, 22, 212, 314);
  ctx.fillStyle = ball;
  ctx.beginPath();
  ctx.arc(128, 150, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "white";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(92, 150, 34, -0.9, 0.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(164, 150, 34, Math.PI - 0.9, Math.PI + 0.9);
  ctx.stroke();
  ctx.fillStyle = cream;
  ctx.textAlign = "center";
  ctx.font = `900 34px ${options.font}`;
  ctx.fillText(options.wordmark.split("").join(" "), 128, 250);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Vertical fade, opaque at the bottom: the light beam out of the tube. */
function beamTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.6, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  return new CanvasTexture(canvas);
}

/** Cards out of the tube, fanned. */
const CARD_COUNT = 5;

export function createTubeScene(
  canvas: HTMLCanvasElement,
  options: TubeSceneOptions,
): TubeScene {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;

  const camera = new PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(0, 1.1, 10.2);
  camera.lookAt(0, 0.4, 0);

  scene.add(new AmbientLight(new Color(1, 1, 1), 0.45));
  const key = new DirectionalLight(new Color(1, 1, 1), 2.2);
  key.position.set(3, 5, 6);
  scene.add(key);
  // Colored rims: the ball color on one side, the pack color on the other.
  const rimBall = new DirectionalLight(new Color(options.colors.ball), 1.4);
  rimBall.position.set(-5, 2, -2);
  scene.add(rimBall);
  const rimPack = new DirectionalLight(new Color(options.colors.pack), 2);
  rimPack.position.set(5, -1, -3);
  scene.add(rimPack);

  // Halo behind the tube, light pool under it, stars around -----------------
  const glow = glowTexture();
  const haloColor = (pack: string) =>
    new Color(pack).lerp(new Color(options.colors.ball), 0.35);
  const haloMaterial = new SpriteMaterial({
    map: glow,
    color: haloColor(options.colors.pack),
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const halo = new Sprite(haloMaterial);
  // Fades out inside the canvas: no hard edge on its borders.
  halo.scale.set(3.4, 5.6, 1);
  halo.position.set(0, 0.3, -2.5);
  scene.add(halo);
  const floor = new Mesh(
    new PlaneGeometry(2.8, 2.8),
    new MeshBasicMaterial({
      map: glow,
      color: new Color(options.colors.ball),
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -TOP - 0.25;
  scene.add(floor);

  const starGeometry = new BufferGeometry();
  const starPositions = new Float32Array(40 * 3);
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = RADIUS + 0.5 + Math.random() * 1.2;
    starPositions.set(
      [Math.cos(a) * r, (Math.random() - 0.5) * HEIGHT * 1.2, Math.sin(a) * r],
      i * 3,
    );
  }
  starGeometry.setAttribute(
    "position",
    new Float32BufferAttribute(starPositions, 3),
  );
  const starMaterial = new PointsMaterial({
    map: glow,
    color: new Color(options.colors.ball).lerp(new Color(0xffffff), 0.4),
    size: 0.16,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const stars = new Points(starGeometry, starMaterial);
  scene.add(stars);

  // Tube --------------------------------------------------------------------
  const tube = new Group();
  scene.add(tube);

  // Lacquered base and rims in the pack color (gold for a golden booster).
  const lacquer = new MeshPhysicalMaterial({
    color: options.colors.pack,
    metalness: 0.35,
    roughness: 0.18,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  });
  const packColor = new Color(options.colors.pack);
  const goldColor = new Color(options.colors.gold);
  const base = new Mesh(
    new CylinderGeometry(RADIUS * 1.06, RADIUS * 1.02, 0.34, 96),
    lacquer,
  );
  base.position.y = -TOP + 0.13;
  tube.add(base);
  const rimGeometry = new TorusGeometry(RADIUS * 1.02, 0.06, 20, 96);
  for (const y of [TOP, -TOP + 0.3]) {
    const r = new Mesh(rimGeometry, lacquer);
    r.rotation.x = Math.PI / 2;
    r.position.y = y;
    tube.add(r);
  }

  // Three felt balls, stacked inside.
  // A shade deeper: the tone mapping and the plastic lighten it back.
  const ballMap = ballTexture(shade(options.colors.ball, -0.14));
  const ballMaterial = new MeshPhysicalMaterial({
    map: ballMap,
    roughness: 0.9,
    sheen: 0.6,
    sheenRoughness: 0.6,
    sheenColor: new Color(options.colors.ball),
  });
  const ballGeometry = new SphereGeometry(BALL, 48, 32);
  for (let i = 0; i < 3; i++) {
    const b = new Mesh(ballGeometry, ballMaterial);
    b.position.y = -TOP + 0.3 + BALL + (i * (HEIGHT - 0.42)) / 3;
    b.rotation.set(i * 0.9, i * 1.7, i * 0.4);
    tube.add(b);
  }

  // Clear, glossy plastic, drawn after the balls so they show through.
  const plastic = new MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.04,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    transparent: true,
    opacity: 0.12,
    envMapIntensity: 2.5,
    depthWrite: false,
    side: DoubleSide,
  });
  const body = new Mesh(
    new CylinderGeometry(RADIUS, RADIUS, HEIGHT, 96, 1, true),
    plastic,
  );
  body.renderOrder = 2;
  tube.add(body);

  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 2048;
  labelCanvas.height = 640;
  drawLabel(labelCanvas, options, options.label, options.colors.pack);
  const labelTexture = new CanvasTexture(labelCanvas);
  labelTexture.colorSpace = SRGBColorSpace;
  labelTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const label = new Mesh(
    new CylinderGeometry(RADIUS * 1.006, RADIUS * 1.006, 1.75, 96, 1, true),
    new MeshPhysicalMaterial({
      map: labelTexture,
      metalness: 0.1,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      // Brand colors as printed, not washed out by the tone mapping.
      toneMapped: false,
    }),
  );
  // The texture middle (u = 0.5) faces the camera.
  label.rotation.y = Math.PI;
  label.position.y = -0.05;
  label.renderOrder = 3;
  tube.add(label);

  // Seal: pivots around its back edge to peel off.
  const aluminium = new MeshStandardMaterial({
    color: options.colors.aluminium,
    metalness: 1,
    roughness: 0.16,
    side: DoubleSide,
    transparent: true,
  });
  const sealPivot = new Group();
  sealPivot.position.set(0, TOP + 0.05, -RADIUS * 0.98);
  tube.add(sealPivot);
  const seal = new Mesh(new CircleGeometry(RADIUS * 0.98, 96), aluminium);
  seal.rotation.x = -Math.PI / 2;
  seal.position.z = RADIUS * 0.98;
  sealPivot.add(seal);
  const ring = new Mesh(new TorusGeometry(0.16, 0.035, 12, 32), aluminium);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.03, RADIUS * 1.98 + 0.08);
  sealPivot.add(ring);

  // Cards inside, shown from the back: they rise, fan out and fly toward
  // the player at the end, handing over to the card stack of the page.
  const cards = new Group();
  const backMap = cardBackTexture(options);
  const cardMaterial = new MeshStandardMaterial({
    map: backMap,
    metalness: 0.2,
    roughness: 0.45,
    emissive: new Color(0xffffff),
    emissiveIntensity: 0.08,
  });
  const edgeMaterial = new MeshStandardMaterial({
    color: options.colors.gold,
    metalness: 0.7,
    roughness: 0.3,
  });
  const cardGeometry = new BoxGeometry(1.0, 1.4, 0.02);
  for (let i = 0; i < CARD_COUNT; i++) {
    cards.add(
      new Mesh(cardGeometry, [
        edgeMaterial,
        edgeMaterial,
        edgeMaterial,
        edgeMaterial,
        cardMaterial,
        cardMaterial,
      ]),
    );
  }
  cards.visible = false;
  tube.add(cards);

  // Light beam shooting up when the seal pops.
  const beamMap = beamTexture();
  const beamMaterial = new MeshBasicMaterial({
    map: beamMap,
    color: new Color(options.colors.ball).lerp(new Color(0xffffff), 0.3),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  });
  const beam = new Mesh(
    new CylinderGeometry(RADIUS * 1.9, RADIUS * 0.9, 5, 48, 1, true),
    beamMaterial,
  );
  beam.position.y = TOP + 2.5;
  tube.add(beam);

  // Particles: air puff (and gold sparkles for a golden booster).
  const makeParticles = (count: number, color: string, size: number) => {
    const geometry = new BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * RADIUS;
      positions.set(
        [Math.cos(angle) * r, TOP + 0.1, Math.sin(angle) * r],
        i * 3,
      );
      velocities.set(
        [
          Math.cos(angle) * (0.6 + Math.random()),
          1.8 + Math.random() * 2,
          Math.sin(angle) * (0.6 + Math.random()),
        ],
        i * 3,
      );
    }
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    const material = new PointsMaterial({
      color,
      size,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const points = new Points(geometry, material);
    tube.add(points);
    return { points, material, start: positions.slice(), velocities };
  };
  const puff = makeParticles(160, options.colors.puff, 0.12);
  const sparkles = makeParticles(90, options.colors.gold, 0.08);

  const animateParticles = (p: ReturnType<typeof makeParticles>, t: number) => {
    const position = p.points.geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      position.setXYZ(
        i,
        p.start[i * 3] + p.velocities[i * 3] * t,
        p.start[i * 3 + 1] + p.velocities[i * 3 + 1] * t - 1.2 * t * t,
        p.start[i * 3 + 2] + p.velocities[i * 3 + 2] * t,
      );
    }
    position.needsUpdate = true;
    p.material.opacity = t <= 0 || t >= 1 ? 0 : 0.9 * (1 - t);
  };

  // State -------------------------------------------------------------------
  let stage: Stage = { name: "rest" };
  let enabled = true;
  let disposed = false;
  let dragFrom: number | null = null;
  let dragAngle = 0;
  // Hand spin: last pointer x and time while held, speed (rad/s) after release.
  let spinFrom: { x: number; time: number } | null = null;
  let spinSpeed = 0;
  const pointer = new Vector2();
  const tilt = new Vector2();
  const raycaster = new Raycaster();
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  // Size --------------------------------------------------------------------
  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  // Input -------------------------------------------------------------------
  const hitsSeal = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects([seal, ring]).length > 0;
  };
  // Seal: drag up to pull it. Anywhere else: hold and drag to spin the tube.
  const onPointerDown = (event: PointerEvent) => {
    if (stage.name !== "rest") return;
    if (enabled && hitsSeal(event)) {
      dragFrom = event.clientY;
    } else {
      spinFrom = { x: event.clientX, time: event.timeStamp };
      spinSpeed = 0;
      canvas.style.cursor = "grabbing";
    }
    canvas.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (finePointer) {
      // Clamped: a held pointer (spin, seal) keeps reporting moves far
      // outside the canvas, which would tip the tube over.
      const rect = canvas.getBoundingClientRect();
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));
      tilt.set(
        clamp(((event.clientX - rect.left) / rect.width) * 2 - 1),
        clamp(((event.clientY - rect.top) / rect.height) * 2 - 1),
      );
    }
    if (spinFrom) {
      const delta = (event.clientX - spinFrom.x) * SPIN_PER_PX;
      const seconds = (event.timeStamp - spinFrom.time) / 1000;
      tube.rotation.y += delta;
      if (seconds > 0) {
        const speed = Math.max(
          -SPIN_MAX_SPEED,
          Math.min(SPIN_MAX_SPEED, delta / seconds),
        );
        spinSpeed = spinSpeed * 0.5 + speed * 0.5;
      }
      spinFrom = { x: event.clientX, time: event.timeStamp };
      return;
    }
    if (dragFrom === null) {
      if (finePointer && stage.name === "rest") {
        canvas.style.cursor = enabled && hitsSeal(event) ? "pointer" : "grab";
      }
      return;
    }
    const dy = Math.max(0, dragFrom - event.clientY);
    dragAngle =
      (Math.min(dy, DRAG_TO_PULL_PX * 1.5) / (DRAG_TO_PULL_PX * 1.5)) *
      SEAL_HALF;
  };
  const onPointerUp = (event: PointerEvent) => {
    if (spinFrom) {
      // A pause before letting go means no throw.
      if (event.timeStamp - spinFrom.time > 80) spinSpeed = 0;
      spinFrom = null;
      canvas.style.cursor = finePointer ? "grab" : "";
      return;
    }
    if (dragFrom === null) return;
    const pulled = dragFrom - event.clientY >= DRAG_TO_PULL_PX;
    dragFrom = null;
    if (pulled) options.onPull();
    else dragAngle = 0;
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  // Loop ----------------------------------------------------------------------
  let last = performance.now();
  let fpsTime = 0;
  let fpsFrames = 0;
  let fpsReported = false;

  const loop = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    // Frame rate at rest, visible frames only, before any interaction.
    if (
      !fpsReported &&
      !document.hidden &&
      stage.name === "rest" &&
      dragFrom === null &&
      spinFrom === null
    ) {
      fpsTime += dt * 1000;
      fpsFrames += 1;
      if (fpsTime >= FPS_WINDOW_MS) {
        fpsReported = true;
        options.onFps((fpsFrames * 1000) / fpsTime);
      }
    }

    // Idle spin, held by the hand, or thrown and slowing down; turns the
    // label back to the front once opening.
    if (stage.name === "rest") {
      if (!spinFrom) {
        tube.rotation.y += (IDLE_SPEED + spinSpeed) * dt;
        spinSpeed *= Math.exp(-SPIN_DAMPING * dt);
      }
    } else {
      const target = Math.round(tube.rotation.y / (Math.PI * 2)) * Math.PI * 2;
      tube.rotation.y += (target - tube.rotation.y) * Math.min(1, dt * 6);
    }
    // Floats gently; the halo breathes, the stars turn and twinkle. While
    // the server answers, the tube trembles: something is coming.
    tube.position.y = 0.08 * Math.sin(now / 650);
    const shaking = stage.name === "waiting" || stage.name === "pulling";
    tube.position.x = shaking ? 0.025 * Math.sin(now / 21) : 0;
    haloMaterial.opacity = 0.75 + 0.2 * Math.sin(now / 500);
    stars.rotation.y += dt * 0.25;
    starMaterial.opacity = 0.55 + 0.35 * Math.sin(now / 280);
    tube.rotation.x += (tilt.y * 0.14 - tube.rotation.x) * Math.min(1, dt * 4);
    tube.rotation.z += (-tilt.x * 0.14 - tube.rotation.z) * Math.min(1, dt * 4);
    if (shaking) tube.rotation.z += 0.012 * Math.sin(now / 17);

    switch (stage.name) {
      case "rest":
        sealPivot.rotation.x +=
          (dragAngle - sealPivot.rotation.x) * Math.min(1, dt * 12);
        break;
      case "pulling": {
        const t = ease((now - stage.start) / TUBE_TIMING.pull);
        sealPivot.rotation.x = stage.from + (SEAL_HALF - stage.from) * t;
        if (t >= 1) stage = { name: "waiting" };
        break;
      }
      case "waiting":
        aluminium.emissive.setScalar(0.08 + 0.06 * Math.sin(now / 150));
        break;
      case "resealing": {
        const t = ease((now - stage.start) / TUBE_TIMING.pull);
        sealPivot.rotation.x = stage.from * (1 - t);
        aluminium.emissive.setScalar(0);
        if (t >= 1) {
          stage = { name: "rest" };
          dragAngle = 0;
        }
        break;
      }
      case "exit": {
        aluminium.emissive.setScalar(0);
        const goldMs = stage.golden ? TUBE_TIMING.golden : 0;
        const elapsed = now - stage.start;
        if (stage.golden) {
          const g = ease(elapsed / TUBE_TIMING.golden);
          lacquer.color.copy(packColor).lerp(goldColor, g);
          haloMaterial.color.lerp(goldColor, g);
          animateParticles(
            sparkles,
            elapsed / (TUBE_TIMING.golden + TUBE_TIMING.puff),
          );
        }
        const puffT = (elapsed - goldMs) / TUBE_TIMING.puff;
        if (puffT >= 0) {
          sealPivot.rotation.x =
            SEAL_HALF + (SEAL_OFF - SEAL_HALF) * ease(puffT);
          sealPivot.position.y = TOP + 0.05 + 1.5 * ease(puffT);
          aluminium.opacity = 1 - ease(puffT);
          animateParticles(puff, puffT);
          // The halo flares and a beam of light shoots out as the seal pops.
          const flare = 1 + 0.5 * Math.sin(Math.min(puffT, 1) * Math.PI);
          halo.scale.set(3.4 * flare, 5.6 * flare, 1);
          beamMaterial.opacity = ease(puffT);
          beam.scale.set(1, 0.3 + 0.7 * ease(puffT), 1);
          beam.position.y = TOP + 2.5 * beam.scale.y;
        }
        const riseT = (elapsed - goldMs - TUBE_TIMING.puff) / TUBE_TIMING.rise;
        if (riseT >= 0) {
          cards.visible = true;
          // Each card a little after the previous one: up out of the tube,
          // fanned, then toward the player, growing as the light fills in.
          cards.children.forEach((card, i) => {
            const t = Math.min(Math.max(riseT * 1.3 - i * 0.075, 0), 1);
            const up = ease(Math.min(t / 0.55, 1));
            const out = ease(Math.max((t - 0.45) / 0.55, 0));
            const spread = i - (CARD_COUNT - 1) / 2;
            card.position.set(
              spread * 0.42 * up * (1 - out * 0.6),
              0.3 + 2.9 * up - 1.2 * out,
              i * 0.03 + 6.5 * out,
            );
            card.rotation.set(-0.25 * out, 0, -spread * 0.16 * up * (1 - out));
            card.scale.setScalar(1 + 0.6 * out);
          });
          const glow = ease(riseT);
          halo.scale.set(3.4 * (1 + glow), 5.6 * (1 + glow), 1);
          haloMaterial.opacity = 0.9 + 0.1 * glow;
        }
        if (riseT >= 1) {
          stage = { name: "out" };
          options.onEmerged();
        }
        break;
      }
      case "out":
        break;
    }

    renderer.render(scene, camera);
  };
  renderer.setAnimationLoop(loop);

  // API -------------------------------------------------------------------------
  return {
    setLabel(text, color) {
      drawLabel(labelCanvas, options, text, color);
      labelTexture.needsUpdate = true;
      packColor.set(color);
      lacquer.color.set(color);
      rimPack.color.set(color);
      haloMaterial.color.copy(haloColor(color));
    },
    setEnabled(value) {
      enabled = value;
    },
    pull() {
      if (stage.name !== "rest") return;
      dragFrom = null;
      spinFrom = null;
      spinSpeed = 0;
      canvas.style.cursor = "";
      stage = {
        name: "pulling",
        from: sealPivot.rotation.x,
        start: performance.now(),
      };
    },
    resolve(golden) {
      if (stage.name !== "pulling" && stage.name !== "waiting") return;
      sealPivot.rotation.x = SEAL_HALF;
      stage = { name: "exit", golden, start: performance.now() };
    },
    reject() {
      if (stage.name !== "pulling" && stage.name !== "waiting") return;
      stage = {
        name: "resealing",
        from: sealPivot.rotation.x,
        start: performance.now(),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      const textures = new Set<Texture>([
        labelTexture,
        environment,
        glow,
        ballMap,
        backMap,
        beamMap,
      ]);
      const materials = new Set<Material>();
      scene.traverse((object: Object3D) => {
        const mesh = object as Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as Material | Material[] | undefined;
        for (const m of Array.isArray(material)
          ? material
          : material
            ? [material]
            : [])
          materials.add(m);
      });
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
