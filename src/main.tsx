import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { pruneExpired } from "./api/persistentCache";
import "./styles.css";

void pruneExpired();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
