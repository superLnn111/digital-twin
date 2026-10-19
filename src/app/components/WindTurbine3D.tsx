// ========== 1. 核心依赖导入 ==========

// useRef：存放 Three.js 3D 对象的引用（如 mesh、group）
// Suspense：等待异步资源加载完成的占位器
// useEffect：挂载后执行操作（加载GLB模型等）
// useState：响应式状态
// useMemo：缓存计算结果（粒子初始位置等），避免每帧重新计算
import { useRef, Suspense, useEffect, useState, useMemo } from "react";

// Canvas：Three.js 的渲染画布容器（@react-three/fiber 的核心）
// useFrame：每帧执行的动画循环钩子（60fps）
// useLoader：加载外部资源（纹理贴图等）
import { Canvas, useFrame, useLoader } from "@react-three/fiber";

// OrbitControls：鼠标拖拽旋转/缩放/平移 3D 场景
// Edges：给3D几何体描边（线框效果，赛博朋克风格的核心）
import { OrbitControls, Edges } from "@react-three/drei";

// THREE：Three.js 核心库，包含所有几何体、材质、颜色、数学工具
import * as THREE from "three";

// GLTFLoader：加载 .glb 格式的 3D 模型文件
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// 中大珠海校区卫星地图贴图（贴在 3D 场景的地面上）
import mapImg from "../../imports/dcc662850128d337acd0b8fca68e9825.png";

// ========== 2. 主题色配置（赛博朋克暗色风格） ==========
// 所有颜色集中管理，方便统一修改
const THEME = {
  wire:       "#06b6d4",   // 青色 = 主要发光线框色
  wireHi:     "#22d3ee",   // 亮青 = 重点建筑/地标高亮
  wireDorm:   "#38bdf8",   // 天蓝 = 宿舍楼颜色
  wireGreen:  "#10b981",   // 翠绿 = 树木颜色
  wireTeal:   "#0d9488",   // 墨绿 = 湖边树木
  glass:      "#020617",   // 深海军蓝 = 建筑填充色
  glassRoof:  "#061120",   // 稍亮深蓝 = 屋顶色
  road:       "#040a14",   // 最深黑蓝 = 道路色
  accentRed:  "#ef4444",   // 红色 = 故障/警告
  accentYellow:"#eab308",  // 黄色 = 预警
  accentGreen: "#10b981",  // 绿色 = 正常/叶片
  shaft:      "#f8fafc",   // 白色 = 主轴
};

// ========== 3. 中大珠海校区静态数据 ==========
// 坐标约定：X = 西(-)→东(+), Z = 北(-)→南(+), 1单位≈20米
// 每个建筑用 { x, z, w(宽), h(高), d(深), hi(是否重点高亮) } 描述

// 北区核心楼群（图书馆 + 文学院 + 理学院 + 行政楼 + 大教室 + 学生会 + 商学院）
const NORTH_BLDGS = [
  { x: -1,  z:-25, w:22, h:8,  d:14, hi:true  }, // 图书馆（地标，用亮色）
  { x:-24,  z:-17, w:12, h:5,  d: 9, hi:false }, // 文学院
  { x: 22,  z:-17, w:10, h:5,  d: 8, hi:false }, // 理学院
  { x:-11,  z:-13, w: 9, h:4,  d: 7, hi:false }, // 行政楼
  { x:  9,  z:-13, w: 9, h:4,  d: 7, hi:false }, // 大教室 A
  { x:-22,  z: -5, w:10, h:3,  d:12, hi:false }, // 学生活动中心
  { x:-12,  z:  2, w:10, h:4,  d: 8, hi:false }, // 商学院
];

// 土木工程学院（研究重点目标，单独高亮 + 旋转信标）
const CE = { x:14, z:4, w:14, h:6, d:10 };

// 南区学术楼群（工学院AB + 机电工程 + 土木实验 + 综合实验 + 数学院 + 海洋科学 + 环境工程）
const SOUTH_BLDGS = [
  { x:  2, z: 3, w:12, h:5, d: 8, hi:false }, // 工学院 A
  { x: 30, z: 4, w: 8, h:5, d: 8, hi:false }, // 机电工程学院
  { x: 14, z:18, w:10, h:4, d: 8, hi:false }, // 土木实验楼
  { x: 30, z:16, w: 8, h:3, d:10, hi:false }, // 综合实验楼
  { x: -3, z:17, w: 8, h:3, d: 7, hi:false }, // 数学院
  { x: 43, z: 4, w: 8, h:5, d: 7, hi:true  }, // 海洋科学楼（海边的地标）
  { x: 43, z:16, w: 8, h:4, d: 7, hi:false }, // 环境工程楼
];

// 海滨楼群
const COAST_BLDGS = [
  { x: 42, z:-24, w:10, h:4, d: 8, hi:false },
  { x: 40, z:-14, w: 8, h:5, d: 7, hi:true  },
];

// 宿舍区：10栋塔楼，两排分布在南侧（z=25 和 z=31）
// flatMap 把嵌套数组拍平
const DORMS = [
  { x: 4, z:25 }, { x:12, z:25 }, { x:20, z:25 },
  { x:28, z:25 }, { x:36, z:25 },
  { x: 4, z:31 }, { x:12, z:31 }, { x:20, z:31 },
  { x:28, z:31 }, { x:36, z:31 },
];

// 运动场旁边体育馆
const SPORTS_HALL = { x: -26, z: 10, w: 10, h: 3, d: 14 };

