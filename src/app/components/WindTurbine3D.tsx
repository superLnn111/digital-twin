import { useRef, Suspense, useEffect, useState, useMemo } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { OrbitControls, Edges } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import mapImg from "../../imports/dcc662850128d337acd0b8fca68e9825.png";

// ─── Theme Tokens ─────────────────────────────────────────────────────────────
const THEME = {
  wire:       "#06b6d4",   // Cyan-500  primary glow
  wireHi:     "#22d3ee",   // Cyan-400  accent / landmark
  wireDorm:   "#38bdf8",   // Sky-400   dorm towers
  wireGreen:  "#10b981",   // Emerald   trees
  wireTeal:   "#0d9488",   // Teal      secondary trees
  glass:      "#020617",   // near-black navy fill
  glassRoof:  "#061120",   // slightly lighter navy for roofs
  road:       "#040a14",   // darkest road fill
  accentRed:  "#ef4444",
  accentYellow:"#eab308",
  accentGreen: "#10b981",
  shaft:      "#f8fafc",
};

// ─── Campus Static Data  (1 unit ≈ 20 m, SYSU Zhuhai layout) ─────────────────
// Coordinate convention: X = West(−)→East(+), Z = North(−)→South(+)
// Campus center / scene origin ≈ center of campus
// Civil Engineering Building (土木工程学院) anchored at x=14, z=4

// 北区核心楼 (Library + surrounding academics)
const NORTH_BLDGS = [
  { x: -1,  z:-25, w:22, h:8,  d:14, hi:true  }, // 图书馆 (Library landmark)
  { x:-24,  z:-17, w:12, h:5,  d: 9, hi:false  }, // 文学院
  { x: 22,  z:-17, w:10, h:5,  d: 8, hi:false  }, // 理学院
  { x:-11,  z:-13, w: 9, h:4,  d: 7, hi:false  }, // 行政楼
  { x:  9,  z:-13, w: 9, h:4,  d: 7, hi:false  }, // 大教室 A
  { x:-22,  z: -5, w:10, h:3,  d:12, hi:false  }, // 学生活动中心
  { x:-12,  z:  2, w:10, h:4,  d: 8, hi:false  }, // 商学院
];

// 土木工程学院 (Civil Engineering, our focus)
const CE = { x:14, z:4, w:14, h:6, d:10 };

// 南区学术楼
const SOUTH_BLDGS = [
  { x:  2, z: 3, w:12, h:5, d: 8, hi:false }, // 工学院 A
  { x: 30, z: 4, w: 8, h:5, d: 8, hi:false }, // 机电工程学院
  { x: 14, z:18, w:10, h:4, d: 8, hi:false }, // 土木实验楼
  { x: 30, z:16, w: 8, h:3, d:10, hi:false }, // 综合实验楼
  { x: -3, z:17, w: 8, h:3, d: 7, hi:false }, // 数学院
  { x: 43, z: 4, w: 8, h:5, d: 7, hi:true  }, // 海洋科学楼 (coastal accent)
  { x: 43, z:16, w: 8, h:4, d: 7, hi:false }, // 环境工程楼
];

// 海滨楼 (eastern coastal buildings)
const COAST_BLDGS = [
  { x: 42, z:-24, w:10, h:4, d: 8, hi:false },
  { x: 40, z:-14, w: 8, h:5, d: 7, hi:true  },
];

// 宿舍区 (10 dorm towers, south zone)
const DORMS = [
  { x: 4, z:25 }, { x:12, z:25 }, { x:20, z:25 },
  { x:28, z:25 }, { x:36, z:25 },
  { x: 4, z:31 }, { x:12, z:31 }, { x:20, z:31 },
  { x:28, z:31 }, { x:36, z:31 },
];

// 运动场旁体育馆
const SPORTS_HALL = { x: -26, z: 10, w: 10, h: 3, d: 14 };

// 校区外住宅区 (residential, west of campus)
const HOUSES = [
  { x:-40, z:-20, w:3,   h:2.5, d:3   }, { x:-35, z:-20, w:3.5, h:2,   d:3   },
  { x:-30, z:-20, w:3,   h:2.5, d:3.5 }, { x:-40, z:-14, w:3,   h:2,   d:3   },
  { x:-35, z:-14, w:3,   h:2.5, d:3   }, { x:-30, z:-14, w:3.5, h:2,   d:3   },
  { x:-40, z: -8, w:3,   h:2,   d:3.5 }, { x:-35, z: -8, w:3,   h:2.5, d:3   },
  { x:-30, z: -8, w:3,   h:2,   d:3   }, { x:-40, z: -2, w:3.5, h:2,   d:3   },
  { x:-35, z: -2, w:3,   h:2.5, d:3   }, { x:-30, z: -2, w:3,   h:2,   d:3.5 },
  { x:-40, z:  4, w:3,   h:2,   d:3   }, { x:-35, z:  4, w:3.5, h:2.5, d:3   },
  { x:-30, z:  4, w:3,   h:2,   d:3   }, { x:-40, z: 10, w:3,   h:2.5, d:3   },
  { x:-35, z: 10, w:3,   h:2,   d:3   }, { x:-30, z: 10, w:3,   h:2.5, d:3.5 },
];

