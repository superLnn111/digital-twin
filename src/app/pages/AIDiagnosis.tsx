// ============================================================
// AIDiagnosis.tsx — 智能诊断页面（DANN 领域自适应迁移诊断）
// ============================================================
// 功能：展示 AI 诊断结果的完整面板，包括：
//       1. 统计卡片（总诊断数、异常数、正常数、平均置信度）
//       2. 最新诊断 + DANN 模型中间状态
//       3. 有光/无光工况对比卡片
//       4. 迁移效果柱状图、t-SNE 特征分布散点图、准确率曲线
//       5. 置信度实时趋势面积图 + 诊断历史记录表
// 核心技术：Recharts（多类型图表）、useMemo（性能优化）、
//           useDiagnosis（全局诊断数据）、WebSocket 实时数据
// ============================================================

// --- 第1组：React Hooks ---
import { useMemo } from "react";
// useMemo — 缓存计算结果，仅在依赖变化时重新计算
//          这里用来缓存"平均置信度"，避免每次渲染都算一遍

// --- 第2组：图表库 Recharts（导入所有需要的图表类型） ---
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend, LineChart, Line, ScatterChart, Scatter,
} from "recharts";
// AreaChart / Area     = 面积图（填色的曲线图）→ 用于置信度趋势
// BarChart  / Bar      = 柱状图 → 用于迁移效果对比
// LineChart / Line     = 折线图 → 用于准确率趋势曲线
// ScatterChart/Scatter = 散点图 → 用于 t-SNE 特征分布
// Tooltip              = 鼠标悬停提示框
// Legend               = 图例
// ResponsiveContainer  = 自适应容器
// CartesianGrid        = 网格线
// XAxis / YAxis        = 坐标轴

// --- 第3组：图标库 ---
import {
  Brain, Activity, AlertTriangle, CheckCircle, Wifi,
  WifiOff, Clock, Zap, BarChart3, Sun, Moon, TrendingUp, Layers, Cpu,
} from "lucide-react";
// Brain = 大脑/智能图标, Activity = 活动/心跳图标
// AlertTriangle = 警告三角, CheckCircle = 打勾圆圈
// Wifi/WifiOff = 连接/断开图标, Clock = 时钟
// Zap = 闪电, BarChart3 = 柱状图, Sun/Moon = 太阳/月亮
// TrendingUp = 趋势上升, Layers = 图层, Cpu = CPU芯片

// --- 第4组：自定义 Context ---
import { useDiagnosis } from "../context/DiagnosisContext";
// useDiagnosis() — 从全局 Context 中取出诊断数据
//   返回 { results, chartData, connected, latestResult }
//   这些数据由 DiagnosisContext 通过 WebSocket 从 Python 后端接收

// ============================================================
// 第1部分：常量定义
// ============================================================

// CLASS_LABELS — 数字类别编号 → 中文名称的映射表
// Record<number, string> = key是数字，value是字符串
const CLASS_LABELS: Record<number, string> = {
  0: "叶片裂纹",
  1: "正常",
  2: "异物/挂冰",
  3: "轴承故障",
};

// CLASS_COLORS — 每个类别对应的颜色（用于圆点和进度条）
// 红=裂纹(危险), 绿=正常(安全), 黄=挂冰(警告), 橙=轴承(关注)
const CLASS_COLORS: Record<number, string> = {
  0: "#ef4444",  // 红色 — 叶片裂纹
  1: "#22c55e",  // 绿色 — 正常
  2: "#eab308",  // 黄色 — 异物/挂冰
  3: "#f97316",  // 橙色 — 轴承故障
};

// DOMAIN_METRICS — 有光/无光两种工况下的模型性能指标
// 这些是静态展示数据（实际中应从模型评估结果读取）
const DOMAIN_METRICS = {
  // 有光工况（源域）— 模型训练时的工况，性能很好
  lighted: { accuracy: 98.5, f1: 0.96, loss: 0.04, precision: 97.8, recall: 96.2 },
  // 无光工况（目标域）— 模型未训练过的新工况，通过 DANN 迁移仍有较好性能
  dark:    { accuracy: 91.2, f1: 0.89, loss: 0.21, precision: 90.5, recall: 88.7 },
};