// 校区外住宅区（西侧，18栋居民楼，4座金字塔屋顶的小房子）
const HOUSES = [
  { x:-40, z:-20, w:3, h:2.5, d:3 }, { x:-35, z:-20, w:3.5, h:2, d:3 },
  { x:-30, z:-20, w:3, h:2.5, d:3.5 }, { x:-40, z:-14, w:3, h:2, d:3 },
  { x:-35, z:-14, w:3, h:2.5, d:3 }, { x:-30, z:-14, w:3.5, h:2, d:3 },
  { x:-40, z: -8, w:3, h:2, d:3.5 }, { x:-35, z: -8, w:3, h:2.5, d:3 },
  { x:-30, z: -8, w:3, h:2, d:3 }, { x:-40, z: -2, w:3.5, h:2, d:3 },
  { x:-35, z: -2, w:3, h:2.5, d:3 }, { x:-30, z: -2, w:3, h:2, d:3.5 },
  { x:-40, z:  4, w:3, h:2, d:3 }, { x:-35, z:  4, w:3.5, h:2.5, d:3 },
  { x:-30, z:  4, w:3, h:2, d:3 }, { x:-40, z: 10, w:3, h:2.5, d:3 },
  { x:-35, z: 10, w:3, h:2, d:3 }, { x:-30, z: 10, w:3, h:2.5, d:3.5 },
];

// 道路网络（东西向 + 南北向）
// len=路长, w=路宽, ns=true=南北向道路, ns=false=东西向道路
const ROADS: { x:number; z:number; len:number; w:number; ns:boolean }[] = [
  { x:  2, z: 38, len:115, w:5.5, ns:false }, // 外部主干道
  { x:  5, z: 27.5,len:85, w:4,   ns:false }, // 宿舍环路
  { x:  5, z: 14, len:80,  w:3.5, ns:false }, // 校内主路
  { x: -2, z: -1, len:70,  w:3,   ns:false }, // 中区横路
  { x:  0, z:-14, len:62,  w:3,   ns:false }, // 北区学术路
  { x: -3, z:-29, len:52,  w:3,   ns:false }, // 图书馆前路
  { x:-35, z:-22, len:24,  w:2,   ns:false }, // 住宅区横路1
  { x:-35, z:-10, len:24,  w:2,   ns:false }, // 住宅区横路2
  { x:-35, z:  6, len:24,  w:2,   ns:false }, // 住宅区横路3
  { x:-33, z: -5, len:70,  w:3,   ns:true  }, // 西侧主路（校区西边界）
  { x:  0, z:  2, len:75,  w:3,   ns:true  }, // 中央纵轴（主轴线）
  { x: 28, z:  8, len:55,  w:2.5, ns:true  }, // 东学术路
  { x: 45, z: 12, len:50,  w:2.5, ns:true  }, // 东侧路（海边）
  { x:-18, z:  4, len:35,  w:2,   ns:true  }, // 运动区路
  { x:-37, z: -5, len:42,  w:2,   ns:true  }, // 住宅区纵路
  { x: 14, z: 11, len:20,  w:2,   ns:true  }, // CE楼前草坪路
];

// 树木集合（teal=true 用墨绿色=湖边树, teal=false 用翠绿色=路边树）
type TreeDef = { x:number; z:number; teal:boolean };
const TREES: TreeDef[] = [
  // ...展开运算符：把数组的元素逐个展开，相当于手动列出每一项
  ...[-22,-14,-6,2,10,18,26,34].map(x => ({ x, z:17,  teal:false })),  // 主路北侧
  ...[-22,-14,-6,2,10,18,26,34].map(x => ({ x, z:11,  teal:false })), // 主路南侧
  ...[-20,-12,-4,4,14,22].map(x => ({ x, z:-11, teal:false })),        // 北区路北侧
  ...[-20,-12,-4,4,14,22].map(x => ({ x, z:-17, teal:false })),        // 北区路南侧
  ...[-28,-22,-16,-10,-4,2,8].map(z => ({ x:-3, z, teal:false })),     // 中央轴左侧
  ...[-28,-22,-16,-10,-4,2,8].map(z => ({ x: 3, z, teal:false })),     // 中央轴右侧
  ...[6,10,-4,-8].map(x => ({ x, z:0,  teal:true })),                   // 湖东侧
  ...[6,10,-4,-8].map(x => ({ x, z:-18,teal:true })),                   // 湖西侧
  ...[-40,-35,-30].map(x => ({ x, z: 12, teal:true })),                 // 住宅区南
  ...[-40,-35,-30].map(x => ({ x, z:-22, teal:true })),                 // 住宅区北
  ...[47,50].flatMap(x => [-12,-6,0,6,12].map(z => ({ x, z, teal:false }))), // 东侧海边
  { x:8, z:8, teal:false }, { x:22, z:8, teal:false },                  // CE楼草坪边
  { x:8, z:12,teal:false }, { x:22, z:12,teal:false },
];

// ==================== 接下来是 18 个可复用子组件 ====================

// ── CyberBuilding：赛博建筑（线框方盒子 + 半透明玻璃填充 + 发光边缘） ──
function CyberBuilding({
  x, z, w, h, d,           // 坐标(x,z)、宽、高、深
  edgeColor = THEME.wire,  // 边框颜色（默认青色）
}: { x:number; z:number; w:number; h:number; d:number; edgeColor?:string }) {
  return (
    <mesh position={[x, h / 2, z]}>  {/* mesh = 3D网格 = 几何体+材质 */}
      {/* boxGeometry：立方体几何形状，args=[宽, 高, 深] */}
      <boxGeometry args={[w, h, d]} />
      {/* meshStandardMaterial：PBR物理渲染材质 */}
      {/* transparent + opacity：半透明 */}
      {/* metalness + roughness：金属质感和粗糙度 */}
      {/* side: DoubleSide：正反两面都渲染（线框内也能看） */}
      <meshStandardMaterial
        color={THEME.glass} transparent opacity={0.13}
        roughness={0.1} metalness={0.95} side={THREE.DoubleSide}
      />
      {/* Edges：给几何体的棱边描线，形成赛博线框效果 */}
      <Edges scale={1} threshold={15} color={edgeColor} />
    </mesh>
  );
}