// 道路网络 (Road network — ns:true = N-S road, ns:false = E-W road)
const ROADS: { x:number; z:number; len:number; w:number; ns:boolean }[] = [
  // ── 东西向 E-W ──
  { x:  2, z: 38, len:115, w:5.5, ns:false }, // 外部主干道 (external highway)
  { x:  5, z: 27.5,len:85, w:4,   ns:false }, // 宿舍环路
  { x:  5, z: 14, len:80,  w:3.5, ns:false }, // 校内主路 (campus main E-W road)
  { x: -2, z: -1, len:70,  w:3,   ns:false }, // 中区横路
  { x:  0, z:-14, len:62,  w:3,   ns:false }, // 北区学术路
  { x: -3, z:-29, len:52,  w:3,   ns:false }, // 图书馆前路
  // ── 住宅区横路 residential roads ──
  { x:-35, z:-22, len:24,  w:2,   ns:false },
  { x:-35, z:-10, len:24,  w:2,   ns:false },
  { x:-35, z:  6, len:24,  w:2,   ns:false },
  // ── 南北向 N-S ──
  { x:-33, z: -5, len:70,  w:3,   ns:true  }, // 西侧主路 (west campus boundary road)
  { x:  0, z:  2, len:75,  w:3,   ns:true  }, // 中央纵轴
  { x: 28, z:  8, len:55,  w:2.5, ns:true  }, // 东学术路
  { x: 45, z: 12, len:50,  w:2.5, ns:true  }, // 东侧路 (coastal)
  { x:-18, z:  4, len:35,  w:2,   ns:true  }, // 运动区路
  { x:-37, z:  -5,len:42,  w:2,   ns:true  }, // 住宅区纵路
  { x: 14, z: 11, len:20,  w:2,   ns:true  }, // CE楼前草坪路
];

// 树木 Trees
type TreeDef = { x:number; z:number; teal:boolean };
const TREES: TreeDef[] = [
  // 校内主路两侧 (flanking campus main road, z=14)
  ...[-22,-14,-6,2,10,18,26,34].map(x => ({ x, z:17,  teal:false })),
  ...[-22,-14,-6,2,10,18,26,34].map(x => ({ x, z:11,  teal:false })),
  // 北区学术路两侧 (flanking z=-14)
  ...[-20,-12,-4,4,14,22].map(x => ({ x, z:-11, teal:false })),
  ...[-20,-12,-4,4,14,22].map(x => ({ x, z:-17, teal:false })),
  // 中央纵轴两侧 (flanking x=0 N-S spine)
  ...[-28,-22,-16,-10,-4,2,8].map(z => ({ x:-3, z, teal:false })),
  ...[-28,-22,-16,-10,-4,2,8].map(z => ({ x: 3, z, teal:false })),
  // 逸仙湖边 (around the lake)
  ...[6,10,-4,-8].map(x => ({ x, z:0,  teal:true })),
  ...[6,10,-4,-8].map(x => ({ x, z:-18,teal:true })),
  // 住宅区边界
  ...[-40,-35,-30].map(x => ({ x, z: 12, teal:true })),
  ...[-40,-35,-30].map(x => ({ x, z:-22, teal:true })),
  // 校区东侧海边
  ...[47,50].flatMap(x => [-12,-6,0,6,12].map(z => ({ x, z, teal:false }))),
  // CE楼草坪边
  { x:8, z:8, teal:false }, { x:22, z:8, teal:false },
  { x:8, z:12,teal:false }, { x:22, z:12,teal:false },
];

// ─── Reusable: Cyber Building ─────────────────────────────────────────────────
function CyberBuilding({
  x, z, w, h, d, edgeColor = THEME.wire,
}: { x:number; z:number; w:number; h:number; d:number; edgeColor?:string }) {
  return (
    <mesh position={[x, h / 2, z]}>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial
        color={THEME.glass} transparent opacity={0.13}
        roughness={0.1} metalness={0.95} side={THREE.DoubleSide}
      />
      <Edges scale={1} threshold={15} color={edgeColor} />
    </mesh>
  );
}

