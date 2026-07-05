import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installRouter } from "./router";
import "./styles.css";

installRouter();
createRoot(document.getElementById("root")!).render(<App />);
