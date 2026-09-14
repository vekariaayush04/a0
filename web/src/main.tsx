import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// Library stylesheets are imported here, once, before our own tokens so that
// styles.css always wins. @xyflow/react's CSS is loaded up front so the Tree
// rebuild has nothing to set up; recharts and motion need no stylesheet.
import "@xyflow/react/dist/style.css";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root not found");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