// ── CyberHouse：住宅建筑（方盒子 + 金字塔四棱锥屋顶 + 发光窗户） ──
function CyberHouse({ x, z, w=3, h=2, d=3 }: { x:number; z:number; w?:number; h?:number; d?:number }) {
  const roofH = Math.min(w, d) * 0.5;  // 屋顶高度 = 较短边的一半
  const roofR = Math.max(w, d) * 0.5 * 0.72; // 锥体半径
  return (
    <group position={[x, 0, z]}>  {/* group = 容器，里面的子元素共享相对坐标 */}
      {/* 主体方盒子 */}
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={THEME.glass} transparent opacity={0.15} roughness={0.1} metalness={0.9} side={THREE.DoubleSide} />
        <Edges scale={1} threshold={15} color={THEME.wire} />
      </mesh>
      {/* 发光窗户：一个半透明发光平面贴在南面 */}
      <mesh position={[0, h * 0.5, d / 2 + 0.01]}>  {/* d/2+0.01 = 刚好贴在表面外面 */}
        <planeGeometry args={[w * 0.4, h * 0.3]} />  {/* 平面几何，占正面的40%宽、30%高 */}
        <meshStandardMaterial color={THEME.wireHi} transparent opacity={0.4} emissive={THEME.wireHi} emissiveIntensity={0.9} />
      </mesh>
      {/* 四棱锥屋顶：coneGeometry 4边 → 金字塔形状 */}
      <mesh position={[0, h + roofH / 2, 0]} rotation={[0, Math.PI / 4, 0]}>  {/* 旋转45度使棱对齐box的对角线 */}
        <coneGeometry args={[roofR, roofH, 4]} />  {/* 4边锥体 */}
        <meshStandardMaterial color={THEME.glassRoof} transparent opacity={0.2} roughness={0.1} metalness={0.9} />
        <Edges scale={1} threshold={1} color={THEME.wireHi} />
      </mesh>
    </group>
  );
}

// ── CyberRoad：发光道路（深色路面 + 中间虚线 + 两侧边线） ──
function CyberRoad({ x, z, len, w, ns=false }: { x:number; z:number; len:number; w:number; ns?:boolean }) {
  return (
    <group position={[x, 0.03, z]} rotation={[0, ns ? Math.PI / 2 : 0, 0]}>
      {/* 旋转：南北向道路绕Y轴转90度（π/2），东西向不转 */}
      {/* 路面：深色矩形平面 (planeGeometry 默认面朝Z，旋转-π/2后朝上) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[len, w]} />
        <meshStandardMaterial color={THEME.road} transparent opacity={0.9} roughness={0.96} />
      </mesh>
      {/* 中心虚线：一条细的发光青色线 */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[len, 0.12]} />
        <meshStandardMaterial color={THEME.wire} transparent opacity={0.55} emissive={THEME.wire} emissiveIntensity={1.1} />
      </mesh>
      {/* 左边缘线 */}
      <mesh position={[0, 0.01, w / 2 - 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[len, 0.08]} />
        <meshStandardMaterial color={THEME.wireHi} transparent opacity={0.4} emissive={THEME.wireHi} emissiveIntensity={0.55} />
      </mesh>
      {/* 右边缘线 */}
      <mesh position={[0, 0.01, -(w / 2 - 0.1)]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[len, 0.08]} />
        <meshStandardMaterial color={THEME.wireHi} transparent opacity={0.4} emissive={THEME.wireHi} emissiveIntensity={0.55} />
      </mesh>
    </group>
  );
}

// ── CyberTree：赛博树木（圆柱树干 + 两层锥形树冠） ──
function CyberTree({ x, z, teal=false }: { x:number; z:number; teal?:boolean }) {
  const glow = teal ? THEME.wireTeal : THEME.wireGreen; // 按位置选颜色
  return (
    <group position={[x, 0, z]}>
      {/* 树干：六边形圆柱 */}
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.09, 0.13, 1.4, 6]} /> {/* 上细下粗的六棱柱 */}
        <meshStandardMaterial color={THEME.glass} transparent opacity={0.4} />
        <Edges scale={1} color={glow} />
      </mesh>
      {/* 下层树冠：大圆锥 */}
      <mesh position={[0, 2.1, 0]}>
        <coneGeometry args={[0.85, 1.8, 6]} /> {/* 半径0.85，高1.8，六边形 */}
        <meshStandardMaterial color="#011a10" transparent opacity={0.22} emissive={glow} emissiveIntensity={0.08} />
        <Edges scale={1} color={glow} />
      </mesh>
      {/* 上层树冠：小圆锥（叠在上面，更亮） */}
      <mesh position={[0, 3.1, 0]}>
        <coneGeometry args={[0.5, 1.3, 6]} />
        <meshStandardMaterial color="#011a10" transparent opacity={0.18} emissive={glow} emissiveIntensity={0.12} />
        <Edges scale={1} color={glow} />
      </mesh>
    </group>
  );
}

// ── CampusLake：逸仙湖（椭圆形水面 + 发光边框 + 呼吸灯） ──
function CampusLake() {
  const glowRef = useRef<THREE.PointLight>(null); // 点光源引用
  // useFrame：每帧执行的回调，clock.elapsedTime = 场景运行总秒数
  useFrame(({ clock }) => {
    if (glowRef.current) {
      // 光强 1.2~1.6 之间正弦波动 → 湖面光线"呼吸"效果
      glowRef.current.intensity = 1.2 + Math.sin(clock.elapsedTime * 0.8) * 0.4;
    }
  });
  return (
    <group position={[3, 0.06, -10]}>
      {/* 水面：椭圆形（圆形缩放X=0.65 → 宽13 × 深20的椭圆池） */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[0.65, 1, 1]}>
        <circleGeometry args={[10, 48]} /> {/* 半径10，48段（圆滑） */}
        <meshStandardMaterial color="#020c1e" transparent opacity={0.92} emissive="#0c4a6e" emissiveIntensity={0.18} roughness={0.05} metalness={0.15} />
      </mesh>
      {/* 发光边框环 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[0.65, 1, 1]}>
        <ringGeometry args={[10, 10.7, 48]} /> {/* 环形几何：内径10外径10.7 */}
        <meshStandardMaterial color={THEME.wire} transparent opacity={0.7} emissive={THEME.wire} emissiveIntensity={1.0} />
      </mesh>
      {/* 湖面高光斑（内部小环） */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[0.3, 0.4, 1]}>
        <ringGeometry args={[3, 4, 32]} />
        <meshStandardMaterial color={THEME.wireHi} transparent opacity={0.2} emissive={THEME.wireHi} emissiveIntensity={0.5} />
      </mesh>
      {/* 点光源：给湖面打光 */}
      <pointLight ref={glowRef} position={[0, 2, 0]} intensity={1.5} color="#0ea5e9" distance={28} />
    </group>
  );
}

