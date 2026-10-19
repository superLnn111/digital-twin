// ============================================================
// CameraFeed.tsx — 监控摄像头实时画面组件
// ============================================================
// 功能：通过 MJPEG 流展示树莓派摄像头实时画面
//       支持连接状态检测（loading/connected/disconnected）
//       无视频时显示占位提示，方便排障
// 数据流：树莓派USB摄像头 → mjpg-streamer → 蒲公英4G CPE → 服务器 → 浏览器
// ============================================================

import { useEffect, useState, useRef, useCallback } from "react";
import { Camera, Maximize, Minimize, RefreshCw, AlertCircle, Wifi, WifiOff, Settings } from "lucide-react";

// ========== Props 类型 ==========
interface CameraFeedProps {
  streamUrl?: string;
  title?: string;
}

// ========== 视频流状态枚举 ==========
type StreamStatus = "loading" | "connected" | "disconnected";

export function CameraFeed({
  streamUrl = "http://8.138.129.114:8080/?action=stream",
  title = "监控摄像头实时画面",
}: CameraFeedProps) {
  // ----- 状态 -----
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("loading");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [customUrl, setCustomUrl] = useState(streamUrl);
  const [activeUrl, setActiveUrl] = useState(streamUrl);

  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ========== 连接检测：onLoad / onError ==========
  const handleLoad = useCallback(() => {
    lastFrameTimeRef.current = Date.now();
    setStreamStatus("connected");
    setErrorMessage("");
  }, []);

  const handleError = useCallback(() => {
    setStreamStatus("disconnected");
    setErrorMessage("无法连接到视频流，请确认摄像头已启动且CPE网络正常");
  }, []);

  // ========== 心跳检测：确保流持续更新（非静止帧） ==========
  useEffect(() => {
    if (streamStatus !== "connected") return;

    heartbeatTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastFrameTimeRef.current;
      if (elapsed > 10000) {
        setStreamStatus("disconnected");
        setErrorMessage("视频流已中断（超过10秒未收到新帧）");
      }
    }, 5000);

    return () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    };
  }, [streamStatus]);

  // ========== 手动重连 ==========
  const handleReconnect = useCallback(() => {
    setStreamStatus("loading");
    setErrorMessage("");

    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);

    retryTimerRef.current = setTimeout(() => {
      if (imgRef.current) {
        imgRef.current.src = activeUrl + "&_t=" + Date.now();
      }
    }, 500);
  }, [activeUrl]);

  // ========== 应用自定义URL ==========
  const handleApplyUrl = useCallback(() => {
    const url = customUrl.trim();
    if (!url) return;
    setActiveUrl(url);
    setShowUrlInput(false);
    setStreamStatus("loading");
    setErrorMessage("");
  }, [customUrl]);

  // ========== 全屏切换 ==========
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  // ========== 监听全屏退出（Esc键） ==========
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ========== 清理 ==========
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    };
  }, []);

  // ========== 渲染 ==========
  return (
    <div
      ref={containerRef}
      className={`rounded-lg border bg-[#0d1229]/50 overflow-hidden transition-all ${
        isFullscreen
          ? "fixed inset-0 z-50 rounded-none border-0 bg-black"
          : "border-cyan-500/20"
      }`}
    >
      {/* ===== 标题栏 ===== */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/10 bg-[#0a0e27]/60">
        {/* 左侧：图标 + 标题 + 连接状态 */}
        <div className="flex items-center gap-3">
          <Camera className="h-5 w-5 text-cyan-400" />
          <span className="text-sm font-semibold text-cyan-400">{title}</span>

          {/* 连接状态指示器 */}
          <div className="flex items-center text-xs px-2 py-0.5 rounded border border-cyan-500/20 bg-[#0d1229]/80">
            {streamStatus === "loading" && (
              <span className="flex items-center gap-1 text-yellow-400">
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                检测中...
              </span>
            )}
            {streamStatus === "connected" && (
              <span className="flex items-center gap-1 text-green-400">
                <Wifi className="h-3 w-3" />
                视频流已连接
              </span>
            )}
            {streamStatus === "disconnected" && (
              <span className="flex items-center gap-1 text-red-400">
                <WifiOff className="h-3 w-3" />
                未连接
              </span>
            )}
          </div>
        </div>

        {/* 右侧：操作按钮 */}
        <div className="flex items-center gap-2">
          {/* URL配置按钮 */}
          <button
            onClick={() => setShowUrlInput(!showUrlInput)}
            className="flex items-center text-xs bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 px-2 py-1 rounded transition-colors border border-cyan-500/30"
            title="配置视频源地址"
          >
            <Settings className="h-3 w-3 mr-1" />
            {showUrlInput ? "取消" : "配置"}
          </button>

          {/* 重连按钮 */}
          {streamStatus !== "loading" && (
            <button
              onClick={handleReconnect}
              className="flex items-center text-xs bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 px-2 py-1 rounded transition-colors border border-cyan-500/30"
              title="重新连接视频流"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${streamStatus === "loading" ? "animate-spin" : ""}`} />
              重连
            </button>
          )}

          {/* 全屏按钮 */}
          <button
            onClick={toggleFullscreen}
            className="flex items-center text-xs bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 px-2 py-1 rounded transition-colors border border-cyan-500/30"
            title={isFullscreen ? "退出全屏" : "全屏"}
          >
            {isFullscreen ? (
              <Minimize className="h-3 w-3" />
            ) : (
              <Maximize className="h-3 w-3" />
            )}
          </button>
        </div>
      </div>

      {/* ===== URL 输入栏（展开时显示） ===== */}
      {showUrlInput && (
        <div className="flex items-center gap-2 px-4 py-2 bg-[#0a0e27]/80 border-b border-cyan-500/10">
          <input
            type="text"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="输入MJPEG视频流地址，如 http://IP:8080/?action=stream"
            className="flex-1 bg-[#0d1229] border border-cyan-500/30 rounded px-3 py-1.5 text-xs text-cyan-400 placeholder:text-cyan-500/30 focus:outline-none focus:border-cyan-400"
            onKeyDown={(e) => e.key === "Enter" && handleApplyUrl()}
          />
          <button
            onClick={handleApplyUrl}
            className="text-xs bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 px-3 py-1.5 rounded transition-colors border border-cyan-500/30"
          >
            应用
          </button>
        </div>
      )}

      {/* ===== 视频画面区域 ===== */}
      <div
        className={`relative ${
          isFullscreen ? "flex-1 h-[calc(100vh-53px)]" : "h-[360px]"
        } bg-black`}
      >
        {/* MJPEG 流 img标签 */}
        <img
          ref={imgRef}
          src={activeUrl}
          alt="监控摄像头画面"
          onLoad={handleLoad}
          onError={handleError}
          className={`w-full h-full object-contain ${
            streamStatus === "connected" ? "block" : "hidden"
          }`}
        />

        {/* 加载中 / 断连占位 */}
        {(streamStatus === "loading" || streamStatus === "disconnected") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#030614] gap-4">
            {/* 加载状态 */}
            {streamStatus === "loading" && (
              <>
                <div className="h-12 w-12 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
                <span className="text-cyan-400 text-sm font-mono">正在检测视频流...</span>
                <span className="text-cyan-500/50 text-xs font-mono">{activeUrl}</span>
              </>
            )}

            {/* 断连状态 */}
            {streamStatus === "disconnected" && (
              <>
                <AlertCircle className="h-12 w-12 text-red-400/60" />
                <span className="text-red-400 text-sm font-mono">视频流未连接</span>
                {errorMessage && (
                  <span className="text-cyan-500/50 text-xs text-center max-w-md leading-relaxed px-4">
                    {errorMessage}
                  </span>
                )}
                <div className="flex gap-3 mt-2">
                  <button
                    onClick={handleReconnect}
                    className="flex items-center text-xs bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 px-4 py-2 rounded transition-colors border border-cyan-500/30"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" /> 重新连接
                  </button>
                  <button
                    onClick={() => setShowUrlInput(true)}
                    className="flex items-center text-xs bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 px-4 py-2 rounded transition-colors border border-cyan-500/30"
                  >
                    <Settings className="h-3 w-3 mr-1" /> 配置地址
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ===== 底部状态栏 ===== */}
      {streamStatus === "connected" && (
        <div className="flex items-center justify-between px-4 py-1.5 border-t border-cyan-500/10 bg-[#0a0e27]/60 text-xs text-cyan-500/50 font-mono">
          <span>源地址: {activeUrl}</span>
          <span>协议: MJPEG</span>
        </div>
      )}
    </div>
  );
}