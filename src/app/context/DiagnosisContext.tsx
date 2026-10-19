// ========== 1. 导入依赖 ==========

// createContext：创建全局共享数据容器（React Context）
// useContext：子组件读取 Context 数据用的 Hook
// useEffect：组件挂载后执行副作用（连接WebSocket、请求数据）
// useState：在组件内创建响应式状态（值变了会自动重渲染）
// useRef：创建一个跨渲染周期不变的可变引用（存WebSocket对象）
// useCallback：缓存函数，防止每次渲染都重新创建（connect函数不变，useEffect不会重复触发）
// ReactNode：TypeScript类型，表示可以放入JSX的任何内容（字符串、数字、JSX元素等）
import { createContext, useContext, useEffect, useState, useRef, useCallback, type ReactNode } from "react";

// ========== 2. 数据类型定义 ==========

// DiagnosisResult：AI后端发来的每条诊断结果的形状
export interface DiagnosisResult {
  time: string; // 诊断时间，如 "2026-09-20T14:30:00"
  sensor_data: string; // 数据文件名，如 "class_2_sample_5.npy"
  class: number; // 故障类别编号：0=叶片裂纹, 1=正常, 2=异物/挂冰, 3=轴承故障
  confidence: number; // 置信度 0~1，越接近1模型越确定
  status: string; // 状态文字，如 "警告" 或 "正常"
  class_name?: string; // 类别中文名（可选），如 "叶片裂纹"
  error?: string; // 错误信息（可选），有错误时说明诊断失败
}

// DiagnosisContextType：Context 对外暴露的数据结构
interface DiagnosisContextType {
  results: DiagnosisResult[]; // 历史诊断记录（最多50条）
  chartData: { time: string; confidence: number; class: number }[]; // 图表用的简化数据（最多60条）
  connected: boolean; // WebSocket连接状态
  latestResult: DiagnosisResult | null; // 最新一条诊断结果
}

// ========== 3. WebSocket 地址 ==========
// 连接远程服务器上的 Python AI 后端（FastAPI WebSocket）
const WS_URL = "ws://8.138.129.114:8000/ws";

// ========== 4. 创建 Context 容器 ==========
// createContext 创建一个"全局数据洞"，给默认值（Provider注入值前用这些默认值）
const DiagnosisContext = createContext<DiagnosisContextType>({
  results: [],
  chartData: [],
  connected: false,
  latestResult: null,
});

