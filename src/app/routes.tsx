import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { MainMonitor } from "./pages/MainMonitor";
import { Simulation } from "./pages/Simulation";
import { RealTimeData } from "./pages/RealTimeData";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: MainMonitor },
      { path: "simulation", Component: Simulation },
      { path: "data", Component: RealTimeData },
    ],
  },
]);
