# 风机数字孪生监测平台 — 前端界面完整技术剖析

---

## 一、项目技术栈总览

本项目前端是一个**纯浏览器端 SPA（单页应用）**，不依赖任何后端框架，所有渲染都在浏览器中完成。

| 层面 | 技术方案 | 用途 |
|------|---------|------|
| **构建工具** | Vite 6.3 | 开发服务器 + 打包构建 |
| **UI 框架** | React 18 | 组件化开发 |
| **语言** | TypeScript | 类型安全 |
| **路由** | React Router 7 | 4个页面之间的导航 |
| **CSS** | Tailwind CSS 4 | 原子化CSS，全部内联样式 |
| **3D渲染** | Three.js + React Three Fiber + Drei | WebGL 3D场景 |
| **图表** | Recharts | 实时曲线图、柱状图、散点图 |
| **图标** | Lucide React | 纯SVG图标库 |
| **UI组件库** | Radix UI + MUI | 无障碍基础组件 |
| **实时通信** | 浏览器原生 WebSocket | 传感器数据 + AI诊断结果 |

`package.json` 中有完整的依赖列表。

---

## 二、项目是怎么从零搭建起来的

### 2.1 入口文件：`main.tsx` → `App.tsx` → `routes.tsx`

应用启动的调用链：

```
浏览器打开 → index.html → main.tsx → createRoot("#root") → <App/>
                                              ↓
                              App.tsx → <RouterProvider router={router}/>
                                              ↓
                              routes.tsx → Layout外壳 + 4个子页面
```

`main.tsx` 是整个应用的起点，只有一行核心代码：`createRoot(document.getElementById("root")!).render(<App />)`。

`App.tsx` 作为根组件，接收 React Router 的路由器并注入整个应用。

`routes.tsx` 定义了4个页面路由：

| 路由路径 | 页面组件 | 功能 |
|----------|---------|------|
| `/` | `MainMonitor` | **主监测界面**：3D数字孪生 + 实时参数 + AI预警 |
| `/simulation` | `Simulation` | **仿真分析**：叶片应力分布3D仿真 |
| `/data` | `RealTimeData` | **实时数据**：7路传感器 + 实时曲线 + 摄像头 |
| `/ai` | `AIDiagnosis` | **智能诊断**：DANN模型诊断结果可视化 |

### 2.2 Layout 外壳：`Layout.tsx` — 全局框架

`Layout.tsx` 是整个应用的**骨架**，所有4个页面都嵌套在这个外壳里。

```
┌─────────────────────────────────────────────────────┐
│  Header：Logo + "风机数字孪生监测系统" + 系统状态灯 + 实时时钟  │
├─────────────────────────────────────────────────────┤
│  Nav：  [主监测] [仿真分析] [实时数据] [智能诊断]           │
├─────────────────────────────────────────────────────┤
│                                                      │
│  <DiagnosisProvider>                                 │
│    <Outlet />  ← 4个子页面在这里渲染                     │
│  </DiagnosisProvider>                                │
│                                                      │
└─────────────────────────────────────────────────────┘
```

关键技术细节：
- **毛玻璃效果**：`bg-[#0d1229]/80 backdrop-blur-sm` — 半透明深蓝背景 + CSS模糊滤镜
- **实时时钟**：`useEffect` 里创建 `setInterval`，每1秒更新 `new Date()`
- **导航高亮**：用 React Router 的 `NavLink` 组件，通过 `isActive` 回调动态切换边框颜色
- **`<DiagnosisProvider>`**：包裹 `<Outlet/>`，让4个子页面都能通过 `useDiagnosis()` 共享AI诊断数据

---

## 三、第一个界面：主监测（MainMonitor）— 3D数字孪生核心

### 3.1 界面布局

`MainMonitor.tsx` 采用**相对定位 + 绝对定位层叠**的布局方案：