// ─── Reusable: Residential House (box + 4-sided pyramid roof) ─────────────────
function CyberHouse({ x, z, w=3, h=2, d=3 }: { x:number; z:number; w?:number; h?:number; d?:number }) {
  const roofH = Math.min(w, d) * 0.5;
  const roofR = Math.max(w, d) * 0.5 * 0.72;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={THEME.glass} transparent opacity={0.15} roughness={0.1} metalness={0.9} side={THREE.DoubleSide} />
        <Edges scale={1} threshold={15} color={THEME.wire} />
      </mesh>
      {/* Window glow */}
      <mesh position={[0, h * 0.5, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.4, h * 0.3]} />
        <meshStandardMaterial color={THEME.wireHi} transparent opacity={0.4} emissive={THEME.wireHi} emissiveIntensity={0.9} />
      </mesh>
      {/* Pyramid roof */}
      <mesh position={[0, h + roofH / 2, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[roofR, roofH, 4]} />
        <meshStandardMaterial color={THEME.glassRoof} transparent opacity={0.2} roughness={0.1} metalness={0.9} />
        <Edges scale={1} threshold={1} color={THEME.wireHi} />
      </mesh>
    </group>
  );
}

// ─── Reusable: Glowing Road Segment ──────────────────────────────────────────
function CyberRoad({ x, z, len, w, ns=false }: { x:number; z:number; len:number; w:number; ns?:boolean }) {
  return (
    <group position={[x, 0.03, z]} rotation={[0, ns ? Math.PI / 2 : 0, 0]}>
      {/* Asphalt */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[len, w]} />
        <meshStandardMaterial color={THEME.road} transparent opacity={0.9} roughness={0.96} />
      </mesh>
      {/* Centre line glow */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[len, 0.12]} />
        <meshStandardMaterial color={THEME.wire} transparent opacity={0.55} emissive={THEME.wire} emissiveIntensity={1.1} />
      </mesh>
      {/* Left edge stripe */}
      <mesh position={[0, 0.01, w / 2 - 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[len, 0.08]} />
        <meshStandardMaterial color={THEME.wireHi} transparent opacity={0.4} emissive={THEME.wireHi} emissiveIntensity={0.55} />
      </mesh>
      {/* Right edge stripe */}
      <mesh position={[0, 0.01, -(w / 2 - 0.1)]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[len, 0.08]} />
        <meshStandardMaterial color={THEME.wireHi} transparent opacity={0.4} emissive={THEME.wireHi} emissiveIntensity={0.55} />
      </mesh>
    </group>
  );
}

// ─── Reusable: Cyber Tree ─────────────────────────────────────────────────────
function CyberTree({ x, z, teal=false }: { x:number; z:number; teal?:boolean }) {
  const glow = teal ? THEME.wireTeal : THEME.wireGreen;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.09, 0.13, 1.4, 6]} />
        <meshStandardMaterial color={THEME.glass} transparent opacity={0.4} />
        <Edges scale={1} color={glow} />
      </mesh>
      <mesh position={[0, 2.1, 0]}>
        <coneGeometry args={[0.85, 1.8, 6]} />
        <meshStandardMaterial color="#011a10" transparent opacity={0.22} emissive={glow} emissiveIntensity={0.08} />
        <Edges scale={1} color={glow} />
      </mesh>
      <mesh position={[0, 3.1, 0]}>
        <coneGeometry args={[0.5, 1.3, 6]} />
        <meshStandardMaterial color="#011a10" transparent opacity={0.18} emissive={glow} emissiveIntensity={0.12} />
        <Edges scale={1} color={glow} />
      </mesh>
    </group>
  );
}

// ─── 逸仙湖 Yixian Lake ───────────────────────────────────────────────────────
// Elongated N-S oval, center x=3 z=-10
function CampusLake() {
  const glowRef = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (glowRef.current) {
      glowRef.current.intensity = 1.2 + Math.sin(clock.elapsedTime * 0.8) * 0.4;
    }
  });
  return (
    <group position={[3, 0.06, -10]}>
      {/* Water body (oval: scaleX=0.65, scaleZ=1 → 13 wide × 20 long) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[0.65, 1, 1]}>
        <circleGeometry args={[10, 48]} />
        <meshStandardMaterial color="#020c1e" transparent opacity={0.92} emissive="#0c4a6e" emissiveIntensity={0.18} roughness={0.05} metalness={0.15} />
      </mesh>
      {/* Glowing border ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[0.65, 1, 1]}>
        <ringGeometry args={[10, 10.7, 48]} />
        <meshStandardMaterial color={THEME.wire} transparent opacity={0.7} emissive={THEME.wire} emissiveIntensity={1.0} />
      </mesh>
      {/* Inner highlight shimmer */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[0.3, 0.4, 1]}>
        <ringGeometry args={[3, 4, 32]} />
        <meshStandardMaterial color={THEME.wireHi} transparent opacity={0.2} emissive={THEME.wireHi} emissiveIntensity={0.5} />
      </mesh>
      <pointLight ref={glowRef} position={[0, 2, 0]} intensity={1.5} color="#0ea5e9" distance={28} />
    </group>
  );
}

