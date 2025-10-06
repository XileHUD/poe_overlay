import { createApp } from 'vue';

const app = createApp({
  data() {
    return { dataDir: '' };
  },
  async mounted() {
    try { this.dataDir = await (window as any).electronAPI.getDataDir(); } catch {}
  },
  methods: {
    async browseDataDir() {
      try {
        const picked = prompt('Enter path to your JSON data folder');
        if (!picked) return;
        const res = await (window as any).electronAPI.setDataDir(picked);
        if (res?.ok) {
          this.dataDir = res.dataDir;
          await (window as any).electronAPI.reloadData();
          alert('Data directory updated and JSON reloaded.');
        } else {
          alert('Invalid directory');
        }
      } catch {}
    },
    async openDataDir() {
      try { await (window as any).electronAPI.openDataDir?.(); } catch {}
    },
    async reloadData() {
      try { await (window as any).electronAPI.reloadData(); alert('Data reloaded'); } catch {}
    }
  },
  template: `
    <div style="padding: 20px; font-family: 'Segoe UI', sans-serif;">
  <h1>XileHUD – Settings</h1>
      <div style="margin-top: 16px;">
        <h3>Data directory</h3>
        <div style="display:flex; gap:8px; align-items:center;">
          <input style="flex:1; padding:6px;" :value="dataDir" readonly />
          <button @click="browseDataDir">Change…</button>
          <button @click="openDataDir">Open</button>
          <button @click="reloadData">Reload JSON</button>
        </div>
        <p style="color:#888; margin-top:6px;">Place updated .json files here; click Reload to apply without restarting.</p>
      </div>
    </div>
  `
});

app.mount('#app');