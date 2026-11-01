"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => AkatsukiSyncPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULTS = {
  serverUrl: "",
  deviceToken: "",
  folder: "akatsuki\u958B\u767A",
  intervalMinutes: 15,
  autoSync: true,
  lastHashes: {}
};
function safeRelativePath(value) {
  if (!value || value.length > 240 || value.includes("\\") || value.startsWith("/")) return false;
  const parts = value.split("/");
  return parts.every((part) => part && part !== "." && part !== "..");
}
async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
var AkatsukiSyncPlugin = class extends import_obsidian.Plugin {
  settings = { ...DEFAULTS };
  syncing = false;
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.addSettingTab(new AkatsukiSettingTab(this.app, this));
    this.addRibbonIcon("refresh-cw", "Akatsuki\u3092\u540C\u671F", () => void this.sync(true));
    this.addCommand({ id: "sync-now", name: "\u958B\u767A\u8A18\u9332\u3092\u4ECA\u3059\u3050\u540C\u671F", callback: () => void this.sync(true) });
    this.registerInterval(window.setInterval(() => {
      if (this.settings.autoSync) void this.sync(false);
    }, Math.max(5, this.settings.intervalMinutes) * 6e4));
    if (this.settings.autoSync && this.settings.serverUrl && this.settings.deviceToken) {
      this.app.workspace.onLayoutReady(() => void this.sync(false));
    }
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  baseUrl() {
    const url = new URL(this.settings.serverUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      throw new Error("\u516C\u958BURL\u306FHTTPS\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
    }
    return url.origin;
  }
  headers() {
    return { Authorization: `Bearer ${this.settings.deviceToken}` };
  }
  async ensureFolder(folder) {
    const normalized = (0, import_obsidian.normalizePath)(folder);
    if (!normalized) return;
    const parts = normalized.split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
    }
  }
  async localHash(path) {
    const file = this.app.vault.getFileByPath(path);
    if (!file) return null;
    return sha256(await this.app.vault.readBinary(file));
  }
  async sync(showResult) {
    if (this.syncing) return;
    if (!this.settings.serverUrl || !this.settings.deviceToken) {
      if (showResult) new import_obsidian.Notice("Akatsuki Sync\u306E\u516C\u958BURL\u3068\u63A5\u7D9A\u30B3\u30FC\u30C9\u3092\u8A2D\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      return;
    }
    this.syncing = true;
    try {
      const base = this.baseUrl();
      const response = await (0, import_obsidian.requestUrl)({ url: `${base}/api/obsidian/sync/index`, headers: this.headers() });
      const files = response.json.files;
      if (!Array.isArray(files)) throw new Error("\u540C\u671F\u4E00\u89A7\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
      await this.ensureFolder(this.settings.folder);
      let changed = 0;
      for (const remote of files) {
        if (!safeRelativePath(remote.path) || !/^[a-f0-9]{64}$/.test(remote.hash) || remote.size > 20 * 1024 * 1024) {
          throw new Error("\u540C\u671F\u30D5\u30A1\u30A4\u30EB\u306E\u60C5\u5831\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093\u3002");
        }
        const target = (0, import_obsidian.normalizePath)(`${this.settings.folder}/${remote.path}`);
        const currentHash = await this.localHash(target);
        if (currentHash === remote.hash) {
          this.settings.lastHashes[remote.path] = remote.hash;
          continue;
        }
        const previousRemoteHash = this.settings.lastHashes[remote.path];
        if (currentHash && previousRemoteHash && currentHash !== previousRemoteHash) {
          const file = this.app.vault.getFileByPath(target);
          if (file) {
            const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
            await this.app.vault.copy(file, (0, import_obsidian.normalizePath)(`${target}.\u624B\u5143\u306E\u5909\u66F4-${stamp}`));
          }
        }
        const parent = target.includes("/") ? target.slice(0, target.lastIndexOf("/")) : "";
        await this.ensureFolder(parent);
        const download = await (0, import_obsidian.requestUrl)({
          url: `${base}/api/obsidian/sync/file?path=${encodeURIComponent(remote.path)}`,
          headers: this.headers()
        });
        if (await sha256(download.arrayBuffer) !== remote.hash) throw new Error(`${remote.path}\u306E\u5185\u5BB9\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002`);
        const existing = this.app.vault.getFileByPath(target);
        if (existing) await this.app.vault.modifyBinary(existing, download.arrayBuffer);
        else await this.app.vault.createBinary(target, download.arrayBuffer);
        this.settings.lastHashes[remote.path] = remote.hash;
        changed++;
      }
      await this.saveSettings();
      if (showResult) new import_obsidian.Notice(changed ? `${changed}\u4EF6\u306E\u958B\u767A\u8A18\u9332\u3092\u540C\u671F\u3057\u307E\u3057\u305F\u3002` : "\u958B\u767A\u8A18\u9332\u306F\u6700\u65B0\u3067\u3059\u3002");
    } catch (error) {
      console.error("Akatsuki Sync failed", error instanceof Error ? error.message : "unknown error");
      if (showResult) new import_obsidian.Notice(error instanceof Error ? error.message : "\u540C\u671F\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
    } finally {
      this.syncing = false;
    }
  }
};
var AkatsukiSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  plugin;
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Akatsuki Sync").setHeading();
    containerEl.createEl("p", {
      text: "\u516C\u958B\u3057\u305FAkatsuki\u30A2\u30D7\u30EA\u304B\u3089\u958B\u767A\u8A18\u9332\u3092\u81EA\u52D5\u53D6\u5F97\u3057\u307E\u3059\u3002\u63A5\u7D9A\u30B3\u30FC\u30C9\u306F\u8AAD\u307F\u53D6\u308A\u5C02\u7528\u3067\u3001\u7BA1\u7406\u8005\u304C\u505C\u6B62\u3067\u304D\u307E\u3059\u3002",
      cls: "akatsuki-sync-status"
    });
    new import_obsidian.Setting(containerEl).setName("\u30A2\u30D7\u30EA\u306E\u516C\u958BURL").addText((text) => text.setPlaceholder("https://example.com").setValue(this.plugin.settings.serverUrl).onChange(async (value) => {
      this.plugin.settings.serverUrl = value.trim();
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Obsidian\u63A5\u7D9A\u30B3\u30FC\u30C9").setDesc("\u30D1\u30B9\u30EF\u30FC\u30C9\u3068\u306F\u5225\u306E\u8AAD\u307F\u53D6\u308A\u5C02\u7528\u30B3\u30FC\u30C9\u3067\u3059\u3002").addText((text) => {
      text.inputEl.type = "password";
      return text.setValue(this.plugin.settings.deviceToken).onChange(async (value) => {
        this.plugin.settings.deviceToken = value.trim();
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("\u4FDD\u5B58\u30D5\u30A9\u30EB\u30C0").addText((text) => text.setValue(this.plugin.settings.folder).onChange(async (value) => {
      const normalized = (0, import_obsidian.normalizePath)(value.trim());
      if (normalized && safeRelativePath(normalized)) this.plugin.settings.folder = normalized;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u81EA\u52D5\u540C\u671F").addToggle((toggle) => toggle.setValue(this.plugin.settings.autoSync).onChange(async (value) => {
      this.plugin.settings.autoSync = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u78BA\u8A8D\u9593\u9694\uFF08\u5206\uFF09").setDesc("5\u301C1440\u5206").addText((text) => text.setValue(String(this.plugin.settings.intervalMinutes)).onChange(async (value) => {
      const minutes = Number(value);
      if (Number.isInteger(minutes) && minutes >= 5 && minutes <= 1440) this.plugin.settings.intervalMinutes = minutes;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u63A5\u7D9A\u3092\u78BA\u8A8D").addButton((button) => button.setButtonText("\u4ECA\u3059\u3050\u540C\u671F").setCta().onClick(() => void this.plugin.sync(true)));
  }
};