// ─── 运动场 Sports Track ───────────────────────────────────────────────────────
function SportsTrack({ x, z }: { x:number; z:number }) {
  return (
    <group position={[x, 0.04, z]}>
      {/* Inner field */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[1.4, 1, 1]}>
        <circleGeometry args={[5.5, 40]} />
        <meshStandardMaterial color="#052e16" transparent opacity={0.45} emissive="#166534" emissiveIntensity={0.06} />
      </mesh>
      {/* Red track surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[1.4, 1, 1]}>
        <ringGeometry args={[5.5, 8, 40]} />
        <meshStandardMaterial color="#7f1d1d" transparent opacity={0.55} emissive="#dc2626" emissiveIntensity={0.1} />
      </mesh>
      {/* Track outer glow edge */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[1.4, 1, 1]}>
        <ringGeometry args={[8, 8.5, 40]} />
        <meshStandardMaterial color="#ef4444" transparent opacity={0.5} emissive="#ef4444" emissiveIntensity={0.45} />
      </mesh>
      {/* Inner field lines */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.4, 1, 1]}>
        <ringGeometry args={[3.5, 3.7, 40]} />
        <meshStandardMaterial color={THEME.wireGreen} transparent opacity={0.3} emissive={THEME.wireGreen} emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}

// ─── 土木楼信标 Civil Engineering Beacon ─────────────────────────────────────
// Animated scanning beam above the CE building to mark it as focus
function CEBeacon({ x, z }: { x:number; z:number }) {
  const beamRef  = useRef<THREE.Mesh>(null);
  const ringRef  = useRef<THREE.Group>(null);
  const pulseRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (beamRef.current) {
      (beamRef.current.material as THREE.MeshStandardMaterial).opacity =
        0.14 + Math.sin(t * 1.8) * 0.08;
    }
    if (ringRef.current) ringRef.current.rotation.y = t * 1.2;
    if (pulseRef.current) {
      const s = 1 + Math.sin(t * 2.2) * 0.15;
      pulseRef.current.scale.set(s, 1, s);
    }
  });

  return (
    <group position={[x, 0, z]}>
      {/* Vertical cone beam */}
      <mesh ref={beamRef} position={[0, 13, 0]}>
        <cylinderGeometry args={[0.4, 3.5, 26, 8, 1, true]} />
        <meshStandardMaterial color={THEME.wireHi} transparent opacity={0.18} side={THREE.DoubleSide} emissive={THEME.wireHi} emissiveIntensity={0.55} />
      </mesh>
      {/* Rotating scan ring */}
      <group ref={ringRef} position={[0, 7, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[3.2, 3.7, 32]} />
          <meshStandardMaterial color={THEME.wireHi} transparent opacity={0.55} emissive={THEME.wireHi} emissiveIntensity={0.9} />
        </mesh>
      </group>
      {/* Pulsing ground marker */}
      <mesh ref={pulseRef} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[5.5, 6.2, 40]} />
        <meshStandardMaterial color={THEME.wireHi} transparent opacity={0.45} emissive={THEME.wireHi} emissiveIntensity={0.7} />
      </mesh>
      {/* Inner circle */}
      <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 1, 20]} />
        <meshStandardMaterial color={THEME.wireHi} transparent opacity={0.6} emissive={THEME.wireHi} emissiveIntensity={1} />
      </mesh>
      <pointLight position={[0, 7, 0]} intensity={3.5} color={THEME.wireHi} distance={35} />
    </group>
  );
}

// ─── Street Lamp ──────────────────────────────────────────────────────────────
function StreetLamp({ x, z }: { x:number; z:number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.05, 0.08, 3, 6]} />
        <meshStandardMaterial color={THEME.glass} transparent opacity={0.35} />
        <Edges scale={1} color={THEME.wire} />
      </mesh>
      <mesh position={[0, 3.2, 0]}>
        <sphereGeometry args={[0.18, 8, 8]} />
        <meshStandardMaterial color={THEME.wireHi} transparent opacity={0.65} emissive={THEME.wireHi} emissiveIntensity={2.2} />
      </mesh>
      <pointLight position={[0, 3.2, 0]} intensity={0.5} color={THEME.wireHi} distance={9} />
    </group>
  );
}

