/* =====================================================
   GRÃO NOBRE — lógica da loja (catálogo, carrinho,
   CEP/rota e pagamento simulado)
   Depende de: utils.js, data.js
   ===================================================== */

let products = [];
let category = "Todos";
let query = "";
let cart = JSON.parse(localStorage.getItem("gn_cart") || "{}"); // { idProduto: quantidade }
let ship = null; // { cost, km, days, address, cep }
let map, routeLayer;

/* ---------- Catálogo ---------- */
function renderFilters() {
  const cats = ["Todos", ...new Set(products.map(p => p.category))];
  $("filters").innerHTML =
    `<input id="q" placeholder="Buscar produto..." value="${esc(query)}">` +
    cats.map(c => `<button class="chip ${c === category ? "chip--on" : ""}" data-c="${esc(c)}">${esc(c)}</button>`).join("");
  document.querySelectorAll(".chip").forEach(b => (b.onclick = () => { category = b.dataset.c; renderFilters(); renderGrid(); }));
  $("q").oninput = e => { query = e.target.value; renderGrid(); };
  $("q").focus && query && $("q").setSelectionRange(query.length, query.length);
}

function renderGrid() {
  const list = products.filter(p =>
    (category === "Todos" || p.category === category) &&
    (p.name + " " + (p.description || "")).toLowerCase().includes(query.toLowerCase())
  );
  $("grid").innerHTML = list.map(p => `
    <article class="product">
      <div class="product__emoji">${esc(p.emoji || "☕")}</div>
      <h3>${esc(p.name)}</h3>
      <span class="note">${esc(p.origin)}${p.roast && p.roast !== "-" ? " · Torra " + esc(p.roast) : ""}</span>
      <span class="note">${esc(p.description)}</span>
      <div class="product__price">${brl(p.price)}</div>
      <button class="btn" data-add="${p.id}">Adicionar</button>
    </article>`).join("") || `<p class="note">Nenhum produto encontrado.</p>`;
  document.querySelectorAll("[data-add]").forEach(b => (b.onclick = () => { addToCart(b.dataset.add); toast("Adicionado ao carrinho"); }));
}

/* ---------- Carrinho ---------- */
const saveCart = () => localStorage.setItem("gn_cart", JSON.stringify(cart));
const addToCart = id => { cart[id] = (cart[id] || 0) + 1; saveCart(); renderCart(); };
const setQty = (id, q) => { q <= 0 ? delete cart[id] : (cart[id] = q); saveCart(); renderCart(); };
const cartLines = () => Object.entries(cart)
  .map(([id, q]) => ({ p: products.find(x => String(x.id) === String(id)), q }))
  .filter(l => l.p);
const subtotal = () => cartLines().reduce((s, l) => s + l.p.price * l.q, 0);

function shippingCost(km, sub) {
  const s = CONFIG.shipping;
  if (sub >= s.free) return 0;
  return Math.min(s.max, +(s.base + km * s.perKm).toFixed(2));
}

function renderCart() {
  const L = cartLines();
  $("cartCount").textContent = L.reduce((s, l) => s + l.q, 0);
  $("cartItems").innerHTML = L.length
    ? L.map(({ p, q }) => `
      <div class="cart-item">
        <div class="cart-item__emoji">${esc(p.emoji || "☕")}</div>
        <div class="cart-item__info"><b>${esc(p.name)}</b><div class="note">${brl(p.price)}</div></div>
        <div class="qty"><button data-m="${p.id}">−</button><span>${q}</span><button data-p="${p.id}">+</button></div>
      </div>`).join("")
    : `<p class="note">Seu carrinho está vazio.</p>`;
  document.querySelectorAll("[data-m]").forEach(b => (b.onclick = () => setQty(b.dataset.m, cart[b.dataset.m] - 1)));
  document.querySelectorAll("[data-p]").forEach(b => (b.onclick = () => setQty(b.dataset.p, cart[b.dataset.p] + 1)));

  const sub = subtotal();
  if (ship) ship.cost = shippingCost(ship.km, sub);
  $("tSub").textContent = brl(sub);
  $("tShip").textContent = ship ? (ship.cost === 0 ? "Grátis" : brl(ship.cost)) : "—";
  $("tTotal").textContent = brl(sub + (ship ? ship.cost : 0));
  $("payBtn").disabled = !L.length;
}

const openCart = () => { $("drawer").classList.add("drawer--on"); $("overlay").classList.add("overlay--on"); };
const closeCart = () => { $("drawer").classList.remove("drawer--on"); $("overlay").classList.remove("overlay--on"); };

/* ---------- CEP + rota ---------- */
async function geocode(q) {
  const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=" + encodeURIComponent(q));
  const j = await r.json();
  return j[0] ? { lat: +j[0].lat, lon: +j[0].lon } : null;
}

