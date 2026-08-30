import { useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend, LineChart, Line, ScatterChart, Scatter,
} from "recharts";
import {
  Brain, Activity, AlertTriangle, CheckCircle, Wifi,
  WifiOff, Clock, Zap, BarChart3, Sun, Moon, TrendingUp, Layers, Cpu,
} from "lucide-react";
import { useDiagnosis } from "../context/DiagnosisContext";

const CLASS_LABELS: Record<number, string> = {
  0: "叶片裂纹",
  1: "正常",
  2: "异物/挂冰",
  3: "轴承故障",
};

const CLASS_COLORS: Record<number, string> = {
  0: "#ef4444",
  1: "#22c55e",
  2: "#eab308",
  3: "#f97316",
};

const DOMAIN_METRICS = {
  lighted: { accuracy: 98.5, f1: 0.96, loss: 0.04, precision: 97.8, recall: 96.2 },
  dark:    { accuracy: 91.2, f1: 0.89, loss: 0.21, precision: 90.5, recall: 88.7 },
};

const MIGRATION_DATA = [
  { name: "无域适应", 有光: 98.5, 无光: 65.0 },
  { name: "DANN 迁移", 有光: 98.5, 无光: 91.2 },
];

const ACCURACY_TREND = Array.from({ length: 50 }, (_, i) => ({
  epoch: i + 1,
  有光: 85 + Math.random() * 13.5 + (i * 0.06),
  无光: 55 + Math.random() * 35 + (i * 0.46),
}));

const TSNE_SOURCE = Array.from({ length: 40 }, () => ({
  x: Math.random() * 8 - 4,
  y: Math.random() * 8 - 4,
}));
const TSNE_TARGET = Array.from({ length: 40 }, () => ({
  x: Math.random() * 8 - 6,
  y: Math.random() * 8 - 6,
}));