// ─── Data Particle Streams ────────────────────────────────────────────────────
function DataStreams() {
  const ref = useRef<THREE.Points>(null);
  const [positions, speeds] = useMemo(() => {
    const COUNT = 700;
    const pos = new Float32Array(COUNT * 3);
    const spd = new Float32Array(COUNT);
    let s = 0xdeadbeef;
    const rng = () => {
      s = Math.imul(s ^ (s >>> 15), s | 1);
      s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
      return ((s ^ (s >>> 14)) >>> 0) / 0x100000000;
    };
    for (let i = 0; i < COUNT; i++) {
      pos[i*3]     = (rng() - 0.5) * 120;
      pos[i*3 + 1] = rng() * 38;
      pos[i*3 + 2] = (rng() - 0.5) * 90;
      spd[i]       = 0.04 + rng() * 0.28;
    }
    return [pos, spd];
  }, []);

  useFrame((_s, dt) => {
    if (!ref.current) return;
    const arr = ref.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < 700; i++) {
      arr[i*3+1] += speeds[i] * dt * 14;
      if (arr[i*3+1] > 38) arr[i*3+1] = 0;
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={700} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial color="#00f0ff" size={0.22} transparent opacity={0.42} blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  );
}

// ─── Campus Sea / Coastline (north-east) ─────────────────────────────────────
function CoastalSea() {
  return (
    <group>
      {/* North sea surface */}
      <mesh position={[10, 0.04, -42]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[130, 22]} />
        <meshStandardMaterial color="#020c1e" transparent opacity={0.88} emissive="#0c4a6e" emissiveIntensity={0.14} />
      </mesh>
      {/* Coastline glow line */}
      <mesh position={[10, 0.06, -31.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[130, 0.6]} />
        <meshStandardMaterial color={THEME.wire} transparent opacity={0.55} emissive={THEME.wire} emissiveIntensity={0.85} />
      </mesh>
      {/* East sea (right side) */}
      <mesh position={[60, 0.04, -5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[22, 80]} />
        <meshStandardMaterial color="#020c1e" transparent opacity={0.85} emissive="#0c4a6e" emissiveIntensity={0.12} />
      </mesh>
      <mesh position={[49.5, 0.06, -5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.6, 80]} />
        <meshStandardMaterial color={THEME.wire} transparent opacity={0.5} emissive={THEME.wire} emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}

// ─── Campus Gate / Main Entrance ──────────────────────────────────────────────
function CampusGate({ x, z }: { x:number; z:number }) {
  return (
    <group position={[x, 0, z]}>
      {[-7, 7].map((ox, i) => (
        <mesh key={i} position={[ox, 2.5, 0]}>
          <boxGeometry args={[0.6, 5, 0.6]} />
          <meshStandardMaterial color={THEME.glass} transparent opacity={0.3} metalness={0.9} />
          <Edges scale={1} color={THEME.wireHi} />
        </mesh>
      ))}
      <mesh position={[0, 5.3, 0]}>
        <boxGeometry args={[15, 0.4, 0.6]} />
        <meshStandardMaterial color={THEME.glassRoof} transparent opacity={0.35} emissive={THEME.wireHi} emissiveIntensity={0.6} />
        <Edges scale={1} color={THEME.wireHi} />
      </mesh>
      <pointLight position={[0, 5.5, 0]} intensity={1.5} color={THEME.wireHi} distance={18} />
    </group>
  );
}




// ─── Campus Decoration Layer (shared between GLB & procedural) ────────────────
function CampusDecoration() {
  return (
    <>
      {/* Roads */}
      {ROADS.map((r, i) => <CyberRoad key={`r${i}`} x={r.x} z={r.z} len={r.len} w={r.w} ns={r.ns} />)}

      {/* Intersection markers */}
      {[
        {x: 0,  z: 14},{x: 0, z:-14},{x:28,  z:14},
        {x:28, z:-14},{x: 0, z: 27.5},{x:28, z:27.5},
      ].map((pt, i) => (
        <mesh key={`int${i}`} position={[pt.x, 0.05, pt.z]} rotation={[-Math.PI/2, 0, 0]}>
          <circleGeometry args={[2.4, 16]} />
          <meshStandardMaterial color={THEME.wire} transparent opacity={0.12} emissive={THEME.wire} emissiveIntensity={0.4} />
        </mesh>
      ))}

      {/* Houses */}
      {HOUSES.map((h, i) => <CyberHouse key={`h${i}`} x={h.x} z={h.z} w={h.w} h={h.h} d={h.d} />)}

      {/* Trees */}
      {TREES.map((t, i) => <CyberTree key={`t${i}`} x={t.x} z={t.z} teal={t.teal} />)}

      {/* Street lamps along main campus road */}
      {[-20,-12,-4,4,12,20,28,36].map(x => (
        <StreetLamp key={`lamp${x}`} x={x} z={16.5} />
      ))}

      {/* 逸仙湖 */}
      <CampusLake />

      {/* 运动场 */}
      <SportsTrack x={-16} z={13} />
      {/* Sports hall beside track */}
      <CyberBuilding x={SPORTS_HALL.x} z={SPORTS_HALL.z} w={SPORTS_HALL.w} h={SPORTS_HALL.h} d={SPORTS_HALL.d} />

      {/* Coast */}
      <CoastalSea />

      {/* Campus walls */}
      {[
        {x:  0, z:-32, w:130, d:0.4, h:0.6},
        {x:  0, z: 40, w:130, d:0.4, h:0.6},
        {x:-55, z:  4, w:0.4, d:80,  h:0.6},
        {x: 55, z:  4, w:0.4, d:80,  h:0.6},
      ].map((wall, i) => (
        <mesh key={`wall${i}`} position={[wall.x, wall.h/2, wall.z]}>
          <boxGeometry args={[wall.w, wall.h, wall.d]} />
          <meshStandardMaterial color={THEME.glass} transparent opacity={0.35} metalness={0.9} />
          <Edges scale={1} threshold={15} color={THEME.wire} />
        </mesh>
      ))}

      {/* South gate (正门) */}
      <CampusGate x={0} z={38.5} />

      {/* North gate (北门, near coast) */}
      <CampusGate x={-8} z={-31.5} />


    </>
  );
}

// ─── GLB Loader (applies cyber material to campus.glb) ───────────────────────
function BlenderCampusModel() {
  const [model, setModel] = useState<THREE.Group | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const loader = new GLTFLoader();
    loader.load(
      "/campus.glb",
      (gltf) => {
        gltf.scene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.material = new THREE.MeshStandardMaterial({
              color: THEME.glass, transparent: true,
              opacity: 0.13, roughness: 0.1, metalness: 0.95, side: THREE.DoubleSide,
            });
            mesh.add(new THREE.LineSegments(
              new THREE.EdgesGeometry(mesh.geometry, 15),
              new THREE.LineBasicMaterial({ color: THEME.wire, transparent: true, opacity: 0.8 })
            ));
          }
        });
        setModel(gltf.scene);
      },
      undefined,
      (err) => { console.warn("campus.glb not found, using procedural fallback.", err); setLoadFailed(true); }
    );
  }, []);

  if (loadFailed) return null;
  if (!model) return null;

  return (
    <group position={[0, 0, 0]}>
      <primitive object={model} />
    </group>
  );
}

