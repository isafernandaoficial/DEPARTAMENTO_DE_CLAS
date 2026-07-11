import React from "react";
import { NavLink } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { p, serif } from "../theme.js";

const links = [
  { to: "/painel", label: "Painel" },
  { to: "/membros", label: "Membros" },
  { to: "/entrada", label: "Formulário de Entrada" },
  { to: "/cafes", label: "Cafés Online" },
];

export default function Sidebar() {
  return (
    <aside
      className="w-60 shrink-0 hidden md:flex flex-col py-8 px-5"
      style={{ backgroundColor: p.wineDeep }}
    >
      <div className="flex items-center gap-2 mb-10 px-1">
        <Sparkles size={18} color={p.gold} />
        <span className="text-lg tracking-wide" style={{ color: p.ivory, fontFamily: serif }}>
          Clã Virtuosas
        </span>
      </div>
      <nav className="flex flex-col gap-1">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            className="text-left px-3 py-2.5 rounded-lg text-sm transition-colors"
            style={({ isActive }) => ({
              backgroundColor: isActive ? "rgba(199,146,75,0.15)" : "transparent",
              color: isActive ? p.gold : "rgba(250,245,238,0.7)",
              fontWeight: isActive ? 600 : 400,
            })}
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto pt-8 px-1">
        <p className="text-[11px] leading-relaxed" style={{ color: "rgba(250,245,238,0.45)" }}>
          Get Church Global
          <br />
          Núcleo: Isa & Aline
        </p>
      </div>
    </aside>
  );
}
