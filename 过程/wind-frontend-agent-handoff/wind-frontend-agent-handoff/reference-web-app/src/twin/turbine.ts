/**
 * Procedural micro wind turbine.
 *
 * Blades are lofted from a cambered NACA-style section with chord taper and
 * twist, blended into a round root; nacelle, spinner and tower are lathe
 * profiles. It is a representative model, not a dimensional replica.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Color,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RingGeometry,
  Shape,
  ShapeGeometry,
  TorusGeometry,
  Vector2,
  type Material,
} from 'three';

export const TOWER_HEIGHT = 2.4;
export const ROTOR_RADIUS = 0.82;
const HUB_RADIUS = 0.085;

export interface TurbineParts {
  root: Group;
  /** Yaw/pitch/roll pivot at the tower top; driven by the IMU attitude. */
  nacelle: Group;
  /** Spins about local +Z. */
  rotor: Group;
  ring: Mesh<RingGeometry, MeshBasicMaterial>;
  heading: Group;
  pickables: Mesh[];
}

export interface TurbineMaterials {
  paint: MeshPhysicalMaterial;
  composite: MeshPhysicalMaterial;
  steel: MeshStandardMaterial;
  rubber: MeshStandardMaterial;
  concrete: MeshStandardMaterial;
  all: Material[];
}

export function createMaterials(): TurbineMaterials {
  const paint = new MeshPhysicalMaterial({
    color: new Color('#d5d9dc'),
    roughness: 0.38,
    metalness: 0.08,
    clearcoat: 0.55,
    clearcoatRoughness: 0.28,
  });
  const composite = new MeshPhysicalMaterial({
    color: new Color('#ffffff'),
    vertexColors: true,
    roughness: 0.3,
    metalness: 0.0,
    clearcoat: 0.85,
    clearcoatRoughness: 0.16,
    side: DoubleSide,
  });
  const steel = new MeshStandardMaterial({ color: new Color('#5d656c'), roughness: 0.32, metalness: 0.9 });
  const rubber = new MeshStandardMaterial({ color: new Color('#22272b'), roughness: 0.7, metalness: 0.1 });
  const concrete = new MeshStandardMaterial({ color: new Color('#2b3034'), roughness: 0.96, metalness: 0 });
  return { paint, composite, steel, rubber, concrete, all: [paint, composite, steel, rubber, concrete] };
}

/* ───────────────────────── blade loft ───────────────────────── */

