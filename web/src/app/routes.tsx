import { createHashRouter, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Layout from "../components/Layout";
import Login from "../pages/Login";
import Servers from "../pages/Servers";
import ServerDetail from "../pages/ServerDetail";
import ConfigEditor from "../pages/ConfigEditor";
import Audit from "../pages/Audit";
import SettingsLayout from "../settings/SettingsLayout";
import AccountPanel from "../settings/panels/AccountPanel";
import AppearancePanel from "../settings/panels/AppearancePanel";
import EditorPanel from "../settings/panels/EditorPanel";
import Users from "../pages/Users";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        加载中...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export const router = createHashRouter([
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
      {
        path: "settings",
        element: <SettingsLayout />,
        children: [
          { index: true, element: <Navigate to="account" replace /> },
          { path: "account", element: <AccountPanel /> },
          { path: "appearance", element: <AppearancePanel /> },
          { path: "editor", element: <EditorPanel /> },
        ],
      },
    ],
  },
]);
