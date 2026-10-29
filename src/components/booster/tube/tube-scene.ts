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
  MeshStandardMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
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
 * Tennis-ball tube in 3D (Three.js, no React). Built from primitives: brushed
 * metal body, printed label, rims, aluminium seal with its pull ring. The
 * React wrapper drives it: pull() peels the seal to mid-course while the
 * server answers, resolve(golden) plays gold, puff and rising cards then
 * calls onEmerged, reject() reseals. Frame rate at rest is reported once.
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

const RADIUS = 1;
const HEIGHT = 3.2;
const TOP = HEIGHT / 2;
/** Seal angles (radians, around its back edge). */
const SEAL_HALF = -0.9;
const SEAL_OFF = -2.6;
const FPS_WINDOW_MS = 2000;
const DRAG_TO_PULL_PX = 50;
/** Hand spin: one turn per ~300 px dragged, then inertia back to idle. */
const SPIN_PER_PX = (Math.PI * 2) / 300;
const SPIN_MAX_SPEED = 9;
const SPIN_DAMPING = 2.5;
const IDLE_SPEED = 0.2;

type Stage =
  | { name: "rest" }
  | { name: "pulling"; from: number; start: number }
  | { name: "waiting" }
  | { name: "resealing"; from: number; start: number }
  | { name: "exit"; golden: boolean; start: number }
  | { name: "out" };

const ease = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);

