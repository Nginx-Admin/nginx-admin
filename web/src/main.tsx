import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import "./index.css";
import "@xyflow/react/dist/style.css";
import { AuthProvider } from "./auth/AuthContext";
import { SettingsProvider } from "./settings/SettingsContext";
import { router } from "./app/routes";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SettingsProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </SettingsProvider>
  </React.StrictMode>
);