// MIGRATION_DATA — 迁移效果对比柱状图的数据
// 展示：无域适应的无光准确率 65%（差） vs DANN迁移后 91.2%（好）
const MIGRATION_DATA = [
  { name: "无域适应", 有光: 98.5, 无光: 65.0 },
  { name: "DANN 迁移", 有光: 98.5, 无光: 91.2 },
];

// ACCURACY_TREND — 训练过程中有光/无光准确率的变化趋势（50个 epoch）
// Array.from({ length: 50 }, (_, i) => ...) 生成50条模拟数据
// i 从 0 到 49 代表 epoch 编号
// 有光：初始 85%，加随机波动 + 缓慢上升 → 最终约 98.5%
// 无光：初始 55%，加随机波动 + DANN逐渐迁移 → 最终约 91%
const ACCURACY_TREND = Array.from({ length: 50 }, (_, i) => ({
  epoch: i + 1,
  有光: 85 + Math.random() * 13.5 + (i * 0.06),    // 缓慢上升
  无光: 55 + Math.random() * 35 + (i * 0.46),       // 较快上升（迁移学习效果）
}));

// TSNE_SOURCE — t-SNE 散点图：有光源域（黄点）的特征分布（40个点）
// x 和 y 都是 -4 到 4 之间的随机坐标（模拟 t-SNE 降维后的二维分布）
const TSNE_SOURCE = Array.from({ length: 40 }, () => ({
  x: Math.random() * 8 - 4,  // -4 ~ 4
  y: Math.random() * 8 - 4,  // -4 ~ 4
}));

// TSNE_TARGET — t-SNE 散点图：无光目标域（蓝点）的特征分布（40个点）
// x 范围 -6 ~ 2（偏左），模拟目标域特征向源域靠拢的迁移效果
const TSNE_TARGET = Array.from({ length: 40 }, () => ({
  x: Math.random() * 8 - 6,  // -6 ~ 2
  y: Math.random() * 8 - 6,  // -6 ~ 2
}));

