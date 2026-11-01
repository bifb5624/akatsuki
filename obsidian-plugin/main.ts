import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  normalizePath,
  requestUrl,
} from 'obsidian';

interface RemoteFile {
  path: string;
  hash: string;
  size: number;
}

interface SyncSettings {
  serverUrl: string;
  deviceToken: string;
  folder: string;
  intervalMinutes: number;
  autoSync: boolean;
  lastHashes: Record<string, string>;
}

const DEFAULTS: SyncSettings = {
  serverUrl: '',
  deviceToken: '',
  folder: 'akatsuki開発',
  intervalMinutes: 15,
  autoSync: true,
  lastHashes: {},
};

function safeRelativePath(value: string): boolean {
  if (!value || value.length > 240 || value.includes('\\') || value.startsWith('/')) return false;
  const parts = value.split('/');
  return parts.every(part => part && part !== '.' && part !== '..');
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export default class AkatsukiSyncPlugin extends Plugin {
  settings: SyncSettings = {...DEFAULTS};
  private syncing = false;

  async onload(): Promise<void> {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.addSettingTab(new AkatsukiSettingTab(this.app, this));
    this.addRibbonIcon('refresh-cw', 'Akatsukiを同期', () => void this.sync(true));
    this.addCommand({id: 'sync-now', name: '開発記録を今すぐ同期', callback: () => void this.sync(true)});
    this.registerInterval(window.setInterval(() => {
      if (this.settings.autoSync) void this.sync(false);
    }, Math.max(5, this.settings.intervalMinutes) * 60_000));
    if (this.settings.autoSync && this.settings.serverUrl && this.settings.deviceToken) {
      this.app.workspace.onLayoutReady(() => void this.sync(false));
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private baseUrl(): string {
    const url = new URL(this.settings.serverUrl);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      throw new Error('公開URLはHTTPSで入力してください。');
    }
    return url.origin;
  }

  private headers(): Record<string, string> {
    return {Authorization: `Bearer ${this.settings.deviceToken}`};
  }

  private async ensureFolder(folder: string): Promise<void> {
    const normalized = normalizePath(folder);
    if (!normalized) return;
    const parts = normalized.split('/');
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
    }
  }

  private async localHash(path: string): Promise<string | null> {
    const file = this.app.vault.getFileByPath(path);
    if (!file) return null;
    return sha256(await this.app.vault.readBinary(file));
  }

  async sync(showResult: boolean): Promise<void> {
    if (this.syncing) return;
    if (!this.settings.serverUrl || !this.settings.deviceToken) {
      if (showResult) new Notice('Akatsuki Syncの公開URLと接続コードを設定してください。');
      return;
    }
    this.syncing = true;
    try {
      const base = this.baseUrl();
      const response = await requestUrl({url: `${base}/api/obsidian/sync/index`, headers: this.headers()});
      const files = response.json.files as RemoteFile[];
      if (!Array.isArray(files)) throw new Error('同期一覧を確認できませんでした。');
      await this.ensureFolder(this.settings.folder);
      let changed = 0;
      for (const remote of files) {
        if (!safeRelativePath(remote.path) || !/^[a-f0-9]{64}$/.test(remote.hash) || remote.size > 20 * 1024 * 1024) {
          throw new Error('同期ファイルの情報が正しくありません。');
        }
        const target = normalizePath(`${this.settings.folder}/${remote.path}`);
        const currentHash = await this.localHash(target);
        if (currentHash === remote.hash) {
          this.settings.lastHashes[remote.path] = remote.hash;
          continue;
        }
        const previousRemoteHash = this.settings.lastHashes[remote.path];
        if (currentHash && previousRemoteHash && currentHash !== previousRemoteHash) {
          const file = this.app.vault.getFileByPath(target);
          if (file) {
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            await this.app.vault.copy(file, normalizePath(`${target}.手元の変更-${stamp}`));
          }
        }
        const parent = target.includes('/') ? target.slice(0, target.lastIndexOf('/')) : '';
        await this.ensureFolder(parent);
        const download = await requestUrl({
          url: `${base}/api/obsidian/sync/file?path=${encodeURIComponent(remote.path)}`,
          headers: this.headers(),
        });
        if (await sha256(download.arrayBuffer) !== remote.hash) throw new Error(`${remote.path}の内容を確認できませんでした。`);
        const existing = this.app.vault.getFileByPath(target);
        if (existing) await this.app.vault.modifyBinary(existing, download.arrayBuffer);
        else await this.app.vault.createBinary(target, download.arrayBuffer);
        this.settings.lastHashes[remote.path] = remote.hash;
        changed++;
      }
      await this.saveSettings();
      if (showResult) new Notice(changed ? `${changed}件の開発記録を同期しました。` : '開発記録は最新です。');
    } catch (error) {
      console.error('Akatsuki Sync failed', error instanceof Error ? error.message : 'unknown error');
      if (showResult) new Notice(error instanceof Error ? error.message : '同期できませんでした。');
    } finally {
      this.syncing = false;
    }
  }
}

class AkatsukiSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: AkatsukiSyncPlugin) {
    super(app, plugin);
  }

  display(): void {
    const {containerEl} = this;
    containerEl.empty();
    new Setting(containerEl).setName('Akatsuki Sync').setHeading();
    containerEl.createEl('p', {
      text: '公開したAkatsukiアプリから開発記録を自動取得します。接続コードは読み取り専用で、管理者が停止できます。',
      cls: 'akatsuki-sync-status',
    });
    new Setting(containerEl).setName('アプリの公開URL').addText(text => text
      .setPlaceholder('https://example.com')
      .setValue(this.plugin.settings.serverUrl)
      .onChange(async value => {
        this.plugin.settings.serverUrl = value.trim();
        await this.plugin.saveSettings();
      }));
    new Setting(containerEl).setName('Obsidian接続コード').setDesc('パスワードとは別の読み取り専用コードです。').addText(text => {
      text.inputEl.type = 'password';
      return text.setValue(this.plugin.settings.deviceToken).onChange(async value => {
        this.plugin.settings.deviceToken = value.trim();
        await this.plugin.saveSettings();
      });
    });
    new Setting(containerEl).setName('保存フォルダ').addText(text => text
      .setValue(this.plugin.settings.folder)
      .onChange(async value => {
        const normalized = normalizePath(value.trim());
        if (normalized && safeRelativePath(normalized)) this.plugin.settings.folder = normalized;
        await this.plugin.saveSettings();
      }));
    new Setting(containerEl).setName('自動同期').addToggle(toggle => toggle
      .setValue(this.plugin.settings.autoSync)
      .onChange(async value => {
        this.plugin.settings.autoSync = value;
        await this.plugin.saveSettings();
      }));
    new Setting(containerEl).setName('確認間隔（分）').setDesc('5〜1440分').addText(text => text
      .setValue(String(this.plugin.settings.intervalMinutes))
      .onChange(async value => {
        const minutes = Number(value);
        if (Number.isInteger(minutes) && minutes >= 5 && minutes <= 1440) this.plugin.settings.intervalMinutes = minutes;
        await this.plugin.saveSettings();
      }));
    new Setting(containerEl).setName('接続を確認').addButton(button => button
      .setButtonText('今すぐ同期')
      .setCta()
      .onClick(() => void this.plugin.sync(true)));
  }
}
