import { useEffect, useRef, useState, useCallback } from "react";

interface DefectInfo {
  bladeIndex: number;
  type: string;
}

interface AIAlert {
  time: string;
  class: number;
  confidence: number;
  status: string;
  sensor_data: string;
  class_name?: string;
}

interface Props {
  defectMap?: Record<number, DefectInfo>;
  monitoringData?: {
    windSpeed: string | null;
    temperature: number | null;
    humidity: number | null;
    accelList: (number | null)[];
  };
  aiAlerts?: AIAlert[];
}

export function CampusSandboxViewer({ defectMap, monitoringData, aiAlerts }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const pendingDefectRef = useRef<Record<number, DefectInfo> | null>(null);

  const postToSandbox = useCallback((data: Record<string, unknown>) => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const win = iframe.contentWindow;
    if (!win) return;
    win.postMessage({ source: "fan-monitor", ...data }, "*");
  }, []);

  const sendDefects = useCallback((map: Record<number, DefectInfo> | null) => {
    if (!map || Object.keys(map).length === 0) {
      postToSandbox({ type: "turbine-defect-clear" });
      return;
    }
    Object.entries(map).forEach(([key, info]) => {
      postToSandbox({
        type: "turbine-defect",
        turbineIndex: Number(key),
        bladeIndex: info.bladeIndex,
        defectType: info.type,
      });
    });
  }, [postToSandbox]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (
        e.data &&
        e.data.source === "campus-sandbox" &&
        e.data.type === "ready"
      ) {
        setReady(true);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    if (ready) {
      sendDefects(defectMap ?? null);
    } else {
      pendingDefectRef.current = defectMap ?? null;
    }
  }, [defectMap, ready, sendDefects]);

  useEffect(() => {
    if (ready && pendingDefectRef.current) {
      sendDefects(pendingDefectRef.current);
      pendingDefectRef.current = null;
    }
  }, [ready, sendDefects]);

  useEffect(() => {
    if (ready && monitoringData) {
      postToSandbox({
        type: "update-monitoring",
        windSpeed: monitoringData.windSpeed,
        temperature: monitoringData.temperature,
        humidity: monitoringData.humidity,
        accelList: monitoringData.accelList,
      });
    }
  }, [monitoringData, ready, postToSandbox]);

  useEffect(() => {
    if (ready && aiAlerts) {
      postToSandbox({
        type: "update-ai-alerts",
        alerts: aiAlerts.map((a) => ({
          class_name: a.class_name || ("未知故障" as string),
          confidence: a.confidence,
          time: a.time,
        })),
      });
    }
  }, [aiAlerts, ready, postToSandbox]);

  return (
    <div className="relative w-full h-full">
      <iframe
        ref={iframeRef}
        src="/campus-sandbox.html"
        className="w-full h-full border-none"
        title="中山大学珠海校区 3D 沙盘"
      />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0f251d] z-10">
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-[#27684f] border-t-transparent" />
            <span className="text-[#47a87a] text-sm font-mono">
              加载 珠海校区 3D 沙盘...
            </span>
          </div>
        </div>
      )}
    </div>
  );
}