// ============================================================
// AIDiagnosis — 智能诊断页面的主组件
// ============================================================
export function AIDiagnosis() {
  // ==========================================================
  // 第2部分：从全局 Context 取数据
  // ==========================================================
  // useDiagnosis() 连接 DiagnosisContext，解构出4个数据：
  //   results      — 所有历史诊断结果数组
  //   chartData    — 置信度趋势数据（{time, confidence, class}）
  //   connected    — WebSocket 是否连接
  //   latestResult — 最新一条诊断结果（或 null）
  const { results, chartData, connected, latestResult } = useDiagnosis();

  // ==========================================================
  // 第3部分：计算派生数据
  // ==========================================================

  // 统计异常数量 — 过滤 results 中 status === "异常" 的记录
  const anomalyCount = results.filter((r) => r.status === "异常").length;

  // 统计正常数量 — 过滤 results 中 status === "正常" 的记录
  const normalCount = results.filter((r) => r.status === "正常").length;

  // 计算平均置信度（用 useMemo 缓存，results 变化时才重算）
  // useMemo 避免每次渲染都遍历整个 results 数组
  const avgConfidence = useMemo(() => {
    if (results.length === 0) return 0;  // 没数据时返回0
    // reduce — 数组累加：(累加器, 当前元素) => 累加器 + 当前元素的confidence
    return results.reduce((sum, r) => sum + (r.confidence || 0), 0) / results.length;
  }, [results]);  // ← 只有 results 变化时才重新计算

  // 最新诊断结果的详细信息
  const latestClass = latestResult?.class ?? -1;           // ?. 可选链：latestResult为null时返回undefined，?? -1 兜底为-1
  const latestLabel = latestResult?.class_name ?? CLASS_LABELS[latestClass] ?? "等待数据";  // 优先用class_name，否则查表，都没有就显示"等待数据"
  const latestColor = CLASS_COLORS[latestClass] ?? "#6b7280";  // 根据类别取颜色，没有就灰色

  // ==========================================================
  // 第4部分：return — 页面的完整布局
  // ==========================================================
  return (
    // 最外层 div — 全高可滚动，深蓝背景，内边距24px
    <div className="h-full overflow-auto bg-[#0a0e27] p-6">
      
      {/* ==================== 第1行：页面标题栏 ==================== */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          {/* 标题：紫色，带 Brain 大脑图标 */}
          <h2 className="flex items-center gap-2 text-2xl font-bold text-purple-400">
            <Brain className="h-7 w-7" /> 智能诊断 · DANN 领域自适应迁移诊断
          </h2>
          <p className="mt-1 text-sm text-purple-400/60">有光 / 无光工况下同一 DANN 模型的跨域诊断能力对比</p>
        </div>
        
        {/* 连接状态 + 最新诊断时间 */}
        <div className="flex items-center gap-2 text-sm">
          {/* 根据 connected 布尔值显示不同状态 UI */}
          {connected ? (
            <span className="flex items-center gap-1 text-green-400">
              <Wifi className="h-4 w-4" /> 已连接
            </span>
          ) : (
            <span className="flex items-center gap-1 text-red-400">
              <WifiOff className="h-4 w-4" /> 断开
            </span>
          )}
          {/* 最新诊断时间 — 用 .slice(11, 19) 截取 "HH:MM:SS" 部分 */}
          {/* latestResult 为 null 时显示 "--:--:--" */}
          <span className="text-cyan-500/50">
            <Clock className="inline h-4 w-4" /> {latestResult?.time?.slice(11, 19) || "--:--:--"}
          </span>
        </div>
      </div>

      {/* ==================== 第2行：统计卡片（4列） ==================== */}
      <div className="mb-5 grid grid-cols-4 gap-4">
        
        {/* 卡片1：总诊断数 — 紫色主题 */}
        <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4">
          <div className="flex items-center gap-2 text-sm text-purple-400/70">
            <Activity className="h-4 w-4" /> 总诊断数
          </div>
          {/* results.length — 历史诊断结果总数 */}
          <div className="mt-1 text-2xl font-bold text-purple-300">{results.length}</div>
        </div>
        
        {/* 卡片2：异常数量 — 红色主题 */}
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 text-sm text-red-400/70">
            <AlertTriangle className="h-4 w-4" /> 异常
          </div>
          <div className="mt-1 text-2xl font-bold text-red-300">{anomalyCount}</div>
        </div>
        
        {/* 卡片3：正常数量 — 绿色主题 */}
        <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
          <div className="flex items-center gap-2 text-sm text-green-400/70">
            <CheckCircle className="h-4 w-4" /> 正常
          </div>
          <div className="mt-1 text-2xl font-bold text-green-300">{normalCount}</div>
        </div>
        
        {/* 卡片4：平均置信度 — 青色主题，显示百分比 */}
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
          <div className="flex items-center gap-2 text-sm text-cyan-400/70">
            <Zap className="h-4 w-4" /> 平均置信度
          </div>
          {/* avgConfidence 是 0~1 的小数，*100 转百分比，toFixed(1) 保留1位小数 */}
          <div className="mt-1 text-2xl font-bold text-cyan-300">{(avgConfidence * 100).toFixed(1)}%</div>
        </div>
      </div>

      {/* ==================== 第3行：左/中/右三栏布局 ==================== */}
      <div className="grid grid-cols-3 gap-4">
        
        {/* ========== 左栏：最新诊断 + DANN 中间状态 ========== */}
        <div className="space-y-4">
          
          {/* --- 最新诊断卡片 --- */}
          <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-purple-400">
              <Activity className="h-4 w-4" /> 最新诊断
            </h3>
            
            {/* 诊断结果显示：颜色圆点 + 类别名 + 置信度进度条 + 百分比 */}
            <div className="flex items-center gap-3">
              {/* 类别颜色圆点 */}
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: latestColor }}
              />
              <div className="flex-1">
                {/* 类别名称 */}
                <div className="text-sm font-semibold text-purple-300">{latestLabel}</div>
                
                {/* 置信度进度条 — 底是深色条，上面覆盖带颜色的进度 */}
                <div className="mt-1 h-2 w-full rounded-full bg-purple-500/10">
                  <div
                    className="h-2 rounded-full transition-all duration-500"  // duration-500 = 动画过渡0.5秒
                    style={{
                      width: `${((latestResult?.confidence ?? 0) * 100).toFixed(0)}%`,  // 宽度=置信度百分比
                      backgroundColor: latestColor,
                    }}
                  />
                </div>
              </div>
              {/* 置信度数字百分比 */}
              <span className="text-sm font-mono text-purple-300">
                {((latestResult?.confidence ?? 0) * 100).toFixed(1)}%
              </span>
            </div>
            
            {/* 传感器数据摘要（截断显示） */}
            <div className="mt-2 text-xs text-purple-400/50 truncate">
              {latestResult?.sensor_data || "等待数据..."}
            </div>
          </div>

          {/* --- DANN 模型中间状态卡片 --- */}
          <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-purple-400">
              <Cpu className="h-4 w-4" /> DANN 模型中间状态
            </h3>
            
            {/* 4个关键指标展示 DANN 的工作流程 */}
            <div className="space-y-2 text-xs">
              {/* 1. 特征提取层：CNN1D 卷积 → 6400维向量 */}
              <div className="flex items-center justify-between">
                <span className="text-purple-400/70">特征提取层</span>
                <span className="text-purple-300 font-mono">CNN1D → 6400维</span>
              </div>
              
              {/* 2. GRL λ 参数：梯度反转层的强度参数，控制域判别器的对抗力度 */}
              <div className="flex items-center justify-between">
                <span className="text-purple-400/70">GRL λ 参数</span>
                {/* λ 通过 sigmoid 型公式计算：2/(1+e^(-5p))-1，p=0.7 是训练进度 */}
                <span className="text-purple-300 font-mono">
                  λ = {((2 / (1 + Math.exp(-5 * 0.7))) - 1).toFixed(3)}
                </span>
              </div>
              
              {/* 3. 域判别置信度：0.48 ≈ 0.5，说明域判别器分不出源域/目标域 = DANN 成功 */}
              <div className="flex items-center justify-between">
                <span className="text-purple-400/70">域判别置信度</span>
                <span className="text-purple-300 font-mono">0.48 (不可区分)</span>
              </div>
              
              {/* 4. 分类器输出：4个类别的概率分布 */}
              <div className="flex items-center justify-between">
                <span className="text-purple-400/70">分类器输出</span>
                <span className="text-purple-300 font-mono">
                  [{CLASS_LABELS[0]}: 0.02, {CLASS_LABELS[1]}: 0.91, {CLASS_LABELS[2]}: 0.05, {CLASS_LABELS[3]}: 0.02]
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ========== 中栏：工况对比 + 迁移效果 ========== */}
        <div className="space-y-4">
          
          {/* --- 有光/无光工况对比（2列） --- */}
          <div className="grid grid-cols-2 gap-3">
            
            {/* 有光工况卡片 — 黄色/太阳主题 */}
            <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
              <div className="flex items-center gap-2 text-sm text-yellow-400">
                <Sun className="h-4 w-4" /> 有光工况
              </div>
              <div className="mt-2 space-y-1 text-xs">
                {/* 用 Object.entries 不能直接展开，这里是硬编码的4个指标 */}
                <div className="flex justify-between">
                  <span className="text-yellow-400/70">准确率</span>
                  <span className="text-yellow-300 font-mono">{DOMAIN_METRICS.lighted.accuracy}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-yellow-400/70">F1 Score</span>
                  <span className="text-yellow-300 font-mono">{DOMAIN_METRICS.lighted.f1}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-yellow-400/70">精确率</span>
                  <span className="text-yellow-300 font-mono">{DOMAIN_METRICS.lighted.precision}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-yellow-400/70">损失值</span>
                  <span className="text-yellow-300 font-mono">{DOMAIN_METRICS.lighted.loss}</span>
                </div>
              </div>
            </div>
            
            {/* 无光工况卡片 — 蓝色/月亮主题 */}
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
              <div className="flex items-center gap-2 text-sm text-blue-400">
                <Moon className="h-4 w-4" /> 无光工况
              </div>
              <div className="mt-2 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-blue-400/70">准确率</span>
                  <span className="text-blue-300 font-mono">{DOMAIN_METRICS.dark.accuracy}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-400/70">F1 Score</span>
                  <span className="text-blue-300 font-mono">{DOMAIN_METRICS.dark.f1}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-400/70">精确率</span>
                  <span className="text-blue-300 font-mono">{DOMAIN_METRICS.dark.precision}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-400/70">损失值</span>
                  <span className="text-blue-300 font-mono">{DOMAIN_METRICS.dark.loss}</span>
                </div>
              </div>
            </div>
          </div>

          {/* --- 迁移效果对比柱状图 --- */}
          <div className="rounded-lg border border-cyan-500/20 bg-[#0d1229]/50 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-cyan-400">
              <BarChart3 className="h-4 w-4" /> 迁移效果对比
            </h3>
            
            {/* ResponsiveContainer — 自适应父容器宽高，height={160} 指定高度 */}
            <ResponsiveContainer width="100%" height={160}>
              {/* BarChart — 柱状图，X轴=分组名，两组柱子=有光和无光 */}
              <BarChart data={MIGRATION_DATA}>
                {/* 网格线 — 青色虚线，透明度0.1 */}
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(6,182,212,0.1)" />
                {/* X轴 — 显示 name 字段（"无域适应"/"DANN 迁移"） */}
                <XAxis dataKey="name" stroke="#06b6d4" style={{ fontSize: 9 }} />
                {/* Y轴 — domain={[0,100]} 固定范围0~100 */}
                <YAxis domain={[0, 100]} stroke="#06b6d4" style={{ fontSize: 9 }} />
                {/* 提示框样式 */}
                <Tooltip
                  contentStyle={{ backgroundColor: "#0d1229", border: "1px solid rgba(6,182,212,0.3)", borderRadius: 8 }}
                  labelStyle={{ color: "#06b6d4" }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {/* 黄色柱子 = 有光准确率，蓝色柱子 = 无光准确率 */}
                {/* radius={[4,4,0,0]} — 柱子顶部圆角4px */}
                <Bar dataKey="有光" fill="#eab308" radius={[4, 4, 0, 0]} />
                <Bar dataKey="无光" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ========== 右栏：t-SNE + 准确率趋势 ========== */}
        <div className="space-y-4">
          
          {/* --- t-SNE 特征分布散点图 --- */}
          <div className="rounded-lg border border-cyan-500/20 bg-[#0d1229]/50 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-cyan-400">
              <Layers className="h-4 w-4" /> t-SNE 特征分布
            </h3>
            
            <ResponsiveContainer width="100%" height={160}>
              {/* ScatterChart — 散点图，黄色=源域样本，蓝色=目标域样本 */}
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(6,182,212,0.1)" />
                {/* hide — 隐藏坐标轴（散点图重在分布形态，不需要具体刻度） */}
                <XAxis dataKey="x" stroke="#06b6d4" style={{ fontSize: 8 }} hide />
                <YAxis dataKey="y" stroke="#06b6d4" style={{ fontSize: 8 }} hide />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0d1229", border: "1px solid rgba(6,182,212,0.3)", borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {/* Scatter — name=图例标签, data=数据源, fill=颜色 */}
                <Scatter name="有光源域" data={TSNE_SOURCE} fill="#eab308" />
                <Scatter name="无光目标域" data={TSNE_TARGET} fill="#3b82f6" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* --- 有光/无光准确率对比折线图 --- */}
          <div className="rounded-lg border border-cyan-500/20 bg-[#0d1229]/50 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-cyan-400">
              <TrendingUp className="h-4 w-4" /> 有光/无光 准确率对比曲线
            </h3>
            
            <ResponsiveContainer width="100%" height={160}>
              {/* LineChart — 双折线对比图，X轴=epoch，Y轴=准确率 */}
              <LineChart data={ACCURACY_TREND}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(6,182,212,0.1)" />
                <XAxis dataKey="epoch" stroke="#06b6d4" style={{ fontSize: 8 }} />
                {/* domain={[50,100]} — Y轴固定50~100范围（准确率通常不低于50%） */}
                <YAxis domain={[50, 100]} stroke="#06b6d4" style={{ fontSize: 8 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0d1229", border: "1px solid rgba(6,182,212,0.3)", borderRadius: 8 }}
                  labelStyle={{ color: "#06b6d4" }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {/* dot={false} — 不显示数据点，50个点太密集 */}
                {/* strokeWidth={2} — 线宽2px */}
                <Line type="monotone" dataKey="有光" stroke="#eab308" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="无光" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ==================== 第4行：置信度趋势 + 诊断历史（2列） ==================== */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        
        {/* --- 左侧：置信度实时趋势面积图 --- */}
        <div className="rounded-lg border border-cyan-500/20 bg-[#0d1229]/50 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-cyan-400">
            <TrendingUp className="h-4 w-4" /> 置信度实时趋势
          </h3>
          
          <ResponsiveContainer width="100%" height={180}>
            {/* AreaChart — 面积图，数据源是 Context 中的 chartData（WebSocket实时推送） */}
            <AreaChart data={chartData}>
              {/* defs — SVG 渐变定义，给面积图底部做淡出效果 */}
              <defs>
                {/* linearGradient — 线性渐变，从上到下 */}
                <linearGradient id="confGradient" x1="0" y1="0" x2="0" y2="1">
                  {/* 顶部5%处 — 青色30%透明度 */}
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                  {/* 底部95%处 — 青色完全透明 */}
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(6,182,212,0.1)" />
              <XAxis dataKey="time" stroke="#06b6d4" style={{ fontSize: 8 }} />
              {/* domain={[0, 1]} — 置信度在0~1之间 */}
              <YAxis domain={[0, 1]} stroke="#06b6d4" style={{ fontSize: 8 }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0d1229", border: "1px solid rgba(6,182,212,0.3)", borderRadius: 8 }}
                labelStyle={{ color: "#06b6d4" }}
              />
              {/* Area — 填充区域，dataKey="confidence" 取置信度字段 */}
              {/* fill="url(#confGradient)" — 引用上面定义的渐变 */}
              <Area
                type="monotone"
                dataKey="confidence"
                stroke="#06b6d4"
                fill="url(#confGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* --- 右侧：诊断历史记录表格 --- */}
        <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-purple-400">
            <Clock className="h-4 w-4" /> 诊断历史记录
          </h3>
          
          {/* max-h-[180px] — 最大高度180px，overflow-auto — 超出滚动 */}
          <div className="max-h-[180px] overflow-auto">
            <table className="w-full text-xs">
              {/* 表头 */}
              <thead>
                <tr className="border-b border-purple-500/20 text-left text-purple-400/70">
                  <th className="pb-2">时间</th>
                  <th className="pb-2">状态</th>
                  <th className="pb-2">类别</th>
                  <th className="pb-2">置信度</th>
                  <th className="pb-2">传感器</th>
                </tr>
              </thead>
              
              {/* 表体 — 遍历 results，反转（最新的在上面），只取前20条 */}
              <tbody>
                {/* [...results].reverse() — 复制一份再反转（避免修改原数组） */}
                {/* .slice(0, 20) — 只取前20条显示 */}
                {[...results].reverse().slice(0, 20).map((r, i) => (
                  <tr key={i} className="border-b border-purple-500/10">
                    {/* 时间 — 用 .slice(11,19) 截取 HH:MM:SS */}
                    <td className="py-2 text-cyan-400/70">{r.time?.slice(11, 19) || "--:--:--"}</td>
                    
                    {/* 状态 — 异常=红色，正常=绿色 */}
                    <td className="py-2">
                      <span className={r.status === "异常" ? "text-red-400" : "text-green-400"}>
                        {r.status}
                      </span>
                    </td>
                    
                    {/* 类别 — 优先用 class_name，没有就用 CLASS_LABELS 映射 */}
                    <td className="py-2 text-cyan-300">
                      {r.class_name ?? CLASS_LABELS[r.class] ?? `未知(${r.class})`}
                    </td>
                    
                    {/* 置信度 — 百分比显示 */}
                    <td className="py-2 text-cyan-300">
                      {(r.confidence * 100).toFixed(1)}%
                    </td>
                    
                    {/* 传感器数据 — 截断显示 */}
                    <td className="py-2 text-cyan-500/50 max-w-[120px] truncate">
                      {r.sensor_data}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}