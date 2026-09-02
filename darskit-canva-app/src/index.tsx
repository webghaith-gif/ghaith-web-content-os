import "@canva/app-ui-kit/styles.css";
import { AppUiProvider } from "@canva/app-ui-kit";
import type { DesignEditorIntent } from "@canva/intents/design";
import { prepareDesignEditor } from "@canva/intents/design";
import { createRoot } from "react-dom/client";
import { App } from "./app";

function render(){ createRoot(document.getElementById("root") as Element).render(<AppUiProvider><App/></AppUiProvider>); }
const designEditor:DesignEditorIntent={render};
prepareDesignEditor(designEditor);
if(module.hot) module.hot.accept("./app",render);