// ─── Full Procedural Campus (SYSU Zhuhai layout) ──────────────────────────────
function CampusEnvironment() {
  const texture = useLoader(THREE.TextureLoader, mapImg);

  return (
    <group position={[0, -2.7, 0]}>
      {/* Ground — satellite texture blended with dark navy */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 4]}>
        <planeGeometry args={[130, 90]} />
        <meshStandardMaterial map={texture} color="#071428" transparent opacity={0.52} roughness={0.95} />
      </mesh>

      {/* Holographic grid overlay */}
      <gridHelper args={[130, 26, THEME.wire, THEME.wire]} position={[0, 0.02, 4]} />

      {/* Roads + Houses + Trees + Lake + Track + Coast */}
      <CampusDecoration />

      {/* ── 北区学术楼 North Academic Zone ── */}
      {NORTH_BLDGS.map((b, i) => (
        <CyberBuilding key={`nb${i}`} x={b.x} z={b.z} w={b.w} h={b.h} d={b.d} edgeColor={b.hi ? THEME.wireHi : THEME.wire} />
      ))}

      {/* ── 土木工程学院 Civil Engineering (highlighted) ── */}
      <CyberBuilding x={CE.x} z={CE.z} w={CE.w} h={CE.h} d={CE.d} edgeColor={THEME.wireHi} />
      <CEBeacon x={CE.x} z={CE.z} />

      {/* ── 南区学术楼 South Academic Zone ── */}
      {SOUTH_BLDGS.map((b, i) => (
        <CyberBuilding key={`sb${i}`} x={b.x} z={b.z} w={b.w} h={b.h} d={b.d} edgeColor={b.hi ? THEME.wireHi : THEME.wire} />
      ))}

      {/* ── 海滨楼 Coastal Buildings ── */}
      {COAST_BLDGS.map((b, i) => (
        <CyberBuilding key={`cb${i}`} x={b.x} z={b.z} w={b.w} h={b.h} d={b.d} edgeColor={b.hi ? THEME.wireHi : THEME.wire} />
      ))}

      {/* ── 宿舍楼群 Dormitory Towers ── */}
      {DORMS.map((d, i) => (
        <CyberBuilding key={`dorm${i}`} x={d.x} z={d.z} w={5} h={12} d={8} edgeColor={THEME.wireDorm} />
      ))}
    </group>
  );
}