function airfoil(n: number, thickness: number, camber: number): Vector2[] {
  // closed loop, starting at trailing edge, upper surface to leading edge, back along lower
  const p = 0.4;
  const pts: Vector2[] = [];
  const half = n / 2;
  const xs: number[] = [];
  for (let i = 0; i <= half; i++) xs.push(0.5 * (1 - Math.cos((Math.PI * i) / half))); // 0..1 cosine spacing
  const surf = (x: number, upper: boolean) => {
    const yt =
      5 * thickness * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    const yc = x < p ? (camber / (p * p)) * (2 * p * x - x * x) : (camber / (1 - p) ** 2) * (1 - 2 * p + 2 * p * x - x * x);
    return new Vector2(x, yc + (upper ? yt : -yt));
  };
  for (let i = half; i >= 0; i--) pts.push(surf(xs[i], true)); // TE → LE (upper)
  for (let i = 1; i < half; i++) pts.push(surf(xs[i], false)); // LE → TE (lower)
  return pts;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function createBladeGeometry(): BufferGeometry {
  const sections = 44;
  const n = 32;
  const rootR = HUB_RADIUS * 0.75;
  const span = ROTOR_RADIUS - rootR;
  const positions: number[] = [];
  const colors: number[] = [];
  const white = new Color('#e9ebec');
  const mark = new Color('#b9553f'); // aviation tip marking, deliberately muted
  for (let j = 0; j <= sections; j++) {
    const s = j / sections;
    const r = rootR + s * span;
    const chord = 0.034 + 0.13 * Math.exp(-((s - 0.2) ** 2) / 0.09) * (1 - 0.55 * s);
    const twist = ((17 * (1 - s) ** 1.6 + 1.5) * Math.PI) / 180;
    const thick = 0.36 - 0.24 * smooth(0.1, 0.6, s);
    const blend = smooth(0.03, 0.17, s);
    const prof = airfoil(n, thick, 0.035 * blend);
    const circR = 0.024;
    const c = s > 0.9 ? mark : white;
    for (let i = 0; i < n; i++) {
      const pa = prof[i];
      // airfoil in chord coordinates, pitch axis at 30 % chord
      let x = (pa.x - 0.3) * chord;
      let z = pa.y * chord;
      // round root
      const ang = (i / n) * Math.PI * 2;
      const cx = Math.cos(ang) * circR;
      const cz = Math.sin(ang) * circR;
      x = cx + (x - cx) * blend;
      z = cz + (z - cz) * blend;
      // twist about the span (Y) axis
      const ct = Math.cos(twist);
      const st = Math.sin(twist);
      positions.push(x * ct - z * st, r, x * st + z * ct);
      colors.push(c.r, c.g, c.b);
    }
  }
  // tip cap vertex
  const tipIndex = positions.length / 3;
  positions.push(0, ROTOR_RADIUS + 0.004, 0);
  colors.push(mark.r, mark.g, mark.b);

  const idx: number[] = [];
  for (let j = 0; j < sections; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * n + i;
      const b = j * n + ((i + 1) % n);
      const c = (j + 1) * n + i;
      const d = (j + 1) * n + ((i + 1) % n);
      idx.push(a, c, b, b, c, d);
    }
  }
  const last = sections * n;
  for (let i = 0; i < n; i++) idx.push(last + i, tipIndex, last + ((i + 1) % n));

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ───────────────────────── lathe parts ───────────────────────── */

function lathe(profile: [number, number][], segments = 48): LatheGeometry {
  return new LatheGeometry(
    profile.map(([r, y]) => new Vector2(r, y)),
    segments
  );
}

export interface SharedGeometries {
  blade: BufferGeometry;
  spinner: LatheGeometry;
  nacelle: LatheGeometry;
  tower: LatheGeometry;
  flange: CylinderGeometry;
  yawBearing: CylinderGeometry;
  pad: CylinderGeometry;
  seam: TorusGeometry;
  mast: CylinderGeometry;
  vane: ShapeGeometry;
  ring: RingGeometry;
  heading: ShapeGeometry;
  all: BufferGeometry[];
}

export function createGeometries(): SharedGeometries {
  const blade = createBladeGeometry();
  // spinner: ogive along +Y, rotated onto +Z later
  const sp: [number, number][] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    sp.push([HUB_RADIUS * 1.12 * Math.sqrt(Math.max(0, 1 - t * t)) * (1 - 0.08 * t), t * 0.2]);
  }
  sp.unshift([0, 0]);
  const spinner = lathe(sp);
  spinner.rotateX(Math.PI / 2);

  // nacelle: rounded rear, slightly tapered body
  const np: [number, number][] = [[0, -0.62]];
  for (let i = 1; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    np.push([0.118 * Math.sin(a), -0.62 + 0.11 * (1 - Math.cos(a))]);
  }
  np.push([0.124, -0.32], [0.128, -0.08], [0.122, 0.0], [0.1, 0.02], [0, 0.02]);
  const nacelle = lathe(np);
  nacelle.rotateX(Math.PI / 2);
  nacelle.scale(1, 1.12, 1);

  const tower = lathe(
    [
      [0, 0],
      [0.078, 0],
      [0.074, TOWER_HEIGHT * 0.25],
      [0.062, TOWER_HEIGHT * 0.7],
      [0.05, TOWER_HEIGHT],
      [0, TOWER_HEIGHT],
    ],
    40
  );
  const flange = new CylinderGeometry(0.13, 0.13, 0.03, 40);
  const yawBearing = new CylinderGeometry(0.066, 0.066, 0.05, 36);
  const pad = new CylinderGeometry(0.42, 0.46, 0.08, 8);
  const seam = new TorusGeometry(0.127, 0.004, 8, 64);
  const mast = new CylinderGeometry(0.006, 0.006, 0.16, 8);
  const vs = new Shape();
  vs.moveTo(0, 0);
  vs.lineTo(-0.11, 0.0);
  vs.lineTo(-0.13, 0.05);
  vs.lineTo(-0.06, 0.03);
  vs.closePath();
  const vane = new ShapeGeometry(vs);
  vane.rotateY(Math.PI / 2);
  const ring = new RingGeometry(0.62, 0.635, 128);
  ring.rotateX(-Math.PI / 2);
  const hs = new Shape();
  hs.moveTo(0, 0.6);
  hs.lineTo(-0.035, 0.53);
  hs.lineTo(0.035, 0.53);
  hs.closePath();
  const heading = new ShapeGeometry(hs);
  heading.rotateX(Math.PI / 2); // tick points to local +Z, the rotor side
  return {
    blade,
    spinner,
    nacelle,
    tower,
    flange,
    yawBearing,
    pad,
    seam,
    mast,
    vane,
    ring,
    heading,
    all: [blade, spinner, nacelle, tower, flange, yawBearing, pad, seam, mast, vane, ring, heading],
  };
}