```
┌─────────────────────────────────────────────────────┐
│  relative h-[800px] 容器                              │
│                                                      │
│  ┌─ 底层：3D场景（absolute inset-0）                 ─┐ │
│  │   <WindTurbine3D defectMap={defectMap} />          │ │
│  └──────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─ 顶层居中：标题横幅（中文+英文+在线状态）          ─┐ │
│  │   "3D数字孪生 - 中大珠海校区区域监测"              │ │
│  └──────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─ 左侧面板 ──────┐   ┌─ 右侧面板 ──────────────────┐│
│  │ 风速/温度/湿度   │   │ WT-01: 0.23 m/s²           ││
│  │                  │   │ WT-02: 0.15 m/s²           ││
│  │ DANN智能诊断预警  │   │ WT-03: 0.31 m/s²           ││
│  │ - AI_ALERT_叶片裂纹│  │ WT-04: 0.08 m/s²          ││
│  └──────────────────┘   └───────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

### 3.2 3D场景的从零构建过程

**这是前端最核心、最复杂的部分**。构建过程分为以下步骤：

#### 第1步：Blender 中搭建中大珠海校区地形

在 Blender 中用卫星地图作为参考，手工建模了整个校园：
- 北区楼群（图书馆、文学院、理学院等）
- 南区学术楼群（工学院、机电工程、土木实验楼等）
- 宿舍区（10栋塔楼）
- 道路网络、树木、逸仙湖、运动场、海岸线
- 然后用 GLTF 格式导出为 `.glb` 文件放在 `public/campus.glb`

#### 第2步：GLB 模型加载 + 程序化场景双轨并行

`WindTurbine3D.tsx` 中采用了**GLB + 程序化场景并存**的策略：

```tsx
// BlenderCampusModel：尝试加载 GLB 地形
// 加载成功 → 显示 GLB 模型（带自定义材质替换）
// 加载失败 → 返回 null（由程序化场景兜底）

// CampusEnvironment：完整的程序化校园
// 卫星地图贴图 + 网格覆盖 + 所有建筑/道路/树木/湖/海岸
```

这个设计的精妙之处：即使 GLB 文件没部署或加载失败，界面也不会崩，所有东西都有程序化生成的兜底方案。

#### 第3步：卫星地图贴图

`dcc662850128d337acd0b8fca68e9825.png` — 这是中大珠海校区的卫星图，通过 `useLoader(THREE.TextureLoader, mapImg)` 加载，贴在 130×90 的巨大平面几何体上，再覆盖半透明网格线（gridHelper），形成**全息地图桌面**的效果。

#### 第4步：18个可复用的3D子组件

`WindTurbine3D.tsx` 文件包含以下子组件：

| 组件 | 作用 | 技术亮点 |
|------|------|---------|
| `CyberBuilding` | 赛博建筑（线框方盒+半透明填充+发光边缘） | `Edges` 描边 + PBR材质 |
| `CyberHouse` | 居民楼（方盒+金字塔屋顶+发光窗户） | `coneGeometry(4)` 四棱锥屋顶 |
| `CyberRoad` | 发光道路（深色路面+虚线+边线） | `planeGeometry` 旋转贴地 |
| `CyberTree` | 赛博树木（圆柱树干+双层锥形树冠） | 六边形锥体 + 自发光材质 |
| `CampusLake` | 逸仙湖（椭圆水面+呼吸灯边框） | `circleGeometry` + `sin`波动光强 |
| `SportsTrack` | 运动场（绿色内场+红色跑道） | `ringGeometry` 环形跑道 |
| `CEBeacon` | 土木工程信标（旋转扫描环+脉冲标记+光柱） | `useFrame` 多对象同步动画 |
| `StreetLamp` | 路灯（细柱+发光球+点光源） | 真实点光源照亮周围 |
| `DataStreams` | 数据粒子流（700个上升蓝色光点） | `BufferGeometry` + `AdditiveBlending` |
| `CoastalSea` | 海岸线+海面 | 双平面+发光边线 |
| `CampusGate` | 校门（两侧立柱+横梁+照明） | 对称结构 + 点光源 |
| `CampusDecoration` | 校园装饰层（汇集所有装饰元素） | 一次性渲染道路/树木/路灯/湖/海岸 |
| `BlenderCampusModel` | GLB模型加载器 | `GLTFLoader` + 材质替换 + 失败兜底 |
| `CampusEnvironment` | 完整程序化校园 | 卫星图底+网格+装饰+建筑群 |
| `BladeDamageMarker` | 叶片故障标记（脉冲红球+扩散光环+红光） | 多层动画 + 动态缩放/透明度 |
| `TurbineModel` | 风机3D模型（塔筒+机舱+主轴+齿轮箱+发电机+3叶片+转子） | 完整机械结构分解 |
| `CoordinateAxes` | XYZ坐标轴指示器 | 三色锥形箭头 |
| `WindTurbine3D` | **主入口**（整个3D场景的根组件） | 灯光系统 + 4台风机2×2矩阵 + 轨道控制 |

### 3.3 风机模型的精细结构

`TurbineModel` 组件构建了一个完整的**风力发电机**3D模型，从下到上包括：

```
          【3片叶片】各120°分布，绕Z轴自转
          【轮毂】中心球体 + 鼻锥
          【主轴】细长发光圆柱，连接机舱和轮毂，同步旋转
    ┌───  【机舱】长方形盒子
    │     【齿轮箱】红色发光方块 + 横向圆柱
    │     【发电机】黄色双层嵌套圆柱
    ├───  【塔筒】上细下粗的圆柱体（16边棱柱）
    │
    └───  【塔基】在地面上
