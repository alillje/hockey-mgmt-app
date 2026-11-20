import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ConfirmationProvider } from "./components/ConfirmationDialog";
import "./styles.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfirmationProvider>
      <App />
    </ConfirmationProvider>
  </React.StrictMode>,
);