export function buildTurbine(geo: SharedGeometries, mat: TurbineMaterials): TurbineParts {
  const root = new Group();
  const pickables: Mesh[] = [];
  const add = (parent: Group, m: Mesh, cast = true) => {
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    pickables.push(m);
    return m;
  };

  const pad = add(root, new Mesh(geo.pad, mat.concrete), false);
  pad.position.y = 0.04;
  const flange = add(root, new Mesh(geo.flange, mat.steel));
  flange.position.y = 0.095;
  add(root, new Mesh(geo.tower, mat.paint)).position.y = 0.08;
  const yb = add(root, new Mesh(geo.yawBearing, mat.steel));
  yb.position.y = 0.08 + TOWER_HEIGHT + 0.02;

  const nacelle = new Group();
  nacelle.position.y = 0.08 + TOWER_HEIGHT + 0.12;
  root.add(nacelle);
  const body = add(nacelle, new Mesh(geo.nacelle, mat.paint));
  body.position.z = 0.16;
  const seam = add(nacelle, new Mesh(geo.seam, mat.rubber), false);
  seam.position.z = -0.12;
  seam.scale.set(1, 1.12, 1);
  const mast = add(nacelle, new Mesh(geo.mast, mat.steel));
  mast.position.set(0, 0.2, -0.3);
  const vane = add(nacelle, new Mesh(geo.vane, mat.rubber));
  vane.position.set(0, 0.27, -0.3);

  const rotor = new Group();
  rotor.position.z = 0.19;
  nacelle.add(rotor);
  add(rotor, new Mesh(geo.spinner, mat.paint));
  for (let k = 0; k < 3; k++) {
    const b = add(rotor, new Mesh(geo.blade, mat.composite));
    b.rotation.z = (k * Math.PI * 2) / 3;
    b.position.z = 0.05;
  }

  const ring = new Mesh(geo.ring, new MeshBasicMaterial({ color: '#5b656c', transparent: true, opacity: 0.55, depthWrite: false, side: DoubleSide }));
  ring.position.y = 0.002;
  ring.renderOrder = 1;
  root.add(ring);
  const heading = new Group();
  const tick = new Mesh(geo.heading, ring.material);
  tick.position.y = 0.003;
  heading.add(tick);
  root.add(heading);

  return { root, nacelle, rotor, ring, heading, pickables };
}