function drawLabel(
  canvas: HTMLCanvasElement,
  options: TubeSceneOptions,
  label: string,
  pack: string,
) {
  const ctx = canvas.getContext("2d")!;
  const { width: w, height: h } = canvas;
  ctx.fillStyle = pack;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "center";
  const face = (cx: number) => {
    ctx.fillStyle = options.colors.cream;
    ctx.font = `700 ${h * 0.22}px ${options.font}`;
    ctx.fillText(options.wordmark.split("").join(" "), cx, h * 0.42);
    ctx.font = `500 ${h * 0.11}px ${options.font}`;
    ctx.fillText(label, cx, h * 0.62);
    ctx.fillStyle = options.colors.ball;
    for (const dx of [-1, 0, 1]) {
      ctx.beginPath();
      ctx.arc(cx + dx * h * 0.16, h * 0.82, h * 0.055, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  // Front: middle of the texture. Back: the seam, drawn as two halves at
  // both edges, so the booster name shows whichever side faces the player.
  face(w / 2);
  face(0);
  face(w);
}

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
  camera.position.set(0, 1.1, 9.5);
  camera.lookAt(0, 0.4, 0);

  scene.add(new AmbientLight(new Color(1, 1, 1), 0.35));
  const key = new DirectionalLight(new Color(1, 1, 1), 1.6);
  key.position.set(3, 5, 6);
  scene.add(key);
  const rim = new DirectionalLight(new Color(1, 1, 1), 0.8);
  rim.position.set(-4, 2, -3);
  scene.add(rim);

  // Tube --------------------------------------------------------------------
  const tube = new Group();
  scene.add(tube);

  const metal = new MeshStandardMaterial({
    color: options.colors.metal,
    metalness: 0.9,
    roughness: 0.35,
  });
  const metalColor = new Color(options.colors.metal);
  const goldColor = new Color(options.colors.gold);

  const body = new Mesh(
    new CylinderGeometry(RADIUS, RADIUS, HEIGHT, 72, 1, true),
    metal,
  );
  tube.add(body);

  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 1024;
  labelCanvas.height = 384;
  drawLabel(labelCanvas, options, options.label, options.colors.pack);
  const labelTexture = new CanvasTexture(labelCanvas);
  labelTexture.colorSpace = SRGBColorSpace;
  labelTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const label = new Mesh(
    new CylinderGeometry(RADIUS * 1.004, RADIUS * 1.004, 1.5, 72, 1, true),
    new MeshStandardMaterial({
      map: labelTexture,
      metalness: 0.15,
      roughness: 0.55,
      // Brand colors as printed, not washed out by the tone mapping.
      toneMapped: false,
    }),
  );
  // The texture middle (u = 0.5) faces the camera.
  label.rotation.y = Math.PI;
  label.position.y = -0.1;
  tube.add(label);

  const rimGeometry = new TorusGeometry(RADIUS, 0.055, 16, 72);
  for (const y of [TOP, -TOP]) {
    const ring = new Mesh(rimGeometry, metal);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    tube.add(ring);
  }
  const bottom = new Mesh(new CircleGeometry(RADIUS, 72), metal);
  bottom.rotation.x = Math.PI / 2;
  bottom.position.y = -TOP;
  tube.add(bottom);

  // Seal: pivots around its back edge to peel off.
  const aluminium = new MeshStandardMaterial({
    color: options.colors.aluminium,
    metalness: 1,
    roughness: 0.22,
    side: DoubleSide,
    transparent: true,
  });
  const sealPivot = new Group();
  sealPivot.position.set(0, TOP + 0.02, -RADIUS * 0.96);
  tube.add(sealPivot);
  const seal = new Mesh(new CircleGeometry(RADIUS * 0.96, 72), aluminium);
  seal.rotation.x = -Math.PI / 2;
  seal.position.z = RADIUS * 0.96;
  sealPivot.add(seal);
  const ring = new Mesh(new TorusGeometry(0.17, 0.035, 12, 32), aluminium);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.03, RADIUS * 1.75);
  sealPivot.add(ring);

  // Cards inside, rising at the end.
  const cards = new Group();
  const cardMaterial = new MeshStandardMaterial({
    color: options.colors.emerald,
    metalness: 0.1,
    roughness: 0.6,
  });
  const edgeMaterial = new MeshStandardMaterial({
    color: options.colors.gold,
    metalness: 0.6,
    roughness: 0.4,
  });
  for (let i = 0; i < 3; i++) {
    const card = new Mesh(new BoxGeometry(1.1, 1.55, 0.02), [
      edgeMaterial,
      edgeMaterial,
      edgeMaterial,
      edgeMaterial,
      cardMaterial,
      cardMaterial,
    ]);
    card.position.set(i * 0.05, 0, i * 0.04 - 0.04);
    cards.add(card);
  }
  cards.position.y = 0.4;
  cards.visible = false;
  tube.add(cards);

  // Particles: air puff (and gold sparkles for a golden booster).
  const makeParticles = (count: number, color: string, size: number) => {
    const geometry = new BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.8;
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
    tube.rotation.x += (tilt.y * 0.14 - tube.rotation.x) * Math.min(1, dt * 4);
    tube.rotation.z += (-tilt.x * 0.14 - tube.rotation.z) * Math.min(1, dt * 4);

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
          metal.color.copy(metalColor).lerp(goldColor, g);
          animateParticles(
            sparkles,
            elapsed / (TUBE_TIMING.golden + TUBE_TIMING.puff),
          );
        }
        const puffT = (elapsed - goldMs) / TUBE_TIMING.puff;
        if (puffT >= 0) {
          sealPivot.rotation.x =
            SEAL_HALF + (SEAL_OFF - SEAL_HALF) * ease(puffT);
          sealPivot.position.y = TOP + 0.02 + 1.5 * ease(puffT);
          aluminium.opacity = 1 - ease(puffT);
          animateParticles(puff, puffT);
        }
        const riseT = (elapsed - goldMs - TUBE_TIMING.puff) / TUBE_TIMING.rise;
        if (riseT >= 0) {
          cards.visible = true;
          cards.position.y = 0.4 + 3.4 * ease(riseT);
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
    setLabel(text, packColor) {
      drawLabel(labelCanvas, options, text, packColor);
      labelTexture.needsUpdate = true;
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
      const textures = new Set<Texture>([labelTexture, environment]);
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
