/* =====================================================
   GRÃO NOBRE — lógica do painel do administrador
   Depende de: utils.js, data.js
   ===================================================== */

let tab = "products";
let products = [];
let orders = [];

const showView = id => ["loginView", "appView"].forEach(v => $(v).classList.toggle("hidden", v !== id));

/* ---------- Login ---------- */
async function enter(user) {
  $("who").textContent = user.email;
  showView("appView");
  await loadAll();
}

async function doLogin() {
  $("loginErr").textContent = "";
  $("loginBtn").disabled = true;
  const r = await Auth.login($("email").value, $("pass").value);
  $("loginBtn").disabled = false;
  if (!r.ok) { $("loginErr").textContent = r.message; return; }
  $("pass").value = "";
  enter(await Auth.current());
}

async function doLogout() {
  await Auth.logout();
  showView("loginView");
}

/* ---------- Dados ---------- */
async function loadAll() {
  [products, orders] = await Promise.all([DB.listAllProducts(), DB.listOrders()]);
  $("cats").innerHTML = [...new Set(products.map(p => p.category).filter(Boolean))].map(c => `<option value="${esc(c)}">`).join("");
  render();
}

/* ---------- Render ---------- */
const render = () => (tab === "products" ? renderProducts() : renderOrders());

function renderProducts() {
  if (!products.length) { $("panel").innerHTML = `<div class="empty">Nenhum produto cadastrado.</div>`; return; }
  $("panel").innerHTML = `<table><thead><tr>
      <th></th><th>Produto</th><th>Categoria</th><th>Preço</th><th>Estoque</th><th>Status</th><th>Ações</th>
    </tr></thead><tbody>` +
    products.map(p => `<tr>
      <td style="font-size:1.4rem">${esc(p.emoji || "☕")}</td>
      <td><b>${esc(p.name)}</b><div class="note">${esc(p.origin || "")}</div></td>
      <td>${esc(p.category)}</td>
      <td>${brl(p.price)}</td>
      <td>${p.stock ?? "—"}</td>
      <td><span class="badge ${p.active ? "badge--on" : "badge--off"}">${p.active ? "Ativo" : "Oculto"}</span></td>
      <td class="actions">
        <button class="btn btn--ghost btn--sm" data-edit="${p.id}">Editar</button>
        <button class="btn btn--ghost btn--sm" data-toggle="${p.id}">${p.active ? "Ocultar" : "Publicar"}</button>
        <button class="btn btn--danger btn--sm" data-del="${p.id}">Remover</button>
      </td></tr>`).join("") + `</tbody></table>`;
  document.querySelectorAll("[data-edit]").forEach(b => (b.onclick = () => openForm(products.find(p => String(p.id) === b.dataset.edit))));
  document.querySelectorAll("[data-toggle]").forEach(b => (b.onclick = () => toggleActive(b.dataset.toggle)));
  document.querySelectorAll("[data-del]").forEach(b => (b.onclick = () => removeProduct(b.dataset.del)));
}

function renderOrders() {
  if (!orders.length) { $("panel").innerHTML = `<div class="empty">Nenhum pedido ainda.</div>`; return; }
  $("panel").innerHTML = `<table><thead><tr>
      <th>#</th><th>Data</th><th>Cliente</th><th>Itens</th><th>Entrega</th><th>Total</th><th>Pagamento</th>
    </tr></thead><tbody>` +
    orders.map(o => `<tr>
      <td>${o.id}</td>
      <td>${new Date(o.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
      <td><b>${esc(o.customer_name)}</b><div class="note">${esc(o.customer_email)}</div></td>
      <td class="wrap">${(o.items || []).map(i => `${i.quantity}× ${esc(i.product_name)}`).join("<br>")}</td>
      <td class="wrap">${esc(o.address || "")}, ${esc(o.number || "")}<div class="note">CEP ${esc(o.cep || "")} · ${o.distance_km ?? "?"} km</div></td>
      <td>${brl(o.total)}<div class="note">frete ${brl(o.shipping)}</div></td>
      <td>${esc(o.payment_method || "")} <span class="badge ${o.payment_status === "paid" ? "badge--paid" : "badge--pending"}">${o.payment_status === "paid" ? "Pago" : "Pendente"}</span></td>
    </tr>`).join("") + `</tbody></table>`;
}

/* ---------- Formulário de produto ---------- */
function openForm(p) {
  $("mTitle").textContent = p ? "Editar produto" : "Novo produto";
  $("fId").value = p?.id ?? "";
  $("fName").value = p?.name ?? "";
  $("fDesc").value = p?.description ?? "";
  $("fCat").value = p?.category ?? "";
  $("fEmoji").value = p?.emoji ?? "☕";
  $("fOrigin").value = p?.origin ?? "";
  $("fRoast").value = p?.roast ?? "";
  $("fPrice").value = p?.price ?? "";
  $("fWeight").value = p?.weight_g ?? 250;
  $("fStock").value = p?.stock ?? 100;
  $("fActive").checked = p ? !!p.active : true;
  $("fErr").textContent = "";
  $("modal").classList.add("modal--on");
  $("fName").focus();
}

async function saveForm() {
  const name = $("fName").value.trim(), cat = $("fCat").value.trim(), price = parseFloat($("fPrice").value);
  if (name.length < 2) { $("fErr").textContent = "Informe o nome do produto."; return; }
  if (!cat) { $("fErr").textContent = "Informe a categoria."; return; }
  if (!(price >= 0)) { $("fErr").textContent = "Informe um preço válido."; return; }

  const id = $("fId").value;
  await DB.saveProduct({
    id: id || undefined,
    name, category: cat, price,
    description: $("fDesc").value.trim(),
    emoji: $("fEmoji").value.trim() || "☕",
    origin: $("fOrigin").value.trim(),
    roast: $("fRoast").value.trim(),
    weight_g: parseInt($("fWeight").value) || 0,
    stock: parseInt($("fStock").value) || 0,
    active: $("fActive").checked
  });
  $("modal").classList.remove("modal--on");
  toast(id ? "Produto atualizado" : "Produto criado");
  loadAll();
}

/* ---------- Ações ---------- */
async function toggleActive(id) {
  const p = products.find(x => String(x.id) === String(id));
  await DB.saveProduct({ id: p.id, active: !p.active });
  toast(p.active ? "Produto ocultado" : "Produto publicado");
  loadAll();
}

async function removeProduct(id) {
  const p = products.find(x => String(x.id) === String(id));
  if (!confirm(`Remover "${p.name}" definitivamente?`)) return;
  await DB.deleteProduct(id);
  toast("Produto removido");
  loadAll();
}

/* ---------- Início ---------- */
async function initAdmin() {
  $("loginBtn").onclick = doLogin;
  $("pass").addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
  $("logoutBtn").onclick = doLogout;
  $("newBtn").onclick = () => openForm(null);
  $("mCancel").onclick = () => $("modal").classList.remove("modal--on");
  $("mSave").onclick = saveForm;

  document.querySelectorAll(".tab").forEach(b => (b.onclick = () => {
    tab = b.dataset.tab;
    document.querySelectorAll(".tab").forEach(x => x.classList.toggle("tab--on", x === b));
    $("newBtn").classList.toggle("hidden", tab !== "products");
    render();
  }));

  const user = await Auth.current();
  user ? enter(user) : showView("loginView");
}
document.addEventListener("DOMContentLoaded", initAdmin);
