import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { MainMonitor } from "./pages/MainMonitor";
import { Simulation } from "./pages/Simulation";
import { RealTimeData } from "./pages/RealTimeData";
import { AIDiagnosis } from "./pages/AIDiagnosis"; //导入ai诊断模型

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: MainMonitor },
      { path: "simulation", Component: Simulation },
      { path: "data", Component: RealTimeData },
      { path: "ai", Component: AIDiagnosis }, //ai诊断模型路由
    ],
  },
]);
