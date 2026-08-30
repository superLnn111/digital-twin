import { createContext, useContext, useEffect, useState, useRef, useCallback, type ReactNode } from "react";

export interface DiagnosisResult {
  time: string;
  sensor_data: string;
  class: number;
  confidence: number;
  status: string;
  class_name?: string;
  error?: string;
}

interface DiagnosisContextType {
  results: DiagnosisResult[];
  chartData: { time: string; confidence: number; class: number }[];
  connected: boolean;
  latestResult: DiagnosisResult | null;
}

const WS_URL = "ws://8.138.129.114:8000/ws";

const DiagnosisContext = createContext<DiagnosisContextType>({
  results: [],
  chartData: [],
  connected: false,
  latestResult: null,
});

export function DiagnosisProvider({ children }: { children: ReactNode }) {
  const [results, setResults] = useState<DiagnosisResult[]>([]);
  const [chartData, setChartData] = useState<{ time: string; confidence: number; class: number }[]>([]);
  const [connected, setConnected] = useState(false);
  const [latestResult, setLatestResult] = useState<DiagnosisResult | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      try {
        const data: DiagnosisResult = JSON.parse(event.data);
        setLatestResult(data);
        setResults((prev) => [...prev.slice(-50), data]);
        setChartData((prev) => {
          const point = {
            time: data.time?.slice(11, 19) || "",
            confidence: data.confidence || 0,
            class: data.class ?? -1,
          };
          return [...prev.slice(-60), point];
        });
      } catch (e) {
        /* ignore */
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  return (
    <DiagnosisContext.Provider value={{ results, chartData, connected, latestResult }}>
      {children}
    </DiagnosisContext.Provider>
  );
}

export function useDiagnosis() {
  return useContext(DiagnosisContext);
}