async function calcShipping() {
  const cep = $("cep").value.replace(/\D/g, "");
  const msg = $("shipMsg");
  msg.className = "note";
  if (cep.length !== 8) { msg.className = "err"; msg.textContent = "Digite um CEP válido com 8 dígitos."; return; }
  msg.textContent = "Buscando endereço...";
  try {
    const a = await (await fetch(`https://viacep.com.br/ws/${cep}/json/`)).json();
    if (a.erro) throw new Error("CEP não encontrado.");
    $("addrBox").innerHTML = `<div class="note" style="margin-bottom:8px">📮 ${esc(a.logradouro || "(CEP geral)")}, ${esc(a.bairro)} — ${esc(a.localidade)}/${esc(a.uf)}</div>`;

    msg.textContent = "Calculando rota...";
    const dest = (await geocode(`${a.logradouro}, ${a.localidade}, ${a.uf}, Brasil`)) || (await geocode(`${a.localidade}, ${a.uf}, Brasil`));
    if (!dest) throw new Error("Não consegui localizar esse endereço no mapa.");

    const S = CONFIG.store;
    const rj = await (await fetch(`https://router.project-osrm.org/route/v1/driving/${S.lon},${S.lat};${dest.lon},${dest.lat}?overview=full&geometries=geojson`)).json();
    if (rj.code !== "Ok") throw new Error("Rota indisponível para esse destino.");

    const route = rj.routes[0];
    const km = +(route.distance / 1000).toFixed(1);
    const days = Math.max(1, Math.ceil(km / 350)) + 1; // 1 dia de preparo + ~350 km/dia
    ship = { km, days, cep, cost: shippingCost(km, subtotal()), address: `${a.logradouro || ""}, ${a.bairro} — ${a.localidade}/${a.uf}` };

    const h = Math.floor(route.duration / 3600), m = Math.round((route.duration % 3600) / 60);
    msg.className = "note ok";
    msg.innerHTML = `Rota de <b>${esc(S.label)}</b>: <b>${km.toLocaleString("pt-BR")} km</b> (~${h}h${String(m).padStart(2, "0")} de carro) · Entrega em ~<b>${days} dia(s) úteis</b>.`;
    drawMap(dest, route.geometry);
    renderCart();
  } catch (e) {
    ship = null;
    msg.className = "err";
    msg.textContent = e.message || "Erro ao calcular. Tente novamente.";
    renderCart();
  }
}

function drawMap(dest, geo) {
  $("map").style.display = "block";
  if (!map) {
    map = L.map("map");
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
  }
  if (routeLayer) map.removeLayer(routeLayer);
  routeLayer = L.layerGroup().addTo(map);
  const line = L.geoJSON(geo, { style: { color: "#6b3e26", weight: 4 } }).addTo(routeLayer);
  L.marker([CONFIG.store.lat, CONFIG.store.lon]).bindPopup(CONFIG.store.name).addTo(routeLayer);
  L.marker([dest.lat, dest.lon]).bindPopup("Entrega").addTo(routeLayer);
  setTimeout(() => { map.invalidateSize(); map.fitBounds(line.getBounds(), { padding: [20, 20] }); }, 120);
}

/* ---------- Pagamento simulado ---------- */
const payMethod = () => document.querySelector("input[name=pm]:checked").value;
const rnd = n => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");

function drawFakeQR(canvas, seed) {
  const N = 29, s = 7, c = canvas.getContext("2d");
  canvas.width = canvas.height = N * s;
  c.fillStyle = "#fff"; c.fillRect(0, 0, N * s, N * s); c.fillStyle = "#000";
  let x = 0; for (const ch of seed) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  const finder = (ox, oy) => {
    c.fillRect(ox * s, oy * s, 7 * s, 7 * s);
    c.fillStyle = "#fff"; c.fillRect((ox + 1) * s, (oy + 1) * s, 5 * s, 5 * s);
    c.fillStyle = "#000"; c.fillRect((ox + 2) * s, (oy + 2) * s, 3 * s, 3 * s);
  };
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const inFinder = (i < 8 && j < 8) || (i > N - 9 && j < 8) || (i < 8 && j > N - 9);
    if (!inFinder && rand() > 0.52) c.fillRect(i * s, j * s, s, s);
  }
  finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
}