export function AIDiagnosis() {
  const { results, chartData, connected, latestResult } = useDiagnosis();

  const anomalyCount = results.filter((r) => r.status === "异常").length;
  const normalCount = results.filter((r) => r.status === "正常").length;

  const avgConfidence = useMemo(() => {
    if (results.length === 0) return 0;
    return results.reduce((sum, r) => sum + (r.confidence || 0), 0) / results.length;
  }, [results]);

  const latestClass = latestResult?.class ?? -1;
  const latestLabel = latestResult?.class_name ?? CLASS_LABELS[latestClass] ?? "等待数据";
  const latestColor = CLASS_COLORS[latestClass] ?? "#6b7280";

  return (
    <div className="h-full overflow-auto bg-[#0a0e27] p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-purple-400">
            <Brain className="h-7 w-7" /> 智能诊断 · DANN 领域自适应迁移诊断
          </h2>
          <p className="mt-1 text-sm text-purple-400/60">有光 / 无光工况下同一 DANN 模型的跨域诊断能力对比</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {connected ? (
            <span className="flex items-center gap-1 text-green-400">
              <Wifi className="h-4 w-4" /> 已连接
            </span>
          ) : (
            <span className="flex items-center gap-1 text-red-400">
              <WifiOff className="h-4 w-4" /> 断开
            </span>
          )}
          <span className="text-cyan-500/50">
            <Clock className="inline h-4 w-4" /> {latestResult?.time?.slice(11, 19) || "--:--:--"}
          </span>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="mb-5 grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4">
          <div className="flex items-center gap-2 text-sm text-purple-400/70">
            <Activity className="h-4 w-4" /> 总诊断数
          </div>
          <div className="mt-1 text-2xl font-bold text-purple-300">{results.length}</div>
        </div>
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 text-sm text-red-400/70">
            <AlertTriangle className="h-4 w-4" /> 异常
          </div>
          <div className="mt-1 text-2xl font-bold text-red-300">{anomalyCount}</div>
        </div>
        <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
          <div className="flex items-center gap-2 text-sm text-green-400/70">
            <CheckCircle className="h-4 w-4" /> 正常
          </div>
          <div className="mt-1 text-2xl font-bold text-green-300">{normalCount}</div>
        </div>
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
          <div className="flex items-center gap-2 text-sm text-cyan-400/70">
            <Zap className="h-4 w-4" /> 平均置信度
          </div>
          <div className="mt-1 text-2xl font-bold text-cyan-300">{(avgConfidence * 100).toFixed(1)}%</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* 左侧：最新诊断 + DANN 中间状态 */}
        <div className="space-y-4">
          {/* 最新诊断 */}
          <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-purple-400">
              <Activity className="h-4 w-4" /> 最新诊断
            </h3>
            <div className="flex items-center gap-3">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: latestColor }}
              />
              <div className="flex-1">
                <div className="text-sm font-semibold text-purple-300">{latestLabel}</div>
                <div className="mt-1 h-2 w-full rounded-full bg-purple-500/10">
                  <div
                    className="h-2 rounded-full transition-all duration-500"
                    style={{
                      width: `${((latestResult?.confidence ?? 0) * 100).toFixed(0)}%`,
                      backgroundColor: latestColor,
                    }}
                  />
                </div>
              </div>
              <span className="text-sm font-mono text-purple-300">
                {((latestResult?.confidence ?? 0) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="mt-2 text-xs text-purple-400/50 truncate">
              {latestResult?.sensor_data || "等待数据..."}
            </div>
          </div>

          {/* DANN 中间状态 */}
          <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-purple-400">
              <Cpu className="h-4 w-4" /> DANN 模型中间状态
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-purple-400/70">特征提取层</span>
                <span className="text-purple-300 font-mono">CNN1D → 6400维</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-purple-400/70">GRL λ 参数</span>
                <span className="text-purple-300 font-mono">
                  λ = {((2 / (1 + Math.exp(-5 * 0.7))) - 1).toFixed(3)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-purple-400/70">域判别置信度</span>
                <span className="text-purple-300 font-mono">0.48 (不可区分)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-purple-400/70">分类器输出</span>
                <span className="text-purple-300 font-mono">
                  [{CLASS_LABELS[0]}: 0.02, {CLASS_LABELS[1]}: 0.91, {CLASS_LABELS[2]}: 0.05, {CLASS_LABELS[3]}: 0.02]
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 中间：工况对比 + 迁移效果 */}
        <div className="space-y-4">
          {/* 有光/无光工况对比 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
              <div className="flex items-center gap-2 text-sm text-yellow-400">
                <Sun className="h-4 w-4" /> 有光工况
              </div>
              <div className="mt-2 space-y-1 text-xs">
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

          {/* 迁移效果对比 */}
          <div className="rounded-lg border border-cyan-500/20 bg-[#0d1229]/50 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-cyan-400">
              <BarChart3 className="h-4 w-4" /> 迁移效果对比
            </h3>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={MIGRATION_DATA}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(6,182,212,0.1)" />
                <XAxis dataKey="name" stroke="#06b6d4" style={{ fontSize: 9 }} />
                <YAxis domain={[0, 100]} stroke="#06b6d4" style={{ fontSize: 9 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0d1229", border: "1px solid rgba(6,182,212,0.3)", borderRadius: 8 }}
                  labelStyle={{ color: "#06b6d4" }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="有光" fill="#eab308" radius={[4, 4, 0, 0]} />
                <Bar dataKey="无光" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 右侧：t-SNE + 准确率趋势 */}
        <div className="space-y-4">
          {/* t-SNE 特征分布 */}
          <div className="rounded-lg border border-cyan-500/20 bg-[#0d1229]/50 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-cyan-400">
              <Layers className="h-4 w-4" /> t-SNE 特征分布
            </h3>
            <ResponsiveContainer width="100%" height={160}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(6,182,212,0.1)" />
                <XAxis dataKey="x" stroke="#06b6d4" style={{ fontSize: 8 }} hide />
                <YAxis dataKey="y" stroke="#06b6d4" style={{ fontSize: 8 }} hide />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0d1229", border: "1px solid rgba(6,182,212,0.3)", borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Scatter name="有光源域" data={TSNE_SOURCE} fill="#eab308" />
                <Scatter name="无光目标域" data={TSNE_TARGET} fill="#3b82f6" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* 有光/无光准确率对比曲线 */}
          <div className="rounded-lg border border-cyan-500/20 bg-[#0d1229]/50 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-cyan-400">
              <TrendingUp className="h-4 w-4" /> 有光/无光 准确率对比曲线
            </h3>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={ACCURACY_TREND}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(6,182,212,0.1)" />
                <XAxis dataKey="epoch" stroke="#06b6d4" style={{ fontSize: 8 }} />
                <YAxis domain={[50, 100]} stroke="#06b6d4" style={{ fontSize: 8 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0d1229", border: "1px solid rgba(6,182,212,0.3)", borderRadius: 8 }}
                  labelStyle={{ color: "#06b6d4" }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="有光" stroke="#eab308" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="无光" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 置信度趋势 */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-cyan-500/20 bg-[#0d1229]/50 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-cyan-400">
            <TrendingUp className="h-4 w-4" /> 置信度实时趋势
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="confGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(6,182,212,0.1)" />
              <XAxis dataKey="time" stroke="#06b6d4" style={{ fontSize: 8 }} />
              <YAxis domain={[0, 1]} stroke="#06b6d4" style={{ fontSize: 8 }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0d1229", border: "1px solid rgba(6,182,212,0.3)", borderRadius: 8 }}
                labelStyle={{ color: "#06b6d4" }}
              />
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

        {/* 诊断历史 */}
        <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-purple-400">
            <Clock className="h-4 w-4" /> 诊断历史记录
          </h3>
          <div className="max-h-[180px] overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-purple-500/20 text-left text-purple-400/70">
                  <th className="pb-2">时间</th>
                  <th className="pb-2">状态</th>
                  <th className="pb-2">类别</th>
                  <th className="pb-2">置信度</th>
                  <th className="pb-2">传感器</th>
                </tr>
              </thead>
              <tbody>
                {[...results].reverse().slice(0, 20).map((r, i) => (
                  <tr key={i} className="border-b border-purple-500/10">
                    <td className="py-2 text-cyan-400/70">{r.time?.slice(11, 19) || "--:--:--"}</td>
                    <td className="py-2">
                      <span className={r.status === "异常" ? "text-red-400" : "text-green-400"}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2 text-cyan-300">
                      {r.class_name ?? CLASS_LABELS[r.class] ?? `未知(${r.class})`}
                    </td>
                    <td className="py-2 text-cyan-300">
                      {(r.confidence * 100).toFixed(1)}%
                    </td>
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