// ========== 5. DiagnosisProvider：数据提供者 ==========
// 这是Context的"数据源"，包裹在Layout组件中，所有子页面都能读取诊断数据
// { children }: 接收被包裹的子组件（React会把Layout里<Outlet />的子页面作为children传进来）
export function DiagnosisProvider({ children }: { children: ReactNode }) {
  // --- 状态声明 ---
  // 全部用 useState 创建响应式状态：值变了React自动重渲染

  // results：存放所有接收到的诊断记录，初始化空数组
  const [results, setResults] = useState<DiagnosisResult[]>([]);
  // chartData：图表用数据，比results精简（只要时间+置信度+类别），初始化空数组
  const [chartData, setChartData] = useState<{ time: string; confidence: number; class: number }[]>([]);
  // connected：当前与AI后端的连接状态，刚开始是false（断开的）
  const [connected, setConnected] = useState(false);
  // latestResult：最新一条诊断，方便MainMonitor快速获取当前状态
  const [latestResult, setLatestResult] = useState<DiagnosisResult | null>(null);

  // wsRef：用 useRef 存放 WebSocket 实例对象
  // Ref 和 State 的区别：修改 Ref 不会触发重渲染，适合存放不需要显示在UI上的值
  const wsRef = useRef<WebSocket | null>(null);

  // --- connect 函数：建立 WebSocket 连接 ---
  // useCallback(函数, [])：第二个参数是空数组 → 只在组件首次渲染时创建此函数，之后复用同一个引用
  // 注：useCallback里的 [wsRef] 虽然没列出来，但 wsRef 是 Ref，值变了不会导致函数重建
  const connect = useCallback(() => {
    // 1. 创建 WebSocket 连接（浏览器原生API，类似打电话拨号）
    const ws = new WebSocket(WS_URL);
    // 2. 把 ws 对象存到 Ref 里，方便后续关闭连接时调用
    wsRef.current = ws;

    // 3. ws.onopen：连接成功时触发 → 把 connected 设为 true
    //    页面上的"已连接"、"未连接"状态灯就是靠这个 state 驱动的
    ws.onopen = () => setConnected(true);

    // 4. ws.onmessage：收到服务器消息时触发（每条消息 = 一次AI诊断结果）
    ws.onmessage = (event) => {
      try {
        // 4a. JSON.parse：把服务器发来的 JSON 字符串转成 JavaScript 对象
        //     例如："{\"class\":1,\"confidence\":0.95}" → { class: 1, confidence: 0.95 }
        const data: DiagnosisResult = JSON.parse(event.data);

        // 4b. 更新最新结果（MainMonitor用它判断"是否异常"来显示红色标记）
        setLatestResult(data);

        // 4c. 追加到历史记录
        //     prev 是当前旧的数组，...prev 展开旧数据，再加新数据
        //     .slice(-50)：只保留最后50条，防止数组无限增长导致内存溢出
        setResults((prev) => [...prev.slice(-50), data]);

        // 4d. 同步更新图表数据
        //     data.time?.slice(11, 19)：截取时间字符串的第11到第19个字符
        //     把 "2026-09-20T14:30:00" 变成 "14:30:00"（只要时分秒，图表横轴显示用）
        setChartData((prev) => {
          const point = {
            time: data.time?.slice(11, 19) || "",
            confidence: data.confidence || 0,
            class: data.class ?? -1,
          };
          // .slice(-60) 保留最近60个点，配合60秒的X轴范围
          return [...prev.slice(-60), point];
        });
      } catch (e) {
        // 如果 JSON 解析失败（网络错误、服务器返回乱码等），静默忽略
      }
    };

    // 5. ws.onclose：连接断开时触发
    //    设为 disconnected 状态 → 3秒后自动重连（递归调用connect自己）
    ws.onclose = () => {
      setConnected(false);
      setTimeout(connect, 3000); // 3000毫秒=3秒后重试
    };

    // 6. ws.onerror：连接出错时触发 → 主动关闭（触发 onclose → 自动重连）
    ws.onerror = () => ws.close();
  }, []);
  // ↑ 空数组 []：connect 函数只在组件第一次挂载时创建，之后永远复用同一个

  // --- useEffect：组件挂载时自动连接 WebSocket ---
  useEffect(() => {
    // 1. 调用 connect()，开始连接 AI 后端
    connect();

    // 2. return 一个清理函数：组件卸载时（如跳转到外部页面）
    //    自动关闭 WebSocket 连接，释放网络资源
    //    可选链 ?. 表示"如果 wsRef.current 是 null，就不调用 close()"
    return () => wsRef.current?.close();
  }, [connect]);
  // ↑ [connect] 依赖项：如果 connect 函数引用变了就重新执行
  //   由于 connect 被 useCallback 包裹、依赖是 []，所以 connect 引用永远不变，useEffect 只执行一次

  // --- 渲染：把数据和状态注入 Context ---
  // Provider 的 value 属性 = 所有要共享的数据
  // {children} = 所有被 <DiagnosisProvider> 包裹的子组件（即所有页面）
  // 子组件里调用 useDiagnosis() 就能拿到这个 value 里的全部数据
  return (
    <DiagnosisContext.Provider value={{ results, chartData, connected, latestResult }}>
      {children}
    </DiagnosisContext.Provider>
  );
}

// ========== 6. useDiagnosis：消费数据的快捷 Hook ==========
// 子组件（MainMonitor、AIDiagnosis等）导入并调用 useDiagnosis()，
// 就能直接拿到 { results, chartData, connected, latestResult }
export function useDiagnosis() {
  return useContext(DiagnosisContext);
}