// ── SportsTrack：运动场（椭圆形绿色内场 + 红色跑道环 + 发光边界） ──
function SportsTrack({ x, z }: { x:number; z:number }) {
  return (
    <group position={[x, 0.04, z]}>
      {/* 内场：深绿色椭圆草地 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[1.4, 1, 1]}>
        <circleGeometry args={[5.5, 40]} />
        <meshStandardMaterial color="#052e16" transparent opacity={0.45} emissive="#166534" emissiveIntensity={0.06} />
      </mesh>
      {/* 跑道：红色环形面 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[1.4, 1, 1]}>
        <ringGeometry args={[5.5, 8, 40]} /> {/* 内径5.5外径8 = 宽2.5的跑道 */}
        <meshStandardMaterial color="#7f1d1d" transparent opacity={0.55} emissive="#dc2626" emissiveIntensity={0.1} />
      </mesh>
      {/* 跑道外侧发光边 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[1.4, 1, 1]}>
        <ringGeometry args={[8, 8.5, 40]} />
        <meshStandardMaterial color="#ef4444" transparent opacity={0.5} emissive="#ef4444" emissiveIntensity={0.45} />
      </mesh>
      {/* 场内分道线 */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.4, 1, 1]}>
        <ringGeometry args={[3.5, 3.7, 40]} />
        <meshStandardMaterial color={THEME.wireGreen} transparent opacity={0.3} emissive={THEME.wireGreen} emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}

// ── CEBeacon：土木工程学院信标（旋转扫描环 + 脉冲地面标记 + 垂直光柱） ──
function CEBeacon({ x, z }: { x:number; z:number }) {
  const beamRef  = useRef<THREE.Mesh>(null);  // 垂直光柱
  const ringRef  = useRef<THREE.Group>(null);  // 旋转环容器
  const pulseRef = useRef<THREE.Mesh>(null);   // 地面脉冲圈

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    // 光柱透明度正弦波动（0.14±0.08）
    if (beamRef.current) {
      (beamRef.current.material as THREE.MeshStandardMaterial).opacity =
        0.14 + Math.sin(t * 1.8) * 0.08;
    }
    // 扫描环绕Y轴旋转（1.2弧度/秒 ≈ 69度/秒）
    if (ringRef.current) ringRef.current.rotation.y = t * 1.2;
    // 地面标记缩放波动（1±0.15）
    if (pulseRef.current) {
      const s = 1 + Math.sin(t * 2.2) * 0.15;
      pulseRef.current.scale.set(s, 1, s);
    }
  });

  return (
    <group position={[x, 0, z]}>
      {/* 垂直扫描光柱：开口圆柱体（顶部开口tube效果） */}
      <mesh ref={beamRef} position={[0, 13, 0]}>
        <cylinderGeometry args={[0.4, 3.5, 26, 8, 1, true]} /> {/* 最后一个true=开口 */}
        <meshStandardMaterial color={THEME.wireHi} transparent opacity={0.18} side={THREE.DoubleSide} emissive={THEME.wireHi} emissiveIntensity={0.55} />
      </mesh>
      {/* 旋转扫描环（Y轴自转） */}
      <group ref={ringRef} position={[0, 7, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[3.2, 3.7, 32]} />
          <meshStandardMaterial color={THEME.wireHi} transparent opacity={0.55} emissive={THEME.wireHi} emissiveIntensity={0.9} />
        </mesh>
      </group>
      {/* 地面脉冲标记圈 */}
      <mesh ref={pulseRef} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[5.5, 6.2, 40]} />
        <meshStandardMaterial color={THEME.wireHi} transparent opacity={0.45} emissive={THEME.wireHi} emissiveIntensity={0.7} />
      </mesh>
      {/* 内圈核心标记 */}
      <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 1, 20]} />
        <meshStandardMaterial color={THEME.wireHi} transparent opacity={0.6} emissive={THEME.wireHi} emissiveIntensity={1} />
      </mesh>
      {/* 点光源照亮周围 */}
      <pointLight position={[0, 7, 0]} intensity={3.5} color={THEME.wireHi} distance={35} />
    </group>
  );
}

// ── StreetLamp：路灯（细圆柱 + 顶部发光球 + 点光源） ──
function StreetLamp({ x, z }: { x:number; z:number }) {
  return (
    <group position={[x, 0, z]}>
      {/* 灯柱 */}
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.05, 0.08, 3, 6]} />
        <meshStandardMaterial color={THEME.glass} transparent opacity={0.35} />
        <Edges scale={1} color={THEME.wire} />
      </mesh>
      {/* 灯球（发光体） */}
      <mesh position={[0, 3.2, 0]}>
        <sphereGeometry args={[0.18, 8, 8]} /> {/* 半径0.18的小球 */}
        <meshStandardMaterial color={THEME.wireHi} transparent opacity={0.65} emissive={THEME.wireHi} emissiveIntensity={2.2} />
      </mesh>
      {/* 真实点光源（照亮周围物体） */}
      <pointLight position={[0, 3.2, 0]} intensity={0.5} color={THEME.wireHi} distance={9} />
    </group>
  );
}

