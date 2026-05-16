Module.register("MMM-PepAtlas", {
  defaults: {
    apiUrl: "",
    email: "",
    password: "",
    refreshInterval: 30 * 1000,
    showActivityFeed: true,
    maxActivityItems: 4,
    safemed: {
      enabled: false,
      supabaseUrl: "",
      supabaseKey: ""
    }
  },

  data: {
    pep: null,
    safemed: null,
    lastUpdated: null,
    status: "loading"
  },

  getStyles() {
    return ["MMM-PepAtlas.css"];
  },

  start() {
    Log.info(`${this.name} starting...`);
    this.sendSocketNotification("CONFIG", this.config);
    this.sendSocketNotification("FETCH_DATA", {});
    this.scheduleRefresh();
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "DATA_UPDATE") {
      this.data.pep = payload.pep;
      this.data.safemed = payload.safemed;
      this.data.lastUpdated = new Date();
      this.data.status = "ok";
      this.updateDom(300);
    }

    if (notification === "DATA_ERROR") {
      this.data.status = "error";
      this.updateDom(300);
    }
  },

  scheduleRefresh() {
    setInterval(() => {
      this.sendSocketNotification("FETCH_DATA", {});
    }, this.config.refreshInterval);
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "pep-atlas-wrapper";

    if (this.data.status === "loading") {
      wrapper.innerHTML = `<div class="pep-status loading">Connecting dashboards…</div>`;
      return wrapper;
    }

    if (this.data.status === "error" && !this.data.pep && !this.data.safemed) {
      wrapper.innerHTML = `<div class="pep-status error">Dashboard unavailable</div>`;
      return wrapper;
    }

    if (this.data.pep) {
      const pepBlock = document.createElement("section");
      pepBlock.className = "pep-panel";
      pepBlock.appendChild(this.mkHeader("PEP Atlas", "green"));
      pepBlock.appendChild(this.mkPepGrid(this.data.pep.dashboard));

      if (this.config.showActivityFeed && this.data.pep.auditLogs?.length) {
        pepBlock.appendChild(this.mkFeed(this.data.pep.auditLogs));
      }

      wrapper.appendChild(pepBlock);
    }

    if (this.data.safemed) {
      const safeMedBlock = document.createElement("section");
      safeMedBlock.className = "pep-panel";
      safeMedBlock.appendChild(this.mkHeader("SafeMed", "blue"));
      safeMedBlock.appendChild(this.mkSafeMedGrid(this.data.safemed));
      wrapper.appendChild(safeMedBlock);
    }

    const footer = document.createElement("div");
    footer.className = "pep-footer";
    footer.textContent = this.fmtTime(this.data.lastUpdated);
    wrapper.appendChild(footer);

    return wrapper;
  },

  mkHeader(title, color) {
    const el = document.createElement("div");
    el.className = "pep-header";
    el.innerHTML = `
      <span>${title}</span>
      <span class="pep-live ${color}"></span>
    `;
    return el;
  },

  mkPepGrid(d) {
    return this.mkGrid([
      { value: d?.activeHospitals ?? d?.totalHospitals ?? "—", label: "Hospitals", sub: "active" },
      { value: `${d?.occupiedBeds ?? "—"}/${d?.totalBeds ?? "—"}`, label: "Beds", sub: "occupied" },
      { value: d?.activeUsersNow ?? "0", label: "Online", sub: "now" },
      { value: d?.usersLoggedInEver ?? "—", label: "Logins", sub: "today" },
      { value: d?.openTickets ?? "0", label: "Tickets", sub: "open" },
      { value: d?.occupancyRate ? `${Math.round(d.occupancyRate)}%` : "—", label: "Occupancy", sub: "rate" }
    ]);
  },

  mkSafeMedGrid(d) {
    const bruto = d?.faturamentoBruto ? `R$ ${Math.round(d.faturamentoBruto).toLocaleString("pt-BR")}` : "—";
    const liquido = d?.faturamentoLiquido ? `R$ ${Math.round(d.faturamentoLiquido).toLocaleString("pt-BR")}` : "—";

    return this.mkGrid([
      { value: d?.totalMedicos ?? "—", label: "Doctors", sub: "active" },
      { value: d?.onlineNow ?? "0", label: "Online", sub: "15 min" },
      { value: bruto, label: "Gross", sub: "month" },
      { value: liquido, label: "Net", sub: "month" }
    ], "compact");
  },

  mkGrid(items, extraClass = "") {
    const grid = document.createElement("div");
    grid.className = `pep-grid ${extraClass}`;

    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "pep-card";
      card.innerHTML = `
        <div class="pep-value">${item.value}</div>
        <div class="pep-label">${item.label}</div>
        <div class="pep-sub">${item.sub}</div>
      `;
      grid.appendChild(card);
    });

    return grid;
  },

  mkFeed(logs) {
    const wrap = document.createElement("div");
    wrap.className = "pep-feed-wrap";

    const title = document.createElement("div");
    title.className = "pep-feed-title";
    title.textContent = "Recent activity";
    wrap.appendChild(title);

    const feed = document.createElement("div");
    feed.className = "pep-feed";

    logs.slice(0, this.config.maxActivityItems).forEach((log) => {
      const user = log.user?.name || "System";
      const action = this.fmtAction(log.action);
      const entity = this.fmtEntity(log.entity);
      const time = this.fmtRel(log.createdAt);

      const item = document.createElement("div");
      item.className = `pep-feed-item ${this.actionClass(log.action)}`;
      item.innerHTML = `
        <span class="pep-feed-dot"></span>
        <span class="pep-feed-main">${user} ${action} ${entity}</span>
        <span class="pep-feed-time">${time}</span>
      `;
      feed.appendChild(item);
    });

    wrap.appendChild(feed);
    return wrap;
  },

  fmtTime(d) {
    if (!d) return "";
    return `updated ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
  },

  fmtRel(iso) {
    if (!iso) return "";
    const seconds = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  },

  fmtAction(action) {
    return {
      CREATE: "created",
      UPDATE: "updated",
      DELETE: "removed",
      LOGIN: "logged in",
      LOGOUT: "logged out",
      DISCHARGE: "discharged"
    }[action] || String(action || "").toLowerCase();
  },

  fmtEntity(entity) {
    return {
      Patient: "patient",
      Admission: "admission",
      ClinicalNote: "note",
      Prescription: "prescription",
      Exam: "exam",
      Discharge: "discharge",
      User: "user"
    }[entity] || String(entity || "").toLowerCase();
  },

  actionClass(action) {
    return {
      LOGIN: "is-blue",
      CREATE: "is-green",
      UPDATE: "is-yellow",
      DISCHARGE: "is-purple",
      DELETE: "is-red"
    }[action] || "is-muted";
  }
});