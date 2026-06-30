import React from "react";
import ReactDOM from "react-dom/client";
import {
  createHashRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import "./index.css";
import "@xyflow/react/dist/style.css";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { SettingsProvider } from "./settings/SettingsContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Servers from "./pages/Servers";
import ServerDetail from "./pages/ServerDetail";
import ConfigEditor from "./pages/ConfigEditor";
import Audit from "./pages/Audit";
import Settings from "./pages/Settings";
import Users from "./pages/Users";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        加载中...
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const router = createHashRouter([
  { path: "/login", element: <Login /> },
  {
    path: "/",
    element: (
      <Protected>
        <Layout />
      </Protected>
    ),
    children: [
      { index: true, element: <Servers /> },
      { path: "servers/:id", element: <ServerDetail /> },
      { path: "servers/:id/edit", element: <ConfigEditor /> },
      { path: "audit", element: <Audit /> },
      { path: "users", element: <Users /> },
      { path: "settings", element: <Settings /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SettingsProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </SettingsProvider>
  </React.StrictMode>
);