// ── DataStreams：数据粒子流（700个上升粒子 + 多色 + 不断增强） ──
function DataStreams() {
  const ref = useRef<THREE.Points>(null); // Points = 粒子系统

  // useMemo：只在组件首次渲染时计算一次初始位置和速度，之后复用
  const [positions, speeds] = useMemo(() => {
    const COUNT = 700;
    const pos = new Float32Array(COUNT * 3); // 每个粒子需要 x,y,z 三个值
    const spd = new Float32Array(COUNT);     // 每个粒子一个速度
    // 简单的伪随机数生成器（可预测的随机，每次刷新位置一致）
    let s = 0xdeadbeef;
    const rng = () => {
      s = Math.imul(s ^ (s >>> 15), s | 1);
      s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
      return ((s ^ (s >>> 14)) >>> 0) / 0x100000000;
    };
    for (let i = 0; i < COUNT; i++) {
      pos[i*3]     = (rng() - 0.5) * 120; // X：-60~+60
      pos[i*3 + 1] = rng() * 38;          // Y：0~38（从地面到空中）
      pos[i*3 + 2] = (rng() - 0.5) * 90;  // Z：-45~+45
      spd[i]       = 0.04 + rng() * 0.28; // 速度：0.04~0.32
    }
    return [pos, spd];
  }, []); // [] = 只计算一次（55行与原始一致保持）

  // 每帧更新粒子位置（上升 + 到底后重置回0）
  useFrame((_s, dt) => {
    if (!ref.current) return;
    const arr = ref.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < 700; i++) {
      arr[i*3+1] += speeds[i] * dt * 14; // Y轴上升 = 速度 × 帧间隔 × 速率倍增
      if (arr[i*3+1] > 38) arr[i*3+1] = 0; // 超过最高点后重置到底部
    }
    // needsUpdate = true 告诉Three.js"顶点位置变了，请重新上传到GPU"
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>  {/* Three.js 粒子系统渲染器 */}
      <bufferGeometry>
        {/* bufferAttribute：把预计算的顶点坐标数组绑定到"position"属性 */}
        <bufferAttribute attach="attributes-position" count={700} array={positions} itemSize={3} />
      </bufferGeometry>
      {/* pointsMaterial：粒子材质 */}
      {/* AdditiveBlending：叠加混合（亮的粒子叠加到背景上，产生光晕效果） */}
      {/* depthWrite:false：不写入深度缓冲（粒子之间不互相遮挡） */}
      <pointsMaterial color="#00f0ff" size={0.22} transparent opacity={0.42} blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  );
}

// ── CoastalSea：海岸线 + 海面（北侧和东侧两片蓝色海面 + 发光海岸线） ──
function CoastalSea() {
  return (
    <group>
      {/* 北侧海面 */}
      <mesh position={[10, 0.04, -42]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[130, 22]} />
        <meshStandardMaterial color="#020c1e" transparent opacity={0.88} emissive="#0c4a6e" emissiveIntensity={0.14} />
      </mesh>
      {/* 北侧海岸发光线 */}
      <mesh position={[10, 0.06, -31.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[130, 0.6]} />
        <meshStandardMaterial color={THEME.wire} transparent opacity={0.55} emissive={THEME.wire} emissiveIntensity={0.85} />
      </mesh>
      {/* 东侧海面 */}
      <mesh position={[60, 0.04, -5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[22, 80]} />
        <meshStandardMaterial color="#020c1e" transparent opacity={0.85} emissive="#0c4a6e" emissiveIntensity={0.12} />
      </mesh>
      {/* 东侧海岸发光线 */}
      <mesh position={[49.5, 0.06, -5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.6, 80]} />
        <meshStandardMaterial color={THEME.wire} transparent opacity={0.5} emissive={THEME.wire} emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}

// ── CampusGate：校门（两侧立柱 + 横梁 + 发光点光源） ──
function CampusGate({ x, z }: { x:number; z:number }) {
  return (
    <group position={[x, 0, z]}>
      {/* 左右各一根立柱 */}
      {[-7, 7].map((ox, i) => (
        <mesh key={i} position={[ox, 2.5, 0]}>
          <boxGeometry args={[0.6, 5, 0.6]} />
          <meshStandardMaterial color={THEME.glass} transparent opacity={0.3} metalness={0.9} />
          <Edges scale={1} color={THEME.wireHi} />
        </mesh>
      ))}
      {/* 顶部横梁 */}
      <mesh position={[0, 5.3, 0]}>
        <boxGeometry args={[15, 0.4, 0.6]} />
        <meshStandardMaterial color={THEME.glassRoof} transparent opacity={0.35} emissive={THEME.wireHi} emissiveIntensity={0.6} />
        <Edges scale={1} color={THEME.wireHi} />
      </mesh>
      {/* 校门顶部照明 */}
      <pointLight position={[0, 5.5, 0]} intensity={1.5} color={THEME.wireHi} distance={18} />
    </group>
  );
}

// ── CampusDecoration：校园装饰层（汇集所有小型装饰元素） ──
// 这个组件把所有道路、房子、树木、路灯、湖、运动场、海岸、围墙、校门一次性渲染出来
// 它是"程序化场景"和"GLB场景"共用的装饰层
function CampusDecoration() {
  return (
    <>
      {/* 道路：遍历 ROADS 数组，渲染每条发光道路 */}
      {ROADS.map((r, i) => <CyberRoad key={`r${i}`} x={r.x} z={r.z} len={r.len} w={r.w} ns={r.ns} />)}

      {/* 交叉口标记：道路交叉处放大片圆形光晕 */}
      {[
        {x: 0,  z: 14},{x: 0, z:-14},{x:28,  z:14},
        {x:28, z:-14},{x: 0, z: 27.5},{x:28, z:27.5},
      ].map((pt, i) => (
        <mesh key={`int${i}`} position={[pt.x, 0.05, pt.z]} rotation={[-Math.PI/2, 0, 0]}>
          <circleGeometry args={[2.4, 16]} />
          <meshStandardMaterial color={THEME.wire} transparent opacity={0.12} emissive={THEME.wire} emissiveIntensity={0.4} />
        </mesh>
      ))}

      {/* 住宅区：遍历 HOUSES 数组 */}
      {HOUSES.map((h, i) => <CyberHouse key={`h${i}`} x={h.x} z={h.z} w={h.w} h={h.h} d={h.d} />)}

      {/* 树木：遍历 TREES 数组 */}
      {TREES.map((t, i) => <CyberTree key={`t${i}`} x={t.x} z={t.z} teal={t.teal} />)}

      {/* 路灯：沿校内主路两侧排列 */}
      {[-20,-12,-4,4,12,20,28,36].map(x => (
        <StreetLamp key={`lamp${x}`} x={x} z={16.5} />
      ))}

      {/* 逸仙湖 */}
      <CampusLake />
      {/* 运动场 */}
      <SportsTrack x={-16} z={13} />
      {/* 运动场旁体育馆 */}
      <CyberBuilding x={SPORTS_HALL.x} z={SPORTS_HALL.z} w={SPORTS_HALL.w} h={SPORTS_HALL.h} d={SPORTS_HALL.d} />
      {/* 海岸 */}
      <CoastalSea />

      {/* 校园围墙（四面矮墙 + 发光边） */}
      {[
        {x:  0, z:-32, w:130, d:0.4, h:0.6}, // 北墙
        {x:  0, z: 40, w:130, d:0.4, h:0.6}, // 南墙
        {x:-55, z:  4, w:0.4, d:80,  h:0.6}, // 西墙
        {x: 55, z:  4, w:0.4, d:80,  h:0.6}, // 东墙
      ].map((wall, i) => (
        <mesh key={`wall${i}`} position={[wall.x, wall.h/2, wall.z]}>
          <boxGeometry args={[wall.w, wall.h, wall.d]} />
          <meshStandardMaterial color={THEME.glass} transparent opacity={0.35} metalness={0.9} />
          <Edges scale={1} threshold={15} color={THEME.wire} />
        </mesh>
      ))}

      {/* 南门（正门）+ 北门 */}
      <CampusGate x={0} z={38.5} />
      <CampusGate x={-8} z={-31.5} />
    </>
  );
}

// ── BlenderCampusModel：加载外部 GLB 模型（Blender 导出的地形） ──
function BlenderCampusModel() {
  const [model, setModel] = useState<THREE.Group | null>(null);   // 加载成功后的模型数据
  const [loadFailed, setLoadFailed] = useState(false);            // 是否加载失败

  useEffect(() => {
    const loader = new GLTFLoader();
    // 尝试从 public 目录加载 /campus.glb 文件
    loader.load(
      "/campus.glb",      // GLB 文件路径（放在项目的 public 目录下）
      (gltf) => {         // 加载成功回调
        // traverse：遍历 GLB 场景树的所有子节点
        gltf.scene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) { // 只处理 Mesh 节点
            const mesh = child as THREE.Mesh;
            // 用自定义材质替换 GLB 中的原始材质（统一风格）
            mesh.material = new THREE.MeshStandardMaterial({
              color: "#e8e8e8",
              roughness: 0.65,
              metalness: 0.05,
              side: THREE.DoubleSide,
            });
          }
        });
        setModel(gltf.scene); // 存入状态，触发渲染
      },
      undefined,           // 加载进度回调（不需要）
      (err) => {           // 加载错误回调
        console.warn("campus.glb not found.", err);
        setLoadFailed(true); // 标记加载失败 → 触发 fallback
      }
    );
  }, []); // [] = 只加载一次

  // loadFailed=true → 返回 null（不渲染任何东西，由父组件的程序化场景接管）
  if (loadFailed) return null;
  // model 还没加载完 → 返回 null（等待加载）
  if (!model) return null;
  // 加载成功 → 用 <primitive object={model}/> 把 Three.js 对象插入 React 场景
  return (
    <group position={[0, 0, 0]}>
      <primitive object={model} />
    </group>
  );
}