```

`rotorRef` 控制整个转子组（轮毂+叶片）的旋转，`shaftRef` 控制主轴的同步旋转，两部分通过 `useFrame` 每帧旋转 `dt * 1.5` 弧度。

### 3.4 损伤标注系统 — 主界面与AI诊断的联动

这是项目**最大的亮点**之一。损伤标注的工作流程：

```
AI诊断后端 (Python)
    │  WebSocket → {"class": 0, "status": "异常", "confidence": 0.92}
    ▼
MainMonitor 的 useEffect #2
    │  解析 JSON → 提取 class 和 status
    ▼
setDefectMap({
    [result.class % 4]: {           ← 决定哪台风机（0-3号）
        bladeIndex: result.class % 3,  ← 决定哪片叶片（0/1/2号）
        type: CLASS_LABELS[result.class]  ← 故障类型中文名
    }
})
    │  defectMap 作为 props 传给 WindTurbine3D
    ▼
WindTurbine3D → 4台TurbineModel
    │  defect={defectMap?.[i] ?? null}
    ▼
TurbineModel 内部：
    │  如果 defect.bladeIndex === i（当前叶片编号匹配）
    │  ├── 叶片根部连接柱变红（emissive: "#ff3333"）
    │  ├── 叶片主体变深红色（color: "#3b0000"）
    │  └── 渲染 <BladeDamageMarker> 组件
    │       ├── 脉冲红球（scale正弦波动 1.0~1.6）
    │       ├── 扩散光环（缩放+透明度波动）
    │       └── 红色点光源（照亮周围叶片）
    │
    │  如果 defect 为 null（正常状态）
    │  └── 所有叶片恢复青色/绿色
```

### 3.5 三路数据源的实时接入

MainMonitor 通过 **3个独立的 useEffect** 连接3路数据：

| 数据源 | 协议 | 地址 | 更新频率 | 获取的数据 |
|--------|------|------|---------|-----------|
| 传感器网关 | WebSocket | `ws://8.138.129.114/api/v1/live?gateway_id=gateway-01` | 实时推送 | 4路加速度 + 温度 + 湿度 |
| AI诊断后端 | WebSocket | `ws://8.138.129.114:8000/ws` | 每2秒推送 | DANN诊断结果（类别+置信度） |
| 珠海气象API | HTTP | `https://api.open-meteo.com/...` | 每5分钟 | 10米高度风速 |

WebSocket 断线重连机制：`ws.onclose = () => setTimeout(connect, 3000);`（断开后3秒自动重连）

---

## 四、第二个界面：仿真分析（Simulation）— 叶片应力分布

### 4.1 界面布局

`Simulation.tsx` 采用 **12列Grid布局**：

