var NodeHelper = require("node_helper");
var fetch = require("node-fetch");
var fs = require("fs");
var path = require("path");

var TOKEN_FILE = path.join(__dirname, ".token-cache.json");

module.exports = NodeHelper.create({

  config: null,
  accessToken: null,
  refreshToken: null,
  tokenExpiry: null,

  start: function () {
    console.log("[MMM-PepAtlas] Node helper started.");
    this.loadTokenCache();
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "CONFIG") {
      this.config = payload;
      this.ensureToken().then(() => this.fetchAll());
    }
    if (notification === "FETCH_DATA") {
      this.ensureToken().then(() => this.fetchAll());
    }
  },

  loadTokenCache: function () {
    try {
      if (fs.existsSync(TOKEN_FILE)) {
        var cache = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
        this.accessToken = cache.accessToken || null;
        this.refreshToken = cache.refreshToken || null;
        this.tokenExpiry = cache.tokenExpiry || null;
        console.log("[MMM-PepAtlas] Token cache loaded.");
      }
    } catch (e) {
      console.warn("[MMM-PepAtlas] Could not load token cache:", e.message);
    }
  },

  saveTokenCache: function () {
    try {
      fs.writeFileSync(TOKEN_FILE, JSON.stringify({
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
        tokenExpiry: this.tokenExpiry,
      }), "utf8");
    } catch (e) {
      console.warn("[MMM-PepAtlas] Could not save token cache:", e.message);
    }
  },

  isTokenExpired: function () {
    if (!this.accessToken || !this.tokenExpiry) return true;
    return Date.now() > this.tokenExpiry - 30000;
  },

  ensureToken: async function () {
    if (!this.isTokenExpired()) return;
    if (this.refreshToken) {
      var ok = await this.doRefresh();
      if (ok) return;
    }
    await this.doLogin();
  },

  doRefresh: async function () {
    if (!this.config) return false;
    try {
      var res = await fetch(this.config.apiUrl + "/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });
      if (!res.ok) return false;
      var data = await res.json();
      var p = data.data || data;
      if (!p.accessToken) return false;
      this.accessToken = p.accessToken;
      if (p.refreshToken) this.refreshToken = p.refreshToken;
      this.tokenExpiry = Date.now() + ((p.expiresIn || 300) * 1000);
      this.saveTokenCache();
      console.log("[MMM-PepAtlas] PEP token refreshed.");
      return true;
    } catch (e) {
      console.error("[MMM-PepAtlas] Refresh error:", e.message);
      return false;
    }
  },

  doLogin: async function () {
    if (!this.config || !this.config.email || !this.config.password) {
      console.error("[MMM-PepAtlas] No credentials configured.");
      this.sendSocketNotification("DATA_ERROR", { error: "No credentials" });
      return;
    }
    try {
      var loginRes = await fetch(this.config.apiUrl + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({ email: this.config.email, password: this.config.password }),
      });
      var loginJson = await loginRes.json();
      var lp = loginJson.data || loginJson;
      if (!lp.requiresTwoFactor || !lp.tempToken) {
        this.sendSocketNotification("DATA_ERROR", { error: "Login failed" });
        return;
      }
      var verifyRes = await fetch(this.config.apiUrl + "/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({ tempToken: lp.tempToken, code: this.config.twoFactorCode || "000000" }),
      });
      var verifyJson = await verifyRes.json();
      var vp = verifyJson.data || verifyJson;
      if (vp.accessToken) {
        this.accessToken = vp.accessToken;
        this.refreshToken = vp.refreshToken;
        this.tokenExpiry = Date.now() + ((vp.expiresIn || 300) * 1000);
        this.saveTokenCache();
        console.log("[MMM-PepAtlas] PEP login OK.");
      } else {
        this.sendSocketNotification("DATA_ERROR", { error: "2FA failed" });
      }
    } catch (e) {
      console.error("[MMM-PepAtlas] Login error:", e.message);
      this.sendSocketNotification("DATA_ERROR", { error: e.message });
    }
  },

  // ─── PEP Atlas ───────────────────────────────────────────────────────────

  fetchPepAtlas: async function () {
    if (!this.accessToken) return null;
    try {
      var headers = {
        "Authorization": "Bearer " + this.accessToken,
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      };
      var [dashRes, auditRes] = await Promise.all([
        fetch(this.config.apiUrl + "/admin/dashboard", { headers }),
        fetch(this.config.apiUrl + "/audit?limit=8", { headers }),
      ]);
      if (dashRes.status === 401) {
        this.accessToken = null;
        this.tokenExpiry = null;
        this.saveTokenCache();
        return null;
      }
      if (!dashRes.ok) throw new Error("PEP API " + dashRes.status);
      var dashboard = await dashRes.json();
      var auditData = auditRes.ok ? await auditRes.json() : { data: [] };
      return {
        dashboard,
        auditLogs: auditData.data || auditData || [],
      };
    } catch (e) {
      console.error("[MMM-PepAtlas] PEP fetch error:", e.message);
      return null;
    }
  },

  // ─── SafeMed via Supabase PostgREST ──────────────────────────────────────
  // Schema confirmed:
  //   profiles        → id, nome, role (USER-DEFINED), status (boolean)
  //   security_audit_log → user_id, event_type, created_at
  //   faturamento     → valor_bruto, valor_liquido, competencia (date), status

  fetchSafeMed: async function () {
    var cfg = this.config.safemed;
    if (!cfg || !cfg.enabled) return null;

    var BASE = cfg.supabaseUrl + "/rest/v1";
    var KEY  = cfg.supabaseKey;
    var H    = {
      "apikey": KEY,
      "Authorization": "Bearer " + KEY,
      "Content-Type": "application/json",
    };

    try {
      var now = new Date();
      var mesAtual   = now.getFullYear() + "-" +
                       String(now.getMonth() + 1).padStart(2, "0") + "-01";
      var mesSeguinte = new Date(now.getFullYear(), now.getMonth() + 1, 1)
                        .toISOString().slice(0, 10);
      var quinzeMinAtras = new Date(Date.now() - 15 * 60 * 1000).toISOString();

      // 1. Total médicos ativos (role = medico, status = true)
      var totalRes = await fetch(
        BASE + "/profiles?role=eq.medico&status=eq.true&select=id",
        { headers: { ...H, "Prefer": "count=exact", "Range": "0-0" } }
      );
      var crTotal = totalRes.headers.get("content-range") || "0/0";
      var totalMedicos = parseInt(crTotal.split("/")[1] || "0");

      // 2. Online agora — user_ids únicos com evento nos últimos 15 minutos
      // Busca até 500 registros recentes e conta user_ids únicos
      var onlineRes = await fetch(
        BASE + "/security_audit_log?created_at=gte." + quinzeMinAtras +
        "&select=user_id&limit=500",
        { headers: H }
      );
      var onlineRows = onlineRes.ok ? await onlineRes.json() : [];
      var uniqueUsers = new Set();
      if (Array.isArray(onlineRows)) {
        onlineRows.forEach(function (r) { if (r.user_id) uniqueUsers.add(r.user_id); });
      }
      var onlineNow = uniqueUsers.size;

      // 3. Faturamento bruto do mês atual
      var fatBrutoRes = await fetch(
        BASE + "/faturamento?competencia=gte." + mesAtual +
        "&competencia=lt." + mesSeguinte +
        "&select=valor_bruto",
        { headers: H }
      );
      var fatBrutoRows = fatBrutoRes.ok ? await fatBrutoRes.json() : [];
      var faturamentoBruto = Array.isArray(fatBrutoRows)
        ? fatBrutoRows.reduce((s, r) => s + (parseFloat(r.valor_bruto) || 0), 0)
        : 0;

      // 4. Faturamento líquido do mês atual
      var fatLiqRes = await fetch(
        BASE + "/faturamento?competencia=gte." + mesAtual +
        "&competencia=lt." + mesSeguinte +
        "&select=valor_liquido",
        { headers: H }
      );
      var fatLiqRows = fatLiqRes.ok ? await fatLiqRes.json() : [];
      var faturamentoLiquido = Array.isArray(fatLiqRows)
        ? fatLiqRows.reduce((s, r) => s + (parseFloat(r.valor_liquido) || 0), 0)
        : 0;

      console.log("[MMM-SafeMed] Médicos:", totalMedicos,
        "| Online:", onlineNow,
        "| Bruto: R$", faturamentoBruto.toFixed(2),
        "| Líquido: R$", faturamentoLiquido.toFixed(2));

      return { totalMedicos, onlineNow, faturamentoBruto, faturamentoLiquido };

    } catch (e) {
      console.error("[MMM-SafeMed] Error:", e.message);
      return null;
    }
  },

  // ─── Combined ────────────────────────────────────────────────────────────

  fetchAll: async function () {
    var [pepData, safeMedData] = await Promise.all([
      this.fetchPepAtlas(),
      this.fetchSafeMed(),
    ]);
    if (!pepData && !safeMedData) {
      this.sendSocketNotification("DATA_ERROR", { error: "All sources failed" });
      return;
    }
    this.sendSocketNotification("DATA_UPDATE", { pep: pepData, safemed: safeMedData });
  },
});