async function startPayment() {
  const err = $("checkErr");
  err.textContent = "";
  const name = $("cname").value.trim(), email = $("cemail").value.trim();
  if (!ship) { err.textContent = "Calcule o frete informando o CEP."; return; }
  if (!$("num").value.trim()) { err.textContent = "Informe o número do endereço."; return; }
  if (name.length < 3) { err.textContent = "Informe seu nome completo."; return; }
  if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = "Informe um e-mail válido."; return; }
  if (payMethod() === "cartao" && $("cardNum").value.replace(/\D/g, "").length < 8) { err.textContent = "Preencha o cartão (qualquer número serve na simulação)."; return; }

  const sub = subtotal(), total = sub + ship.cost;
  $("payBtn").disabled = true;

  const orderId = await DB.createOrder(
    {
      customer_name: name, customer_email: email, cep: ship.cep, address: ship.address,
      number: $("num").value.trim() + ($("comp").value ? " - " + $("comp").value : ""),
      distance_km: ship.km, eta_days: ship.days, subtotal: sub, shipping: ship.cost, total, payment_method: payMethod()
    },
    cartLines().map(({ p, q }) => ({ product_id: p.id, product_name: p.name, unit_price: p.price, quantity: q }))
  );

  showPayment(orderId, total);
  $("payBtn").disabled = false;
}

function showPayment(id, total) {
  const m = payMethod(), box = $("mbox");
  box.classList.add("modal__box--center");
  const head = `<div class="sim">⚠️ PAGAMENTO SIMULADO — nenhuma cobrança real</div>
    <h2 style="margin:4px 0">Pedido #${esc(id)}</h2><div style="font-size:1.4rem;font-weight:800">${brl(total)}</div>`;
  let body = "", copy = "";
  if (m === "pix") {
    copy = "00020126FAKE" + rnd(20) + "BR.GOV.BCB.PIX5204SIMULADO";
    body = `<p class="note">Pix simulado — este QR não aponta para nenhuma conta.</p><canvas class="qr" id="qr"></canvas><div class="code">${copy}</div>
      <button class="btn btn--ghost" id="copyBtn">Copiar código</button>`;
  } else if (m === "boleto") {
    copy = `${rnd(5)}.${rnd(5)} ${rnd(5)}.${rnd(6)} ${rnd(5)}.${rnd(6)} ${rnd(1)} ${rnd(14)}`;
    const venc = new Date(Date.now() + 3 * 864e5).toLocaleDateString("pt-BR");
    body = `<p class="note">Boleto simulado · vencimento ${venc}</p><div class="code">${copy}</div>
      <button class="btn btn--ghost" id="copyBtn">Copiar linha digitável</button>`;
  } else {
    body = `<p class="note">Cartão simulado — transação em análise...</p>`;
  }
  box.innerHTML = head + body + `<div style="margin-top:16px">
      <button class="btn btn--block" id="confirmPay">Simular pagamento aprovado</button>
      <button class="btn btn--ghost btn--block" id="cancelPay" style="margin-top:8px">Voltar</button></div>`;
  $("modal").classList.add("modal--on");

  if (m === "pix") drawFakeQR($("qr"), String(id) + total);
  if ($("copyBtn")) $("copyBtn").onclick = () => { navigator.clipboard.writeText(copy); toast("Copiado!"); };
  $("cancelPay").onclick = () => $("modal").classList.remove("modal--on");
  $("confirmPay").onclick = async () => {
    $("confirmPay").disabled = true;
    $("confirmPay").textContent = "Processando...";
    await new Promise(r => setTimeout(r, 1400));
    await DB.markPaid(id);
    box.innerHTML = `<div class="sim">⚠️ SIMULAÇÃO</div><div style="font-size:3rem">✅</div><h2>Pagamento aprovado!</h2>
      <p class="note">Pedido #${esc(id)} confirmado. Entrega estimada em ~${ship.days} dia(s) úteis para ${esc(ship.address)}.</p>
      <button class="btn btn--block" id="done">Fechar</button>`;
    cart = {}; saveCart(); renderCart();
    $("done").onclick = () => { $("modal").classList.remove("modal--on"); closeCart(); };
  };
}

/* ---------- Início ---------- */
async function initStore() {
  products = await DB.listProducts();

  $("openCart").onclick = openCart;
  $("closeCart").onclick = closeCart;
  $("overlay").onclick = closeCart;
  $("calcBtn").onclick = calcShipping;
  $("payBtn").onclick = startPayment;

  $("cep").addEventListener("input", e => {
    let v = e.target.value.replace(/\D/g, "").slice(0, 8);
    if (v.length > 5) v = v.slice(0, 5) + "-" + v.slice(5);
    e.target.value = v;
    if (v.length === 9) calcShipping();
  });
  document.querySelectorAll("input[name=pm]").forEach(r => (r.onchange = () => {
    $("cardFields").classList.toggle("hidden", payMethod() !== "cartao");
  }));

  renderFilters();
  renderGrid();
  renderCart();
}
document.addEventListener("DOMContentLoaded", initStore);