```
┌──────────────────────┬─────────────────────────────────┐
│  左侧 col-span-3     │  右侧 col-span-9                │
│                      │                                 │
│  仿真参数配置         │  风机叶片 3D 应力分布分析         │
│  ├ 仿真类型: 应力分析 │  ┌───────────────────────────┐ │
│  ├ 风速滑块: 5-25m/s │  │                           │ │
│  ├ 转速滑块: 8-18RPM │  │  Canvas 3D场景             │ │
│  ├ 动态载荷: 0.5-1.5 │  │  StressBladeModel          │ │
│  └ [开始/停止] 按钮   │  │  (旋转转子 + 实时变色)      │ │
│                      │  │                           │ │
│  计算状态             │  │  ┌───────────────────┐    │ │
│  ├ 网格单元: 1,245,678│  │  │  图例 (悬浮)       │    │ │
│  ├ 时间步长: 0.001s  │  │  │  ■ 高应力 红色    │    │ │
│  ├ 收敛精度: 1e-6    │  │  │  ■ 中应力 橙色    │    │ │
│  └ 进度: 实时计算中   │  │  │  ■ 低应力 青色    │    │ │
│                      │  │  └───────────────────┘    │ │
│                      │  └───────────────────────────┘ │
└──────────────────────┴─────────────────────────────────┘
```

### 4.2 应力分布的核心算法

`StressBladeModel` 使用了**应力着色映射函数**：

```ts
const getStressColor = (baseStress: number) => {
    const stress = baseStress * loadFactor;  // 实际应力 = 基础应力 × 载荷系数
    if (stress > 0.8) return "#ef4444";      // 红色 — 危险
    if (stress > 0.5) return "#f59e0b";      // 橙色 — 警告
    return "#06b6d4";                         // 青色 — 安全
};
```

每片叶片分为3段：**叶根(baseStress=0.9) → 叶中(0.6) → 叶尖(0.3)**。当拖动"动态载荷系数"滑块（`loadFactor` 从 0.5 到 1.5），叶片颜色会实时变化：
- 载荷0.5：叶根 0.9×0.5=0.45 → 青色（安全）；叶尖 0.3×0.5=0.15 → 青色
- 载荷1.0：叶根 0.9×1.0=0.9 → 红色（危险）；叶中 0.6×1.0=0.6 → 橙色
- 载荷1.5：叶根 0.9×1.5=1.35 → 红色；叶中 0.6×1.5=0.9 → 红色；叶尖 0.3×1.5=0.45 → 青色

### 4.3 仿真运行逻辑

```ts
// 载荷因子绑定到 state
const [loadFactor, setLoadFactor] = useState(1.0);

// 滑块拖动 → 立即更新 state → 所有叶片的 getStressColor 重新计算 → 颜色实时变化
<input type="range" value={loadFactor} onChange={(e) => setLoadFactor(parseFloat(e.target.value))} />

// 转子旋转速度也受 loadFactor 影响
rotorRef.current.rotation.z -= delta * 2 * loadFactor;
// loadFactor=0.5 → 转速慢；loadFactor=1.5 → 转速快
```

---

## 五、第三个界面：实时数据（RealTimeData）— 传感器监控

### 5.1 界面布局

`RealTimeData.tsx` 从上到下的结构：

```
┌─────────────────────────────────────────────────────┐
│  监控摄像头实时画面 (CameraFeed 组件)                   │
│  ├ 标题栏: Camera图标 + 标题 + 状态灯 + [配置][重连][全屏]│
│  ├ URL配置栏(可展开)                                  │
│  └ 画面区: <img> 拉 MJPEG 流                          │
├─────────────────────────────────────────────────────┤
│  传感器实时数据  │  右上角数据源状态指示器                │
│                 │  [网关已连接][加速度有数据][温度有数据]..│
├─────────────────────────────────────────────────────┤
│  7个传感器数值卡片（一行7列）                           │
│  [加速度1][加速度2][加速度3][加速度4][温度][湿度][风速]   │
├─────────────────────────────────────────────────────┤
│  四路加速度传感器 - 实时曲线对比（全宽AreaChart）        │
├─────────────────────────────────────────────────────┤
│  [温度实时曲线]  [湿度实时曲线]  [风速实时曲线]          │
│  三列并排，每个都有独立的渐变色                          │
└─────────────────────────────────────────────────────┘
```

### 5.2 摄像头视频流的技术实现

`CameraFeed.tsx` 的核心原理：只用了一个 `<img>` 标签实现实时视频流。

