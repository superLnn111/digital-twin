import { useEffect, useRef, useState } from 'react';
import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Euler,
  Fog,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  CircleGeometry,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Quaternion,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CHANNELS, CHANNEL_LABEL, type ChannelId } from '../api/types';
import { telemetry, channelWindowMetrics, type SourceKind } from '../telemetry/store';
import type { SensorRangeConfig } from '../protocol/imu';
import type { Settings } from '../app/settings';
import { useTelemetryVersion } from '../app/hooks';
import { buildTurbine, createGeometries, createMaterials, TOWER_HEIGHT, type TurbineParts } from './turbine';
import { nowNs, nsDiffMs } from '../lib/ns';

export interface TwinViewportProps {
  focus: ChannelId;
  onFocus: (c: ChannelId) => void;
  source: SourceKind;
  range: SensorRangeConfig;
  settings: Settings;
}

type ViewPreset = 'overview' | 'top' | 'side' | 'focus';

const POSITIONS: Record<ChannelId, [number, number]> = {
  'usb-if00': [-3.3, -0.35],
  'usb-if02': [-1.1, 0.25],
  'usb-if04': [1.1, 0.25],
  'usb-if06': [3.3, -0.35],
};

const RING_COLORS = {
  idle: new Color('#4c555c'),
  ok: new Color('#6f7a82'),
  focus: new Color('#a9c1d3'),
  warn: new Color('#e3a33b'),
  alarm: new Color('#ef5a4c'),
};

type ChannelState = 'idle' | 'ok' | 'warn' | 'alarm';

interface LabelInfo {
  state: ChannelState;
  vib: number | null;
  stale: boolean;
}

function channelState(c: ChannelId, source: SourceKind, range: SensorRangeConfig, settings: Settings): LabelInfo {
  const track = telemetry.tracks[c];
  if (track.lastValidNs === null) return { state: 'idle', vib: null, stale: false };
  let stale = false;
  if (source === 'live') stale = nsDiffMs(nowNs(), track.lastValidNs) > settings.staleAfterS * 1000;
  const m = channelWindowMetrics(track, range, telemetry.headMs, 2000);
  const vib = m?.vibRms ?? null;
  let state: ChannelState = 'ok';
  if (vib !== null && vib >= settings.vibAlarmG) state = 'alarm';
  else if ((vib !== null && vib >= settings.vibWarnG) || stale) state = 'warn';
  return { state, vib, stale };
}

