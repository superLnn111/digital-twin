
  import { createRoot } from "react-dom/client";   // ← 新增：把 <App /> 挂载到 #root DOM 节点
  import App from "./app/App.tsx";
  import "./styles/index.css";      //引入全局样式 

  createRoot(document.getElementById("root")!).render(<App />);
  