```
树莓派 USB 摄像头
    │  mjpg-streamer 推流 → HTTP :8080/?action=stream
    ▼
蒲公英 4G CPE 端口转发
    │  CPE公网IP:8080 → 树莓派局域网IP:8080
    ▼
前端 <img src="http://8.138.129.114:8080/?action=stream" />
    │  MJPEG 格式的实质是 "连续发送的JPEG帧"
    │  浏览器 <img> 标签天然支持持续接收 MJPEG 流
    │  延迟仅 0.1~0.5 秒，零额外依赖
    ▼
连接状态检测：
  ├ onLoad  → "connected"（绿色Wifi图标）
  ├ onError → "disconnected"（红色断连提示）
  └ 心跳检测：每5秒检查 lastFrameTimeRef
      超过10秒无新帧 → "已中断"
```

运行时配置URL：组件内部有 `showUrlInput` 状态，展开后可以输入新的视频源地址，点"应用"即时生效，不需要重新构建部署。

### 5.3 7个传感器数据的实时流转

```
传感器硬件 → WebSocket 网关(gateway-01)
    │  JSON: { type: "sensor_sample_batch", data: [...] }
    ▼
RealTimeData.tsx useEffect #1
    │  解析 JSON → 提取4路加速度（三轴合成 √(x²+y²+z²)）
    │            → 提取温度
    │            → 提取湿度
    ▼
更新3个 state:
  ├ sensorData  → 最新数值（卡片显示用）
  ├ chartData   → 追加时间点数据（图表用，最多保留60个点）
  └ sourceStatus → 数据源可用状态（右上角指示灯用）
```

数据源状态指示器：右上角有6个状态灯，每个都独立指示一个数据源的健康状态：

| 状态灯 | 含义 |
|--------|------|
| 🟢 网关已连接 | WebSocket 连接正常 |
| 🟢 加速度有数据 | 至少1个传感器有加速度数据 |
| 🟢 温度有数据 | 温度字段存在 |
| 🟢 湿度有数据 | 湿度字段存在 |
| 🟢 气象OK | Open-Meteo API 正常响应 |
| 🟡 等待数据 | 对应数据源尚未收到有效数据 |

---

## 六、第四个界面：AI智能诊断（AIDiagnosis）— DANN结果可视化

### 6.1 全局数据共享架构

这是项目架构最巧妙的设计之一。通过 React Context 实现了跨页面的数据共享：

```
DiagnosisProvider (包裹在 Layout 中)
    │  内部维护一个 WebSocket 连接到 AI 后端
    │  ws://8.138.129.114:8000/ws
    │
    ├── 收到数据 → setResults / setChartData / setLatestResult
    │
    ├── 通过 Context.Provider 向下传递
    │
    ├── MainMonitor 调用 useDiagnosis() → 拿 latestResult
    │   └── 判断 status === "异常" → setDefectMap → 3D风机显示红色标记
    │
    └── AIDiagnosis 调用 useDiagnosis() → 拿 results / chartData / connected
        └── 渲染统计卡片 + 诊断列表 + 置信度趋势图
```

关键技术：`DiagnosisContext.tsx` 中 WebSocket 的 `onmessage` 同时更新多个 state，这保证了 MainMonitor 和 AIDiagnosis 看到的是同一份数据。

### 6.2 AIDiagnosis 界面的图表生态

`AIDiagnosis.tsx` 使用了 **Recharts 的5种图表类型**：

| 图表区域 | 图表类型 | 数据 |
|----------|---------|------|
| 迁移效果对比 | `BarChart` / `Bar` | 两列：无域适应(65%) vs DANN迁移(91.2%) |
| t-SNE特征分布 | `ScatterChart` / `Scatter` | 有光域(黄点) vs 无光域(蓝点) |
| 准确率趋势 | `LineChart` / `Line` | 50个epoch的有光/无光准确率变化 |
| 置信度实时趋势 | `AreaChart` / `Area` | 每次诊断的置信度变化曲线 |
| 诊断历史表 | 原生 `<table>` | 所有诊断记录的详细列表 |

### 6.3 DANN 模型中间状态展示

AIDiagnosis 页面有一个专门的 DANN 模型中间状态卡片，展示4个关键指标：

