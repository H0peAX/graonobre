/* =====================================================
   GRÃO NOBRE — camada de dados (ÚNICO arquivo para trocar)
   -----------------------------------------------------
   Hoje: tudo salvo no localStorage do navegador (demo).
   Depois: troque o corpo de cada função por chamadas ao
   Supabase — o passo a passo está em GUIA-SUPABASE.md.
   Nenhum outro arquivo precisa mudar.
   ===================================================== */

const CONFIG = {
  store: { name: "Grão Nobre", lat: -23.5505, lon: -46.6333, label: "Centro, São Paulo - SP" }, // origem do frete
  shipping: { base: 9.9, perKm: 0.045, free: 199, max: 89.9 },  // R$ base + R$/km · frete grátis acima de `free`
  demoAdmin: { email: "admin@graonobre.com", password: "admin123" } // só para a demonstração local
};

const SUPABASE_URL = "https://bxhohagaonkexowsrjfs.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_OCLb8liQlakLxYDXt6b64w_A1403YEA";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const fail = error => { if (error) { console.error(error); throw error; } };

/* ---------- Produtos e pedidos ---------- */
const DB = {
  async listProducts() {
    const { data, error } = await sb.from("products").select("*").eq("active", true).order("id");
    fail(error); return data;
  },

  async listAllProducts() {
    const { data, error } = await sb.from("products").select("*").order("id");
    fail(error); return data;
  },

  async saveProduct(product) {
    const { id, ...row } = product;
    const { error } = id
      ? await sb.from("products").update(row).eq("id", id)
      : await sb.from("products").insert(row);
    fail(error);
  },

  async deleteProduct(id) {
    const { error } = await sb.from("products").delete().eq("id", id);
    fail(error);
  },

  async createOrder(order, items) {
    const { data: o, error } = await sb.from("orders")
      .insert({ ...order, payment_status: "pending" }).select().single();
    fail(error);
    const { error: e2 } = await sb.from("order_items")
      .insert(items.map(i => ({ ...i, order_id: o.id })));
    fail(e2);
    return o.id;
  },

  async markPaid(orderId) {
    const { error } = await sb.from("orders").update({ payment_status: "paid" }).eq("id", orderId);
    fail(error);
  },

  async listOrders() {
    const { data, error } = await sb.from("orders")
      .select("*, order_items(product_name, quantity, unit_price)")
      .order("id", { ascending: false }).limit(200);
    fail(error);
    return data.map(o => ({ ...o, items: o.order_items }));
  }
};

/* ---------- Login do admin ---------- */
const Auth = {
  async current() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    const { data } = await sb.from("admins").select("user_id").eq("user_id", session.user.id).maybeSingle();
    return data ? { email: session.user.email } : null;
  },

  async login(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { ok: false, message: "E-mail ou senha inválidos." };
    if (!(await this.current())) {
      await sb.auth.signOut();
      return { ok: false, message: "Este usuário não tem permissão de administrador." };
    }
    return { ok: true };
  },

  async logout() { await sb.auth.signOut(); }
};