// ─── Wind Turbine Model (exported for other views) ────────────────────────────
export function TurbineModel({
  status = "normal", scale = 1,
}: { status?: "normal"|"warning"|"danger"; scale?: number }) {
  const rotorRef = useRef<THREE.Group>(null);
  const shaftRef = useRef<THREE.Group>(null);

  const edgeColor =
    status === "danger" ? THEME.accentRed
    : status === "warning" ? THEME.accentYellow
    : THEME.wire;
  const glassColor =
    status === "danger" ? "#991b1b"
    : status === "warning" ? "#854d0e"
    : "#0891b2";

  useFrame((_s, dt) => {
    if (rotorRef.current) rotorRef.current.rotation.z -= dt * 1.5;
    if (shaftRef.current) shaftRef.current.rotation.z -= dt * 1.5;
  });

  return (
    <group position={[0, -1.8 * scale, 0]} scale={0.8 * scale}>
      {/* Tower */}
      <mesh position={[0, 2, 0]}>
        <cylinderGeometry args={[0.15, 0.3, 4, 16]} />
        <meshStandardMaterial color={glassColor} transparent opacity={0.1} roughness={0.1} metalness={0.8} side={THREE.DoubleSide} />
        <Edges scale={1} threshold={15} color={edgeColor} />
      </mesh>
      <group position={[0, 4, 0]}>
        {/* Nacelle */}
        <mesh position={[0, 0, -0.4]}>
          <boxGeometry args={[0.5, 0.6, 1.6]} />
          <meshStandardMaterial color={glassColor} transparent opacity={0.15} roughness={0.1} metalness={0.9} side={THREE.DoubleSide} />
          <Edges scale={1} threshold={15} color={edgeColor} />
        </mesh>
        {/* Main Shaft */}
        <group ref={shaftRef} position={[0, 0, 0.1]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 1.2, 12]} />
            <meshStandardMaterial color={THEME.shaft} emissive={edgeColor} emissiveIntensity={0.8} />
          </mesh>
        </group>
        {/* Gearbox */}
        <group position={[0, 0, -0.3]}>
          <mesh>
            <boxGeometry args={[0.3, 0.35, 0.4]} />
            <meshStandardMaterial color={THEME.accentRed} transparent opacity={0.3} emissive={THEME.accentRed} emissiveIntensity={0.5} />
            <Edges scale={1} threshold={15} color="#fca5a5" />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.12, 0.12, 0.32, 12]} />
            <meshStandardMaterial color={THEME.accentRed} emissive={THEME.accentRed} emissiveIntensity={0.8} />
          </mesh>
        </group>
        {/* Generator */}
        <group position={[0, 0, -0.8]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 0.5, 16]} />
            <meshStandardMaterial color={THEME.accentYellow} transparent opacity={0.2} emissive={THEME.accentYellow} emissiveIntensity={0.2} />
            <Edges scale={1} threshold={15} color="#fef08a" />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.15, 0.15, 0.52, 16]} />
            <meshStandardMaterial color={THEME.accentYellow} emissive={THEME.accentYellow} emissiveIntensity={0.6} />
          </mesh>
        </group>
        {/* Rotor Hub + 3 Blades */}
        <group ref={rotorRef} position={[0, 0, 0.5]}>
          <mesh>
            <sphereGeometry args={[0.18, 16, 16]} />
            <meshStandardMaterial color={glassColor} transparent opacity={0.2} roughness={0.2} metalness={0.8} />
            <Edges scale={1} threshold={15} color={edgeColor} />
          </mesh>
          <mesh position={[0, 0, 0.1]}>
            <cylinderGeometry args={[0.02, 0.18, 0.3, 16]} rotation={[Math.PI / 2, 0, 0]} />
            <meshStandardMaterial color={glassColor} transparent opacity={0.2} roughness={0.2} metalness={0.8} />
            <Edges scale={1} threshold={15} color={edgeColor} />
          </mesh>
          {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((angle, i) => (
            <group key={i} rotation={[0, 0, angle]}>
              <mesh position={[0, 0.2, 0]}>
                <cylinderGeometry args={[0.06, 0.06, 0.15, 12]} />
                <meshStandardMaterial color={THEME.accentGreen} emissive={THEME.accentGreen} emissiveIntensity={0.6} transparent opacity={0.8} />
                <Edges color="#6ee7b7" />
              </mesh>
              <mesh position={[0, 1.4, 0]}>
                <boxGeometry args={[0.15, 2.4, 0.04]} />
                <meshStandardMaterial color={glassColor} transparent opacity={0.1} roughness={0.4} metalness={0.8} />
                <Edges scale={1} threshold={15} color={edgeColor} />
              </mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}

// ─── XYZ 坐标轴 (红X, 绿Y, 蓝Z) ────────────────────────────────────────
function CoordinateAxes() {
  const axisLength = 3;
  const arrowHead = 0.3;

  return (
    <group position={[0, 0, 0]}>
      {/* X轴 - 红色 */}
      <mesh>
        <cylinderGeometry args={[0.03, 0.03, axisLength, 8]} />
        <meshBasicMaterial color="#ff4444" />
      </mesh>
      <mesh position={[axisLength / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[arrowHead, 0.6, 8]} />
        <meshBasicMaterial color="#ff4444" />
      </mesh>
      {/* Y轴 - 绿色 */}
      <mesh rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, axisLength, 8]} />
        <meshBasicMaterial color="#44ff44" />
      </mesh>
      <mesh position={[0, axisLength / 2, 0]}>
        <coneGeometry args={[arrowHead, 0.6, 8]} />
        <meshBasicMaterial color="#44ff44" />
      </mesh>
      {/* Z轴 - 蓝色 */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, axisLength, 8]} />
        <meshBasicMaterial color="#4488ff" />
      </mesh>
      <mesh position={[0, 0, axisLength / 2]}>
        <coneGeometry args={[arrowHead, 0.6, 8]} />
        <meshBasicMaterial color="#4488ff" />
      </mesh>
    </group>
  );
}