// ── CampusEnvironment：完整程序化校园（卫星地图底 + 网格覆盖 + 装饰 + 所有建筑） ──
function CampusEnvironment() {
  // useLoader：异步加载卫星地图贴图
  const texture = useLoader(THREE.TextureLoader, mapImg);

  return (
    <group position={[0, -2.7, 0]}> {/* Y=-2.7 使场景微微下沉 */}
      {/* 地面 = 卫星图贴图 + 深蓝色混合 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 4]}>
        <planeGeometry args={[130, 90]} /> {/* 130×90 的巨大地面平面 */}
        <meshStandardMaterial map={texture} color="#071428" transparent opacity={0.52} roughness={0.95} />
      </mesh>

      {/* 全息网格覆盖（gridHelper = 等间距的 X+Z 线网格） */}
      <gridHelper args={[130, 26, THEME.wire, THEME.wire]} position={[0, 0.02, 4]} />

      {/* 装饰层（道路、树木、湖、海岸...） */}
      <CampusDecoration />

      {/* 遍历所有建筑群数组，逐一渲染 */}
      {NORTH_BLDGS.map((b, i) => (
        <CyberBuilding key={`nb${i}`} x={b.x} z={b.z} w={b.w} h={b.h} d={b.d} edgeColor={b.hi ? THEME.wireHi : THEME.wire} />
      ))}
      {/* 土木工程学院：重点高亮 + 旋转信标 */}
      <CyberBuilding x={CE.x} z={CE.z} w={CE.w} h={CE.h} d={CE.d} edgeColor={THEME.wireHi} />
      <CEBeacon x={CE.x} z={CE.z} />
      {SOUTH_BLDGS.map((b, i) => (
        <CyberBuilding key={`sb${i}`} x={b.x} z={b.z} w={b.w} h={b.h} d={b.d} edgeColor={b.hi ? THEME.wireHi : THEME.wire} />
      ))}
      {COAST_BLDGS.map((b, i) => (
        <CyberBuilding key={`cb${i}`} x={b.x} z={b.z} w={b.w} h={b.h} d={b.d} edgeColor={b.hi ? THEME.wireHi : THEME.wire} />
      ))}
      {/* 宿舍楼：10栋高塔（12单元高，窄宽5，天蓝色边框） */}
      {DORMS.map((d, i) => (
        <CyberBuilding key={`dorm${i}`} x={d.x} z={d.z} w={5} h={12} d={8} edgeColor={THEME.wireDorm} />
      ))}
    </group>
  );
}

