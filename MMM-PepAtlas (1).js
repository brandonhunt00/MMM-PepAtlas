Module.register("MMM-PepAtlas", {

  defaults: {
    apiUrl: "https://dejected-squeamish-yin.ngrok-free.dev/api/v1",
    email: "brandondohunt@hotmail.com",
    password: "REDACTED_PASSWORD",
    refreshInterval: 30 * 1000,
    showActivityFeed: true,
    maxActivityItems: 5,
    safemed: {
      enabled: true,
      supabaseUrl: "https://kllwasybursqjxgscbdb.supabase.co",
      supabaseKey: "REDACTED_SUPABASE_SERVICE_KEY",
    },
  },

  data: {
    pep: null,
    safemed: null,
    lastUpdated: null,
    status: "loading",
  },

  start: function () {
    Log.info(this.name + " starting...");
    this.sendSocketNotification("CONFIG", this.config);
    this.scheduleRefresh();
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "DATA_UPDATE") {
      this.data.pep      = payload.pep;
      this.data.safemed  = payload.safemed;
      this.data.lastUpdated = new Date();
      this.data.status   = "ok";
      this.updateDom(300);
    }
    if (notification === "DATA_ERROR") {
      this.data.status = "error";
      this.updateDom(300);
    }
  },

  scheduleRefresh: function () {
    var self = this;
    setInterval(function () {
      self.sendSocketNotification("FETCH_DATA", {});
    }, self.config.refreshInterval);
  },

  // ─── DOM ─────────────────────────────────────────────────────────────────

  getDom: function () {
    var w = document.createElement("div");
    w.className = "pep-atlas-wrapper";

    if (this.data.status === "loading") {
      w.innerHTML = '<div class="pep-status loading">conectando...</div>';
      return w;
    }
    if (this.data.status === "error" && !this.data.pep && !this.data.safemed) {
      w.innerHTML = '<div class="pep-status error">⬤  API indisponível</div>';
      return w;
    }

    // PEP Atlas block
    if (this.data.pep) {
      w.appendChild(this.mkHeader("PEP Atlas", "dot-green"));
      w.appendChild(this.mkPepGrid(this.data.pep.dashboard));
      if (this.config.showActivityFeed && this.data.pep.auditLogs.length) {
        w.appendChild(this.mkDivider());
        w.appendChild(this.mkFeed(this.data.pep.auditLogs));
      }
    }

    // Separator
    if (this.data.pep && this.data.safemed) {
      var sep = document.createElement("div");
      sep.className = "pep-sep";
      w.appendChild(sep);
    }

    // SafeMed block
    if (this.data.safemed) {
      w.appendChild(this.mkHeader("SafeMed", "dot-blue"));
      w.appendChild(this.mkSafeMedGrid(this.data.safemed));
    }

    // Timestamp
    var ts = document.createElement("div");
    ts.className = "pep-ts";
    ts.textContent = this.fmtTime(this.data.lastUpdated);
    w.appendChild(ts);

    return w;
  },

  mkHeader: function (title, dotClass) {
    var el = document.createElement("div");
    el.className = "pep-block-header";
    el.innerHTML =
      '<span class="pep-block-title">' + title + "</span>" +
      '<span class="pep-dot ' + dotClass + '">⬤</span>';
    return el;
  },

  mkDivider: function () {
    var el = document.createElement("div");
    el.className = "pep-divider";
    return el;
  },

  mkPepGrid: function (d) {
    if (!d) return document.createElement("div");
    var g = document.createElement("div");
    g.className = "pep-grid";
    [
      { v: d.activeHospitals || d.totalHospitals || "—", l: "Hospitais",  s: "ativos" },
      { v: (d.occupiedBeds || "—") + "/" + (d.totalBeds || "—"), l: "Leitos", s: "ocupados" },
      { v: d.activeUsersNow  || "0", l: "Online",    s: "agora",     hi: true },
      { v: d.usersLoggedInEver || "—", l: "Logins",  s: "hoje" },
      { v: d.openTickets     || "0", l: "Tickets",   s: "abertos" },
      { v: d.occupancyRate   ? Math.round(d.occupancyRate) + "%" : "—", l: "Ocupação", s: "taxa" },
    ].forEach(function (item) {
      var c = document.createElement("div");
      c.className = "pep-card" + (item.hi ? " hi-green" : "");
      c.innerHTML =
        '<div class="cv">' + item.v + "</div>" +
        '<div class="cl">' + item.l + "</div>" +
        '<div class="cs">' + item.s + "</div>";
      g.appendChild(c);
    });
    return g;
  },

  mkSafeMedGrid: function (d) {
    if (!d) return document.createElement("div");
    var g = document.createElement("div");
    g.className = "pep-grid safemed-grid";

    var bruto  = d.faturamentoBruto
      ? "R$ " + Math.round(d.faturamentoBruto).toLocaleString("pt-BR")
      : "—";
    var liquido = d.faturamentoLiquido
      ? "R$ " + Math.round(d.faturamentoLiquido).toLocaleString("pt-BR")
      : "—";

    [
      { v: d.totalMedicos  || "—",  l: "Médicos",    s: "ativos" },
      { v: d.onlineNow     || "0",  l: "Online agora", s: "últimos 15min", hi: true },
      { v: bruto,                   l: "Fat. bruto",  s: "este mês" },
      { v: liquido,                 l: "Fat. líquido", s: "este mês" },
    ].forEach(function (item) {
      var c = document.createElement("div");
      c.className = "pep-card" + (item.hi ? " hi-blue" : "");
      c.innerHTML =
        '<div class="cv sm">' + item.v + "</div>" +
        '<div class="cl">' + item.l + "</div>" +
        '<div class="cs">' + item.s + "</div>";
      g.appendChild(c);
    });
    return g;
  },

  mkFeed: function (logs) {
    var self = this;
    var wrap = document.createElement("div");
    var title = document.createElement("div");
    title.className = "pep-feed-title";
    title.textContent = "Atividade recente";
    wrap.appendChild(title);
    var feed = document.createElement("div");
    feed.className = "pep-feed";
    logs.slice(0, this.config.maxActivityItems).forEach(function (log) {
      var item = document.createElement("div");
      item.className = "pep-feed-item";
      var user   = (log.user && log.user.name) ? log.user.name : "Sistema";
      var action = self.fmtAction(log.action);
      var entity = self.fmtEntity(log.entity);
      var time   = self.fmtRel(log.createdAt);
      item.innerHTML =
        '<span class="fdot ' + self.actionClass(log.action) + '">⬤</span>' +
        '<span class="fuser">' + user + "</span>" +
        '<span class="faction">' + action + " " + entity + "</span>" +
        '<span class="ftime">' + time + "</span>";
      feed.appendChild(item);
    });
    wrap.appendChild(feed);
    return wrap;
  },

  fmtTime: function (d) {
    if (!d) return "";
    return "atualizado às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  },

  fmtRel: function (iso) {
    if (!iso) return "";
    var s = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (s < 60)   return s + "s";
    if (s < 3600) return Math.floor(s / 60) + "min";
    if (s < 86400) return Math.floor(s / 3600) + "h";
    return Math.floor(s / 86400) + "d";
  },

  fmtAction: function (a) {
    return ({ CREATE: "criou", UPDATE: "atualizou", DELETE: "removeu",
              LOGIN: "fez login", LOGOUT: "saiu", DISCHARGE: "deu alta em" })[a] || a;
  },

  fmtEntity: function (e) {
    return ({ Patient: "paciente", Admission: "internação",
              ClinicalNote: "evolução", Prescription: "prescrição",
              Exam: "exame", Discharge: "alta", User: "usuário" })[e] || e;
  },

  actionClass: function (a) {
    return ({ LOGIN: "c-login", CREATE: "c-create", UPDATE: "c-update",
              DISCHARGE: "c-discharge", DELETE: "c-delete" })[a] || "c-def";
  },
});
