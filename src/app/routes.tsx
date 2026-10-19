//路由配置，定义所有页面路由。所有页面共用 <Layout /> 外壳，子路由通过 <Outlet /> 渲染：

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