// ── BladeDamageMarker：叶片故障标记（脉冲红球 + 扩散光环 + 照亮周围的红点光源） ──
function BladeDamageMarker({ bladeAngle, defectType }: { bladeAngle: number; defectType: string }) {
  const pulseRef = useRef<THREE.Mesh>(null);  // 红色脉冲球
  const ringRef = useRef<THREE.Mesh>(null);   // 扩散光环

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    // 红球缩放波动（1.0~1.6 之间跳动 → 脉冲效果）
    const s = 1 + Math.sin(t * 3) * 0.3;
    if (pulseRef.current) pulseRef.current.scale.setScalar(s);
    // 光环缩放 + 透明度波动（放大→消失→重置 → 雷达扫描效果）
    if (ringRef.current) {
      const rs = 1 + Math.sin(t * 2.5) * 0.5;
      ringRef.current.scale.setScalar(rs);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.5 - Math.sin(t * 2.5) * 0.3;
    }
  });

  return (
    // rotation 根据 bladeAngle 旋转整个标记组，让标记出现在对应叶片位置
    <group rotation={[0, 0, bladeAngle]}>
      {/* 核心脉冲红球 */}
      <mesh ref={pulseRef} position={[0, 1.2, 0]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshBasicMaterial color="#ff3333" transparent opacity={0.9} />
      </mesh>
      {/* 扩散光环 */}
      <mesh ref={ringRef} position={[0, 1.2, 0]}>
        <ringGeometry args={[0.18, 0.25, 32]} />
        <meshBasicMaterial color="#ff4444" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      {/* 红色点光源：照亮周围叶片 */}
      <pointLight position={[0, 1.2, 0]} intensity={2} color="#ff3333" distance={4} />
    </group>
  );
}