// ─── Main Canvas ──────────────────────────────────────────────────────────────
export function WindTurbine3D() {
  // ═══════════════════════════════════════════════════════════════
  // 调整以下参数来对齐 GLB 地形和风机位置（保存后页面自动刷新）
  // ═══════════════════════════════════════════════════════════════
  const glbPos: [number, number, number] = [0, -40, 0];       // GLB 地形 X, Y(上下), Z
  const turbinePos: [number, number, number] = [-11, 3, 5];  // 风机在场景中的 X, Y(高度), Z
  const turbineScale = 0.8;                                   // 风机缩放

  return (
    <div className="h-full w-full bg-[#020617]">
      <Canvas
        camera={{ position: [38, 32, 62], fov: 40 }}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={["#020617"]} />

        {/* Cinematic lighting */}
        <ambientLight intensity={0.12} />
        <directionalLight position={[0, 60, 0]} intensity={0.9} color="#00f0ff" />
        <pointLight position={[15, 28, 10]} intensity={2.8} color="#06b6d4" />
        <pointLight position={[-25, 22, -20]} intensity={1.8} color="#3b82f6" />
        <pointLight position={[45, 18, -10]} intensity={1.4} color="#0ea5e9" />

        {/* GLB 校园地形 */}
        <Suspense fallback={null}>
          <group position={glbPos}>
            <BlenderCampusModel />
          </group>
        </Suspense>

        {/* 数据粒子流 */}
        <DataStreams />

        {/* 4台风机 2x2矩阵 — 原风机 + X+方向 + Z+方向 + X+Z+方向 */}
        {[
          [turbinePos[0], turbinePos[1], turbinePos[2]],
          [turbinePos[0] + 6, turbinePos[1], turbinePos[2]],
          [turbinePos[0], turbinePos[1], turbinePos[2] + 6],
          [turbinePos[0] + 6, turbinePos[1], turbinePos[2] + 6],
        ].map((pos, i) => (
          <group key={i} position={pos as [number, number, number]}>
            <TurbineModel scale={turbineScale} />
          </group>
        ))}

        {/* XYZ小型坐标轴 — 红X 绿Y 蓝Z */}
        <CoordinateAxes />

        <OrbitControls
          enablePan={true}
          enableZoom={true}
          minDistance={12}
          maxDistance={130}
          maxPolarAngle={Math.PI / 2 - 0.04}
          autoRotate={true}
          autoRotateSpeed={0.22}
          target={[5, 0, 3]}
        />
      </Canvas>
    </div>
  );
}