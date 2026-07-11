import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";

import Painel from "./pages/Painel.jsx";
import Membros from "./pages/Membros.jsx";
import PerfilMembra from "./pages/PerfilMembra.jsx";
import FormularioEntrada from "./pages/FormularioEntrada.jsx";
import CafesOnline from "./pages/CafesOnline.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename="/cla-virtuosas">
      <Routes>
        <Route path="/" element={<Navigate to="/painel" replace />} />
        <Route path="/painel" element={<Painel />} />
        <Route path="/membros" element={<Membros />} />
        <Route path="/membros/:id" element={<PerfilMembra />} />
        <Route path="/entrada" element={<FormularioEntrada />} />
        <Route path="/cafes" element={<CafesOnline />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