// ── TurbineModel：风机 3D 模型（塔筒 + 机舱 + 主轴 + 齿轮箱 + 发电机 + 3个旋转叶片） ──
export function TurbineModel({
  status = "normal",  // 运行状态："normal"=青色, "warning"=黄色, "danger"=红色
  scale = 1,           // 缩放系数
  defect,              // 故障信息：{ bladeIndex: 哪个叶片(0/1/2), type: 故障类型 }
}: { status?: "normal"|"warning"|"danger"; scale?: number; defect?: { bladeIndex: number; type: string } | null }) {
  const rotorRef = useRef<THREE.Group>(null);  // 转子组（轮毂+叶片）
  const shaftRef = useRef<THREE.Group>(null);  // 主轴组

  // 根据状态选择颜色
  const edgeColor =
    status === "danger" ? THEME.accentRed
    : status === "warning" ? THEME.accentYellow
    : THEME.wire;
  const glassColor =
    status === "danger" ? "#991b1b"
    : status === "warning" ? "#854d0e"
    : "#0891b2";

  // 每帧旋转转子（模拟风机运转）
  useFrame((_s, dt) => {
    if (rotorRef.current) rotorRef.current.rotation.z -= dt * 1.5; // 每秒1.5弧度 ≈ 86度/秒
    if (shaftRef.current) shaftRef.current.rotation.z -= dt * 1.5; // 主轴同步旋转
  });

  return (
    <group position={[0, -1.8 * scale, 0]} scale={0.8 * scale}>
      {/* —— 塔筒：上细下粗的圆柱体 —— */}
      <mesh position={[0, 2, 0]}>
        <cylinderGeometry args={[0.15, 0.3, 4, 16]} />
        <meshStandardMaterial color={glassColor} transparent opacity={0.1} roughness={0.1} metalness={0.8} side={THREE.DoubleSide} />
        <Edges scale={1} threshold={15} color={edgeColor} />
      </mesh>

      {/* —— 塔顶组件（机舱+主轴+齿轮箱+发电机+旋转叶片） —— */}
      <group position={[0, 4, 0]}>
        {/* 机舱：长方形盒子 */}
        <mesh position={[0, 0, -0.4]}>
          <boxGeometry args={[0.5, 0.6, 1.6]} />
          <meshStandardMaterial color={glassColor} transparent opacity={0.15} roughness={0.1} metalness={0.9} side={THREE.DoubleSide} />
          <Edges scale={1} threshold={15} color={edgeColor} />
        </mesh>

        {/* 主轴：细长发光圆柱（连接机舱和轮毂） */}
        <group ref={shaftRef} position={[0, 0, 0.1]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}> {/* 旋转90度使圆柱沿Z轴延伸 */}
            <cylinderGeometry args={[0.04, 0.04, 1.2, 12]} />
            <meshStandardMaterial color={THEME.shaft} emissive={edgeColor} emissiveIntensity={0.8} />
          </mesh>
        </group>

        {/* 齿轮箱：红色发光方块 + 横向圆柱 */}
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

        {/* 发电机：黄色圆柱体组（双层嵌套） */}
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

        {/* 轮毂 + 3 片叶片 */}
        <group ref={rotorRef} position={[0, 0, 0.5]}>
          {/* 轮毂中心球 */}
          <mesh>
            <sphereGeometry args={[0.18, 16, 16]} />
            <meshStandardMaterial color={glassColor} transparent opacity={0.2} roughness={0.2} metalness={0.8} />
            <Edges scale={1} threshold={15} color={edgeColor} />
          </mesh>
          {/* 轮毂鼻锥 */}
          <mesh position={[0, 0, 0.1]}>
            <cylinderGeometry args={[0.02, 0.18, 0.3, 16]} rotation={[Math.PI / 2, 0, 0]} />
            <meshStandardMaterial color={glassColor} transparent opacity={0.2} roughness={0.2} metalness={0.8} />
            <Edges scale={1} threshold={15} color={edgeColor} />
          </mesh>

          {/* 3 片叶片：各间隔 120° (2π/3) */}
          {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((angle, i) => (
            <group key={i} rotation={[0, 0, angle]}>
              {/* 叶片根部连接柱 */}
              <mesh position={[0, 0.2, 0]}>
                <cylinderGeometry args={[0.06, 0.06, 0.15, 12]} />
                {/* 如果有故障且 bladeIndex==i，连接柱变红 */}
                <meshStandardMaterial
                  color={defect && defect.bladeIndex === i ? "#ff3333" : THEME.accentGreen}
                  emissive={defect && defect.bladeIndex === i ? "#ff3333" : THEME.accentGreen}
                  emissiveIntensity={0.6} transparent opacity={0.8}
                />
                <Edges color={defect && defect.bladeIndex === i ? "#ff6666" : "#6ee7b7"} />
              </mesh>
              {/* 叶片主体：扁长的 box（宽0.15 × 长2.4 × 极薄0.04） */}
              <mesh position={[0, 1.4, 0]}>
                <boxGeometry args={[0.15, 2.4, 0.04]} />
                {/* 故障叶片用深红色，正常用蓝色 */}
                <meshStandardMaterial
                  color={defect && defect.bladeIndex === i ? "#3b0000" : glassColor}
                  transparent opacity={0.1} roughness={0.4} metalness={0.8}
                />
                <Edges scale={1} threshold={15} color={defect && defect.bladeIndex === i ? "#ff4444" : edgeColor} />
              </mesh>
              {/* 如果有故障且 bladeIndex==i，渲染 BladeDamageMarker 故障标记 */}
              {defect && defect.bladeIndex === i && (
                <BladeDamageMarker bladeAngle={0} defectType={defect.type} />
              )}
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}

// ── CoordinateAxes：小型 XYZ 坐标轴指示器（红=X, 绿=Y, 蓝=Z） ──
function CoordinateAxes() {
  const axisLength = 3;   // 轴长
  const arrowHead = 0.3;  // 箭头大小
  return (
    <group position={[0, 0, 0]}>
      {/* X轴 - 红色：先旋转-π/2使圆柱沿X轴，箭头放在末端 */}
      <mesh>
        <cylinderGeometry args={[0.03, 0.03, axisLength, 8]} />
        <meshBasicMaterial color="#ff4444" />
      </mesh>
      <mesh position={[axisLength / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[arrowHead, 0.6, 8]} />
        <meshBasicMaterial color="#ff4444" />
      </mesh>
      {/* Y轴 - 绿色：默认沿Y轴，箭头在上方 */}
      <mesh rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, axisLength, 8]} />
        <meshBasicMaterial color="#44ff44" />
      </mesh>
      <mesh position={[0, axisLength / 2, 0]}>
        <coneGeometry args={[arrowHead, 0.6, 8]} />
        <meshBasicMaterial color="#44ff44" />
      </mesh>
      {/* Z轴 - 蓝色：旋转π/2使圆柱沿Z轴，箭头在末端 */}
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

// ========== 主入口组件：WindTurbine3D（整个3D场景的根） ==========
export function WindTurbine3D({ defectMap }: { defectMap?: Record<number, { bladeIndex: number; type: string }> }) {
  // ─── 可调整参数：GLB 地形位置、风机位置、缩放 ───
  const glbPos: [number, number, number] = [0, -40, 0];          // GLB 地形 X, Y(上下), Z
  const turbinePos: [number, number, number] = [-11, 3, 5];      // 风机在场景中的 X, Y(高度), Z
  const turbineScale = 0.8;                                        // 风机整体缩放比例

  return (
    // 外层 div 必须给 Canvas 提供宽高
    <div className="h-full w-full bg-[#020617]">
      {/* Canvas = Three.js 渲染的画布 */}
      <Canvas
        camera={{ position: [38, 32, 62], fov: 40 }}  // 相机初始位置 + 视场角40°
        gl={{ antialias: true, alpha: false }}          // 抗锯齿 + 无透明通道
      >
        {/* 设置画布背景色 */}
        <color attach="background" args={["#020617"]} />

        {/* ===== 灯光系统 ===== */}
        {/* 环境光：均匀照亮整个场景（0.12很低，保持暗调） */}
        <ambientLight intensity={0.12} />
        {/* 平行光：模拟太阳从正上方照下 */}
        <directionalLight position={[0, 60, 0]} intensity={0.9} color="#00f0ff" />
        {/* 点光源 #1：暖色聚光校园中心 */}
        <pointLight position={[15, 28, 10]} intensity={2.8} color="#06b6d4" />
        {/* 点光源 #2：蓝色补光西北角 */}
        <pointLight position={[-25, 22, -20]} intensity={1.8} color="#3b82f6" />
        {/* 点光源 #3：浅蓝补光东侧海边 */}
        <pointLight position={[45, 18, -10]} intensity={1.4} color="#0ea5e9" />

        {/* ===== GLB 校园地形（尝试加载 GLB 模型） ===== */}
        <Suspense fallback={null}>  {/* 加载中不显示任何占位 */}
          <group position={glbPos}>
            <BlenderCampusModel />
          </group>
        </Suspense>

        {/* ===== 数据粒子流（全场景范围内上升的蓝色光点） ===== */}
        <DataStreams />

        {/* ===== 4台风机（2×2 矩阵） ===== */}
        {/* 以 turbinePos 为原点，向 X+ 偏移 6，向 Z+ 偏移 6，构成2×2网格 */}
        {[
          [turbinePos[0], turbinePos[1], turbinePos[2]],        // 左上（原点）
          [turbinePos[0] + 6, turbinePos[1], turbinePos[2]],    // 右上
          [turbinePos[0], turbinePos[1], turbinePos[2] + 6],   // 左下
          [turbinePos[0] + 6, turbinePos[1], turbinePos[2] + 6],// 右下
        ].map((pos, i) => (
          <group key={i} position={pos as [number, number, number]}>
            {/* defectMap[i] = 该台风机是否有故障 */}
            <TurbineModel scale={turbineScale} defect={defectMap?.[i] ?? null} />
          </group>
        ))}

        {/* ===== XYZ 坐标轴指示器 ===== */}
        <CoordinateAxes />

        {/* ===== 轨道控制器（鼠标交互） ===== */}
        <OrbitControls
          enablePan={true}               // 允许平移（右键拖拽）
          enableZoom={true}              // 允许缩放（滚轮）
          minDistance={12}               // 最近距离
          maxDistance={130}              // 最远距离
          maxPolarAngle={Math.PI / 2 - 0.04}  // 限制不能翻到底部（防止穿地面）
          autoRotate={true}              // 自动缓慢旋转
          autoRotateSpeed={0.22}         // 旋转速度（0.22弧度/秒≈12.6度/秒）
          target={[5, 0, 3]}            // 相机注视的目标点（校园中心偏CE楼）
        />
      </Canvas>
    </div>
  );
}