```
特征提取层: CNN1D → 6400维       ← FeatureExtractor 的输出维度
GRL λ 参数: λ = 0.xxx            ← 梯度反转层强度，控制域判别的对抗力度
域判别置信度: 0.48 (不可区分)       ← 越接近0.5说明域判别器分不清源域/目标域 = DANN成功
分类器输出: 4类概率分布            ← 最终诊断结果
```

---

## 七、四界面之间的数据联动（核心架构）

```
                     ┌──────────────────────────┐
                     │   DiagnosisContext        │
                     │   (全局诊断数据中枢)        │
                     │                          │
   WebSocket ──────▶ │   results[]              │
   AI后端            │   chartData[]            │
                     │   latestResult            │
                     │   connected               │
                     └──────┬───────────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
          ▼                 ▼                 ▼
   MainMonitor         AIDiagnosis        (其他页面也可)
   用 latestResult     用 results[]
   判断是否异常         展示统计+图表
   更新 defectMap      显示历史记录
   3D风机变红          置信度趋势
```

联动场景举例：

1. AI检测到故障 → AI后端WebSocket推送 `{"class":0, "status":"异常", "confidence":0.92}`
2. DiagnosisContext 收到消息 → 更新 `latestResult` + 追加到 `results` 数组
3. MainMonitor（主监测页）→ `latestResult.status === "异常"` → `setDefectMap` → `WindTurbine3D` 收到 `defect` prop → 对应叶片变红 + 脉冲标记 + AI预警面板显示红色警告
4. AIDiagnosis（智能诊断页）→ `results` 数组更新 → 统计卡片增加异常数 → 诊断历史表追加新行 → 置信度趋势图更新
5. RealTimeData（实时数据页）→ 传感器加速度数据如果出现异常值 → 对应的曲线图会显示峰值

---

## 八、项目文件结构与各模块职责

```
src/
├── main.tsx                          # 应用入口，挂载到 #root
├── app/
│   ├── App.tsx                       # 根组件，注入路由
│   ├── routes.tsx                    # 路由配置（4个页面）
│   ├── context/
│   │   └── DiagnosisContext.tsx       # AI诊断数据全局共享（Context + WebSocket）
│   ├── components/
│   │   ├── Layout.tsx               # 全局外壳（Header + Nav + Outlet）
│   │   ├── WindTurbine3D.tsx        # 3D场景（910行！校园+风机+故障标记+粒子流）
│   │   ├── CameraFeed.tsx           # 摄像头MJPEG流组件
│   │   ├── DataCard.tsx             # 可复用的数据卡片组件
│   │   ├── figma/
│   │   │   └── ImageWithFallback.tsx # 图片加载兜底
│   │   └── ui/                      # Radix UI 组件封装（按钮/表格/弹窗等）
│   └── pages/
│       ├── MainMonitor.tsx           # 主监测页面（3D场景 + 实时参数 + AI预警）
│       ├── Simulation.tsx            # 仿真分析页面（叶片应力3D可视化）
│       ├── RealTimeData.tsx          # 实时数据页面（7路传感器 + 曲线图 + 摄像头）
│       └── AIDiagnosis.tsx           # 智能诊断页面（DANN结果可视化）
├── imports/
│   └── dcc662850128d337acd0b8fca68e9825.png  # 中大珠海校区卫星地图
└── styles/
    └── index.css                     # 全局样式（Tailwind入口）
```

---

## 九、关键技术决策总结

| 决策 | 选择方案 | 原因 |
|------|---------|------|
| 3D渲染 | React Three Fiber（非原生Three.js） | 组件化开发，与React生命周期集成 |
| 视频流 | MJPEG + `<img>` 标签 | 零依赖，延迟0.1-0.5秒，浏览器原生支持 |
| 实时数据 | 浏览器原生 WebSocket | 无需额外库，双向通信，自动重连 |
| 样式方案 | Tailwind CSS（全内联类名） | 无需CSS文件，样式与组件同文件 |
| 状态管理 | React Context（非Redux/Zustand） | 项目规模适中，Context足够 |
| 路由 | React Router 7 | 与React生态最兼容 |
| 图表 | Recharts | 声明式API，React原生组件 |
| 场景兜底 | GLB + 程序化场景双轨 | GLB加载失败时程序化场景自动接管 |
| 断线重连 | `ws.onclose → setTimeout(connect, 3000)` | 简单可靠，无需第三方库 |