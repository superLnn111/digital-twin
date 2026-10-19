import { RouterProvider } from "react-router";
import { router } from "./routes";

//根组件
//把 react-router 的路由器注入整个应用。

export default function App() {
  return <RouterProvider router={router} />;
}