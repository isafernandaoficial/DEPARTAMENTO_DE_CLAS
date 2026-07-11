import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Nome do repositório no GitHub. Se você criar o repositório com
// outro nome, ajuste aqui também.
const repoName = "cla-virtuosas";

export default defineConfig({
  plugins: [react()],
  base: `/${repoName}/`,
});
