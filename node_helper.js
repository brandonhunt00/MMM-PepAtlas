var NodeHelper = require("node_helper");
var fetch = require("node-fetch");

module.exports = NodeHelper.create({

  config: null,

  start: function () {
    console.log("[MMM-PepAtlas] Node helper started.");
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "CONFIG") {
      this.config = payload;
      this.fetchAll();
    }
    if (notification === "FETCH_DATA") {
      this.fetchAll();
    }
  },

  // ─── PEP Atlas — mirror key auth ─────────────────────────────────────────

  fetchPepAtlas: async function () {
    if (!this.config.mirrorKey) {
      console.error("[MMM-PepAtlas] No mirrorKey configured.");
      return null;
    }
    try {
      var baseUrl = this.config.apiUrl.replace("/api/v1", "");
      var res = await fetch(baseUrl + "/api/v1/mirror/dashboard", {
        headers: {
          "X-Mirror-Key": this.config.mirrorKey,
          "ngrok-skip-browser-warning": "true",
        },
      });
      if (!res.ok) {
        console.error("[MMM-PepAtlas] Mirror API returned:", res.status);
        return null;
      }
      var data = await res.json();
      console.log("[MMM-PepAtlas] Mirror fetch OK. Beds:",
        data.occupiedBeds + "/" + data.totalBeds);
      return {
        dashboard: data,
        auditLogs: data.recentActivity || [],
      };
    } catch (e) {
      console.error("[MMM-PepAtlas] Mirror fetch error:", e.message);
      return null;
    }
  },

  // ─── SafeMed via Supabase Edge Function ──────────────────────────────────

  fetchSafeMed: async function () {
    var cfg = this.config.safemed;
    if (!cfg || !cfg.enabled) return null;

    try {
      var res = await fetch(
        "https://kllwasybursqjxgscbdb.supabase.co/functions/v1/mirror-stats",
        {
          headers: {
            "X-Mirror-Token": "pep-atlas-mirror-2026",
            "Content-Type": "application/json",
          },
        }
      );

      if (!res.ok) {
        console.error("[MMM-SafeMed] HTTP error:", res.status);
        return null;
      }

      var data = await res.json();
      console.log("[MMM-SafeMed] Fetched OK:", JSON.stringify(data));

      return {
        totalMedicos: data.totalDoctors || 0,
        onlineNow: data.onlineNow || 0,
        faturamentoBruto: data.grossRevenueThisMonth || 0,
        faturamentoBrutoAllTime: data.grossRevenueAllTime || 0,
        faturamentoLiquido: data.netRevenueThisMonth || 0,
        totalActivities: data.totalActivitiesThisMonth || 0,
        totalActivitiesAllTime: data.totalActivitiesAllTime || 0,
      };

    } catch (e) {
      console.error("[MMM-SafeMed] Fetch error:", e.message);
      return null;
    }
  },

  // ─── Combined ─────────────────────────────────────────────────────────────

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