export default function TwinViewport({ focus, onFocus, source, range, settings }: TwinViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<Partial<Record<ChannelId, HTMLDivElement | null>>>({});
  const propsRef = useRef({ focus, onFocus, source, range, settings });
  propsRef.current = { focus, onFocus, source, range, settings };
  const apiRef = useRef<{ setView: (v: ViewPreset) => void; loadGlb: (f: File) => Promise<void>; clearGlb: () => void } | null>(null);
  const [view, setView] = useState<ViewPreset>('overview');
  const [glbName, setGlbName] = useState<string | null>(null);
  const [glbError, setGlbError] = useState<string | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);
  useTelemetryVersion();

  useEffect(() => {
    const host = hostRef.current!;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      setWebglError(`无法创建 WebGL 上下文：${(e as Error).message}`);
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    host.prepend(renderer.domElement);

    const scene = new Scene();
    const bg = new Color('#0f1214');
    scene.background = bg;
    scene.fog = new Fog(bg, 11, 30);
    const pmrem = new PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.42;

    const camera = new PerspectiveCamera(34, 1, 0.05, 120);
    camera.position.set(1.8, 3.6, 11.2);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.target.set(0, 1.85, 0);
    controls.minDistance = 1.6;
    controls.maxDistance = 26;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.7;
    controls.update();

    // light rig: one soft key, cool sky fill, faint rim
    const hemi = new HemisphereLight('#c9d6e0', '#1a1d20', 0.55);
    scene.add(hemi);
    const key = new DirectionalLight('#fff4e6', 2.3);
    key.position.set(-6, 9, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -4;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 30;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 4;
    scene.add(key);
    const rim = new DirectionalLight('#9fb6c8', 0.7);
    rim.position.set(7, 4, -8);
    scene.add(rim);

    // ground + engineering grid that fades into fog
    const ground = new Group();
    const floorGeo = new CircleGeometry(40, 96);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new MeshStandardMaterial({ color: '#15191c', roughness: 0.92, metalness: 0 });
    const floor = new Mesh(floorGeo, floorMat);
    floor.receiveShadow = true;
    ground.add(floor);
    const gridPts: number[] = [];
    const extent = 20;
    for (let i = -extent; i <= extent; i++) {
      gridPts.push(i, 0.001, -extent, i, 0.001, extent, -extent, 0.001, i, extent, 0.001, i);
    }
    const gridGeo = new BufferGeometry();
    gridGeo.setAttribute('position', new Float32BufferAttribute(gridPts, 3));
    const gridMat = new LineBasicMaterial({ color: '#2a3136', transparent: true, opacity: 0.55 });
    ground.add(new LineSegments(gridGeo, gridMat));
    scene.add(ground);

    const geo = createGeometries();
    const mat = createMaterials();
    const turbines = {} as Record<ChannelId, TurbineParts>;
    const pickMap = new Map<Object3D, ChannelId>();
    for (const c of CHANNELS) {
      const t = buildTurbine(geo, mat);
      const [x, z] = POSITIONS[c];
      t.root.position.set(x, 0, z);
      t.rotor.rotation.z = CHANNELS.indexOf(c) * 0.7;
      scene.add(t.root);
      turbines[c] = t;
      for (const m of t.pickables) pickMap.set(m, c);
    }

    const externalScene = new Group();
    scene.add(externalScene);

    // ── camera tween ──
    let tween: { pos: Vector3; target: Vector3 } | null = null;
    const presetFor = (v: ViewPreset): { pos: Vector3; target: Vector3 } => {
      const f = propsRef.current.focus;
      const [fx, fz] = POSITIONS[f];
      switch (v) {
        case 'top':
          return { pos: new Vector3(0.01, 13, 2.5), target: new Vector3(0, 0.6, 0) };
        case 'side':
          return { pos: new Vector3(10.5, 2.4, 0.8), target: new Vector3(0, 1.6, 0) };
        case 'focus':
          return { pos: new Vector3(fx + 2.3, TOWER_HEIGHT + 1.0, fz + 4.1), target: new Vector3(fx, TOWER_HEIGHT - 0.15, fz) };
        default:
          return { pos: new Vector3(1.8, 3.6, 11.2), target: new Vector3(0, 1.85, 0) };
      }
    };
    controls.addEventListener('start', () => {
      tween = null;
    });

    let needsRender = true;
    controls.addEventListener('change', () => {
      needsRender = true;
    });

    // ── resize & visibility ──
    let width = 1;
    let height = 1;
    const ro = new ResizeObserver(() => {
      const r = host.getBoundingClientRect();
      width = Math.max(1, Math.floor(r.width));
      height = Math.max(1, Math.floor(r.height));
      renderer.setSize(width, height, false);
      renderer.domElement.style.width = `${width}px`;
      renderer.domElement.style.height = `${height}px`;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      needsRender = true;
    });
    ro.observe(host);
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(host);

    // ── picking ──
    const ray = new Raycaster();
    const ndc = new Vector2();
    let downAt: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) return;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects([...pickMap.keys()], false)[0];
      const c = hit ? pickMap.get(hit.object) : undefined;
      if (c) propsRef.current.onFocus(c);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    // ── animation state ──
    const targetQ = new Quaternion();
    const euler = new Euler();
    const headingEuler = new Euler();
    const tmp = new Vector3();
    const ringColor = Object.fromEntries(CHANNELS.map((c) => [c, RING_COLORS.idle.clone()])) as Record<ChannelId, Color>;
    let lastVersion = -1;
    let lastStateEval = 0;
    let states = {} as Record<ChannelId, LabelInfo>;
    let lastT = performance.now();
    let raf = 0;

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (t - lastT) / 1000);
      lastT = t;
      if (!visible || document.hidden) return;
      const p = propsRef.current;
      let animating = false;

      if (tween) {
        const k = 1 - Math.exp(-dt * 4.2);
        camera.position.lerp(tween.pos, k);
        controls.target.lerp(tween.target, k);
        if (camera.position.distanceTo(tween.pos) < 0.005 && controls.target.distanceTo(tween.target) < 0.005) tween = null;
        animating = true;
      }
      if (controls.update()) animating = true;

      if (t - lastStateEval > 250 || telemetry.version !== lastVersion) {
        if (t - lastStateEval > 250) {
          states = Object.fromEntries(CHANNELS.map((c) => [c, channelState(c, p.source, p.range, p.settings)])) as typeof states;
          lastStateEval = t;
        }
        lastVersion = telemetry.version;
        needsRender = true;
      }

      for (const c of CHANNELS) {
        const tb = turbines[c];
        const track = telemetry.tracks[c];
        // rotor: only spins when a speed is actually known (simulator)
        if (track.rpm !== null && p.source === 'sim') {
          tb.rotor.rotation.z -= (track.rpm / 60) * Math.PI * 2 * dt;
          animating = true;
        }
        // attitude: IMU yaw → Y, pitch → X, roll → rotor axis Z
        const att = track.attitude();
        if (att?.euler) {
          const d2r = Math.PI / 180;
          euler.set(-att.euler.pitch * d2r, att.euler.yaw * d2r, att.euler.roll * d2r, 'YXZ');
          targetQ.setFromEuler(euler);
        } else targetQ.identity();
        if (tb.nacelle.quaternion.angleTo(targetQ) > 1e-4) {
          tb.nacelle.quaternion.slerp(targetQ, 1 - Math.exp(-dt * 7));
          animating = true;
        }
        tb.heading.rotation.y = headingEuler.setFromQuaternion(tb.nacelle.quaternion, 'YXZ').y;
        // ring colour eases toward the semantic state
        const st = states[c]?.state ?? 'idle';
        const want = st === 'ok' && c === p.focus ? RING_COLORS.focus : RING_COLORS[st];
        const col = ringColor[c];
        if (Math.abs(col.r - want.r) + Math.abs(col.g - want.g) + Math.abs(col.b - want.b) > 0.004) {
          col.lerp(want, 1 - Math.exp(-dt * 6));
          animating = true;
        }
        tb.ring.material.color.copy(col);
        tb.ring.material.opacity = st === 'idle' ? 0.35 : c === p.focus || st !== 'ok' ? 0.9 : 0.55;
      }

      if (!animating && !needsRender) return;
      needsRender = false;
      renderer.render(scene, camera);

      // project labels
      for (const c of CHANNELS) {
        const el = labelRefs.current[c];
        if (!el) continue;
        const tb = turbines[c];
        tmp.set(0, TOWER_HEIGHT + 1.12, 0).applyMatrix4(tb.root.matrixWorld).project(camera);
        const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
        el.style.opacity = vis ? '' : '0';
        el.style.transform = `translate3d(${((tmp.x + 1) / 2) * width}px, ${((1 - tmp.y) / 2) * height}px, 0) translate(-50%, -100%)`;
      }
    };
    raf = requestAnimationFrame(loop);

    // ── external API ──
    apiRef.current = {
      setView: (v) => {
        tween = presetFor(v);
      },
      loadGlb: async (file) => {
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const buf = await file.arrayBuffer();
        const gltf = await new GLTFLoader().parseAsync(buf, '');
        clearExternal();
        gltf.scene.traverse((o) => {
          const m = o as Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
          }
        });
        externalScene.add(gltf.scene);
        needsRender = true;
      },
      clearGlb: () => {
        clearExternal();
        needsRender = true;
      },
    };
    function clearExternal() {
      for (const child of [...externalScene.children]) {
        child.traverse((o) => {
          const m = o as Mesh;
          if (m.isMesh) {
            m.geometry.dispose();
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            mats.forEach((x) => x.dispose());
          }
        });
        externalScene.remove(child);
      }
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      controls.dispose();
      clearExternal();
      geo.all.forEach((g) => g.dispose());
      mat.all.forEach((m) => m.dispose());
      for (const c of CHANNELS) turbines[c].ring.material.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      gridGeo.dispose();
      gridMat.dispose();
      envRT.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      apiRef.current = null;
    };
  }, []);

  // re-aim the focus preset when the focused channel changes
  useEffect(() => {
    if (view === 'focus') apiRef.current?.setView('focus');
  }, [focus, view]);

  const pick = (v: ViewPreset) => {
    setView(v);
    apiRef.current?.setView(v);
  };

  return (
    <div className="viewport" ref={hostRef}>
      {webglError && <div className="viewport-error">{webglError}</div>}
      <div className="viewport-labels">
        {CHANNELS.map((c) => {
          const info = channelState(c, source, range, settings);
          const track = telemetry.tracks[c];
          const att = track.attitude();
          return (
            <div
              key={c}
              ref={(el) => {
                labelRefs.current[c] = el;
              }}
              className={`tlabel st-${info.state} ${focus === c ? 'focus' : ''}`}
              onClick={() => onFocus(c)}
            >
              <div className="tlabel-head">
                <b>{CHANNEL_LABEL[c]}</b>
                <span>{c}</span>
              </div>
              <div className="tlabel-rows">
                <span>
                  <i>转速</i>
                  {source === 'sim' && track.rpm !== null ? `${track.rpm.toFixed(0)} rpm` : <em>未提供</em>}
                </span>
                <span>
                  <i>振动</i>
                  {info.vib !== null ? `${info.vib.toFixed(3)} g` : <em>—</em>}
                </span>
                <span>
                  <i>偏航</i>
                  {att?.euler ? `${att.euler.yaw.toFixed(1)}°` : <em>—</em>}
                </span>
              </div>
              {info.stale && <div className="tlabel-flag">数据陈旧</div>}
              {info.state === 'idle' && <div className="tlabel-flag dim">无数据</div>}
            </div>
          );
        })}
      </div>
      <div className="viewport-toolbar">
        {(
          [
            ['overview', '总览'],
            ['focus', '聚焦'],
            ['side', '侧视'],
            ['top', '俯视'],
          ] as [ViewPreset, string][]
        ).map(([v, l]) => (
          <button key={v} type="button" className={view === v ? 'on' : ''} onClick={() => pick(v)}>
            {l}
          </button>
        ))}
        <span className="sep" />
        <label className="filebtn" title="载入外部 glTF / GLB 场景（仅本地解析，不上传）">
          {glbName ? `场景 · ${glbName}` : '载入场景 GLB'}
          <input
            type="file"
            accept=".glb,.gltf,model/gltf-binary"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f || !apiRef.current) return;
              setGlbError(null);
              try {
                await apiRef.current.loadGlb(f);
                setGlbName(f.name);
              } catch (err) {
                setGlbError(`载入失败：${(err as Error).message}`);
              }
            }}
          />
        </label>
        {glbName && (
          <button
            type="button"
            onClick={() => {
              apiRef.current?.clearGlb();
              setGlbName(null);
            }}
          >
            移除
          </button>
        )}
      </div>
      {glbError && <div className="viewport-note lv-alarm">{glbError}</div>}
      <div className="viewport-legend">
        <span>
          <i className="sw ok" />
          正常
        </span>
        <span>
          <i className="sw warn" />
          振动偏高 / 陈旧
        </span>
        <span>
          <i className="sw alarm" />
          振动超限
        </span>
        <span className="dim">姿态 = IMU 机舱姿态 · 环上刻度 = 偏航</span>
      </div>
    </div>
  );
}
