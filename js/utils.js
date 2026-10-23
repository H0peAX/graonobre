/* Funções auxiliares compartilhadas (loja e admin) */

const $ = id => document.getElementById(id);

const brl = n => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(t._t);
  t._t = setTimeout(() => (t.style.display = "none"), 2400);
}
