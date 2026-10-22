import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const STORE_KEY = "SysBar.config.v1";

const DEFAULTS = {
  interval: 1000,
  mode: "both", // "percent" | "values" | "both"
  show: {
    cpu: true,
    cpuTemp: true,
    ram: true,
    gpuUtil: true,
    vram: true,
    gpuTemp: true,
    diskUsage: false,
    diskIO: false,
    versions: false,
  },
};

const COLORS = {
  cpu: "#86b6dc",       // soft sky
  cpuTemp: "#e6a883",   // peach
  ram: "#a99be0",       // lavender
  gpuUtil: "#82c8a2",   // sage mint
  vram: "#72bcbc",      // teal
  gpuTemp: "#e59d93",   // salmon
  diskUsage: "#dccb8f", // butter
  diskIO: "#d594ba",    // mauve
};

const LABELS = {
  cpu: "CPU",
  cpuTemp: "CPU Temp",
  ram: "RAM",
  gpuUtil: "Util",
  vram: "VRAM",
  gpuTemp: "Temp",
  diskUsage: "Disk",
  diskIO: "Disk IO",
  versions: "Versions",
};

const TOGGLE_NAMES = {
  cpu: "CPU usage",
  cpuTemp: "CPU temperature (only if your system exposes it)",
  ram: "RAM",
  gpuUtil: "GPU utilisation",
  vram: "VRAM",
  gpuTemp: "GPU temperature",
  diskUsage: "Disk usage (output drive)",
  diskIO: "Disk read / write speed",
  versions: "Python / torch / ComfyUI versions",
};

function loadConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    return {
      ...DEFAULTS,
      ...raw,
      show: { ...DEFAULTS.show, ...(raw.show || {}) },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

let config = loadConfig();
const saveConfig = () => localStorage.setItem(STORE_KEY, JSON.stringify(config));

/* ---------- formatting ---------- */

const GB = 1024 ** 3;
const fmtGB = (b) => {
  const g = b / GB;
  return g >= 100 ? g.toFixed(0) : g.toFixed(1);
};
const fmtPair = (used, total) => `${fmtGB(used)}/${fmtGB(total)}G`;
const fmtRate = (bps) => {
  const mb = bps / 1024 ** 2;
  return mb >= 100 ? `${mb.toFixed(0)}M/s` : `${mb.toFixed(1)}M/s`;
};
const pct = (v) => `${Math.round(v)}%`;

function valueText(percent, used, total) {
  const p = pct(percent);
  const v = fmtPair(used, total);
  if (config.mode === "percent") return p;
  if (config.mode === "values") return v;
  return `${p}  ${v}`;
}

/* ---------- styles ---------- */

const css = `
.sysbar{display:flex;align-items:stretch;gap:3px;height:36px;padding:3px;
  background:linear-gradient(180deg,#26252d,#1d1c23);border:1px solid rgba(190,175,230,.22);
  border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.35);
  font:600 11px/1 "Segoe UI",system-ui,sans-serif;color:#f3f0f8;user-select:none;
  z-index:1000;box-sizing:border-box;flex:0 0 auto}
.sysbar.sb-floating{position:fixed;top:8px;right:520px}
.sysbar .sb-meter{position:relative;display:flex;align-items:center;justify-content:space-between;
  gap:8px;padding:0 8px;min-width:64px;background:#2d2c36;border-radius:7px;overflow:hidden;
  white-space:nowrap;box-shadow:inset 0 1px 0 rgba(255,255,255,.06);
  transition:background .25s ease,box-shadow .25s ease}
.sysbar .sb-meter:hover{background:#363543;box-shadow:inset 0 1px 0 rgba(255,255,255,.1),0 0 0 1px var(--c)}
.sysbar .sb-fill,.sysbar .sb-warn{position:absolute;inset:0;pointer-events:none}
.sysbar .sb-fill{transform-origin:left center;transform:scaleX(0);will-change:transform;
  background:linear-gradient(90deg,color-mix(in srgb,var(--c) 82%,transparent),
  color-mix(in srgb,var(--c) 50%,transparent))}
.sysbar .sb-warn{opacity:0;background:linear-gradient(90deg,rgba(244,143,166,0),rgba(244,143,166,.6))}
.sysbar .sb-label,.sysbar .sb-val{position:relative;z-index:1;text-shadow:0 1px 3px rgba(20,18,30,.65)}
.sysbar .sb-label{font-weight:600;letter-spacing:.01em}
.sysbar .sb-val{font-variant-numeric:tabular-nums;font-weight:700}
.sysbar .sb-text{display:flex;align-items:center;padding:0 10px;background:#2d2c36;
  border-radius:7px;color:#cdc6dc;font-weight:500;white-space:nowrap}
.sysbar .sb-gear{width:32px;display:flex;align-items:center;justify-content:center;
  background:#2d2c36;border-radius:7px;cursor:pointer;color:#d9d1ec;font-size:15px;
  transition:background .25s ease,color .25s ease}
.sysbar .sb-gear span{display:block;transition:transform .55s cubic-bezier(.2,.8,.2,1)}
.sysbar .sb-gear:hover{background:#3b3a4a;color:#fff}
.sysbar .sb-gear:hover span,.sysbar .sb-gear.open span{transform:rotate(90deg)}
.sysbar .sb-new{animation:sb-in .35s cubic-bezier(.2,.8,.2,1)}
@keyframes sb-in{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}
.sysbar-panel{position:fixed;z-index:10000;width:340px;padding:14px 16px;
  background:#24232b;border:1px solid rgba(190,175,230,.25);border-radius:12px;color:#f3f0f8;
  font:13px/1.4 "Segoe UI",system-ui,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.55);
  animation:sb-pop .22s cubic-bezier(.2,.8,.2,1);accent-color:#a99be0}
@keyframes sb-pop{from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:none}}
.sysbar-panel h4{margin:0 0 8px;font-size:13px;font-weight:600;color:#d9cff6}
.sysbar-panel label{display:flex;align-items:center;gap:8px;padding:3px 0;cursor:pointer}
.sysbar-panel .sb-row{display:flex;align-items:center;justify-content:space-between;
  gap:10px;padding:8px 0 2px;border-top:1px solid rgba(190,175,230,.16);margin-top:8px}
.sysbar-panel select,.sysbar-panel input[type=number]{background:#2f2e39;color:#f3f0f8;
  border:1px solid rgba(190,175,230,.28);border-radius:6px;padding:3px 8px;font:inherit;width:124px}
.sysbar-panel button{background:#3a3949;color:#f3f0f8;border:1px solid rgba(190,175,230,.28);
  border-radius:6px;padding:4px 12px;cursor:pointer;font:inherit;transition:background .2s}
.sysbar-panel button:hover{background:#4a4860}
@media (prefers-reduced-motion:reduce){
  .sysbar *,.sysbar-panel{animation:none!important;transition:none!important}}
`;

function injectStyle() {
  const s = document.createElement("style");
  s.textContent = css;
  document.head.appendChild(s);
}

/* ---------- DOM ---------- */

const root = document.createElement("div");
root.className = "sysbar";
const meters = new Map(); // key -> {el, fill, val}
let lastData = null;

const NUM = /-?\d+(?:\.\d+)?/g;
const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
let raf = 0;

function getMeter(key, label, color) {
  let m = meters.get(key);
  if (!m) {
    const el = document.createElement("div");
    el.className = "sb-meter sb-new";
    el.style.setProperty("--c", color);
    const fill = document.createElement("div");
    fill.className = "sb-fill";
    const warn = document.createElement("div");
    warn.className = "sb-warn";
    const l = document.createElement("span");
    l.className = "sb-label";
    const val = document.createElement("span");
    val.className = "sb-val";
    el.append(fill, warn, l, val);
    m = { el, fill, warn, val, label: l, cur: 0, from: 0, to: 0, t0: 0, dur: 0,
          skel: null, curN: [], fromN: [], toN: [], dec: [], w: 0, warnable: true };
    meters.set(key, m);
    setTimeout(() => el.classList.remove("sb-new"), 450);
  }
  if (m.label.textContent !== label) m.label.textContent = label;
  return m;
}

function setMeter(key, label, color, percent, text, title) {
  const m = getMeter(key, label, color);
  const target = Math.max(0, Math.min(100, percent ?? 0));
  m.from = m.cur;
  m.to = target;
  m.t0 = performance.now();
  m.dur = reduceMotion ? 0 : Math.min(config.interval * 0.95, 1200);
  m.warnable = !/Disk IO/.test(label);

  // Tween the numbers inside the text so they glide with the bar.
  const nt = text.match(NUM) || [];
  const skel = text.replace(NUM, "#");
  m.toN = nt.map(Number);
  m.dec = nt.map((x) => (x.split(".")[1] || "").length);
  if (skel === m.skel && m.curN.length === nt.length) {
    m.fromN = m.curN.slice();
  } else {
    m.fromN = m.toN.slice();
    m.curN = m.toN.slice();
    m.skel = skel;
  }
  if (m.el.title !== (title || "")) m.el.title = title || "";

  // Grow-only minimum width so the bar never jitters as digits change.
  m.val.textContent = text;
  if (m.el.isConnected) {
    const w = m.el.offsetWidth;
    if (w > m.w) { m.w = w; m.el.style.minWidth = `${w}px`; }
  }
  kick();
  return m.el;
}

function kick() {
  if (!raf) raf = requestAnimationFrame(frame);
}

function frame(now) {
  let active = false;
  for (const m of meters.values()) {
    if (!m.fill) continue;
    const p = m.dur ? Math.min(1, (now - m.t0) / m.dur) : 1;
    const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
    m.cur = m.from + (m.to - m.from) * e;
    m.fill.style.transform = `scaleX(${m.cur / 100})`;
    m.warn.style.opacity = m.warnable ? Math.max(0, Math.min(1, (m.cur - 78) / 18)) : 0;
    let i = 0;
    m.curN = m.toN.map((t, k) => m.fromN[k] + (t - m.fromN[k]) * e);
    m.val.textContent = m.skel.replace(/#/g, () => {
      const k = i++;
      return m.curN[k].toFixed(m.dec[k]);
    });
    if (p < 1) active = true;
  }
  raf = active ? requestAnimationFrame(frame) : 0;
}

function resetWidths() {
  for (const m of meters.values()) {
    if (m.fill) { m.w = 0; m.el.style.minWidth = ""; }
  }
}

function render(d) {
  lastData = d;
  const els = [];
  const s = config.show;

  if (s.cpu && d.cpu != null) {
    els.push(setMeter("cpu", "CPU", COLORS.cpu, d.cpu, pct(d.cpu), "CPU utilisation"));
  }
  if (s.cpuTemp && d.cpu_temp != null) {
    els.push(setMeter("cpuTemp", "CPU Temp", COLORS.cpuTemp, d.cpu_temp,
      `${Math.round(d.cpu_temp)}°`, "CPU temperature"));
  }
  if (s.ram && d.ram) {
    els.push(setMeter("ram", "RAM", COLORS.ram, d.ram.percent,
      valueText(d.ram.percent, d.ram.used, d.ram.total),
      `RAM: ${fmtGB(d.ram.used)} GB used of ${fmtGB(d.ram.total)} GB`));
  }
  for (const g of d.gpus || []) {
    const tag = d.gpus.length > 1 ? `GPU${g.index}` : "GPU";
    if (s.gpuUtil && g.util != null) {
      els.push(setMeter(`gpuUtil${g.index}`, `${tag} Util`, COLORS.gpuUtil, g.util,
        pct(g.util), g.name));
    }
    if (s.vram && g.vram_total) {
      const p = (g.vram_used / g.vram_total) * 100;
      els.push(setMeter(`vram${g.index}`, `${tag} VRAM`, COLORS.vram, p,
        valueText(p, g.vram_used, g.vram_total),
        `${g.name}: ${fmtGB(g.vram_used)} GB used of ${fmtGB(g.vram_total)} GB`));
    }
    if (s.gpuTemp && g.temp != null) {
      els.push(setMeter(`gpuTemp${g.index}`, `${tag} Temp`, COLORS.gpuTemp,
        Math.min(100, g.temp), `${Math.round(g.temp)}°`, `${g.name} temperature`));
    }
  }
  if ((s.diskUsage || s.diskIO) && d.disk) {
    const dk = d.disk;
    if (s.diskUsage && dk.total) {
      const p = (dk.used / dk.total) * 100;
      els.push(setMeter("diskUsage", `Disk ${dk.path}`, COLORS.diskUsage, p,
        valueText(p, dk.used, dk.total), "Drive holding the ComfyUI output folder"));
    }
    if (s.diskIO) {
      els.push(setMeter("diskIO", "Disk IO", COLORS.diskIO, 0,
        `R ${fmtRate(dk.read)}  W ${fmtRate(dk.write)}`, "System-wide disk read / write"));
    }
  }
  if (s.versions && d.versions) {
    const v = d.versions;
    const parts = [`Py ${v.python}`];
    if (v.torch) parts.push(`Torch ${v.torch}${v.cuda ? ` (CUDA ${v.cuda})` : ""}`);
    if (v.comfyui) parts.push(`ComfyUI ${v.comfyui}`);
    let t = meters.get("versions");
    if (!t) {
      const el = document.createElement("div");
      el.className = "sb-text";
      t = { el };
      meters.set("versions", t);
    }
    t.el.textContent = parts.join("  |  ");
    els.push(t.el);
  }

  const gear = root.querySelector(".sb-gear") || makeGear();
  const next = [...els, gear];
  const same = next.length === root.children.length && next.every((n, i) => root.children[i] === n);
  if (!same) root.replaceChildren(...next);
}

function makeGear() {
  const g = document.createElement("div");
  g.className = "sb-gear";
  g.title = "SysBar settings";
  const sp = document.createElement("span");
  sp.textContent = "⚙";
  g.appendChild(sp);
  g.addEventListener("click", togglePanel);
  return g;
}

/* ---------- settings panel ---------- */

let panel = null;

function togglePanel() {
  const gearEl = root.querySelector(".sb-gear");
  if (panel) {
    panel.remove();
    panel = null;
    gearEl?.classList.remove("open");
    return;
  }
  gearEl?.classList.add("open");
  panel = document.createElement("div");
  panel.className = "sysbar-panel";
  const r = root.getBoundingClientRect();
  panel.style.top = `${r.bottom + 6}px`;
  panel.style.left = `${Math.max(8, Math.min(r.right - 330, window.innerWidth - 340))}px`;

  const h = document.createElement("h4");
  h.textContent = "System monitor";
  panel.appendChild(h);

  for (const key of Object.keys(DEFAULTS.show)) {
    const lab = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = config.show[key];
    cb.addEventListener("change", () => {
      config.show[key] = cb.checked;
      saveConfig();
      if (lastData) render(lastData);
    });
    lab.append(cb, TOGGLE_NAMES[key]);
    panel.appendChild(lab);
  }

  const modeRow = document.createElement("div");
  modeRow.className = "sb-row";
  const modeSel = document.createElement("select");
  for (const [v, t] of [["both", "% and amount"], ["percent", "% only"], ["values", "Amount only"]]) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = t;
    o.selected = config.mode === v;
    modeSel.appendChild(o);
  }
  modeSel.addEventListener("change", () => {
    config.mode = modeSel.value;
    saveConfig();
    resetWidths();
    if (lastData) render(lastData);
  });
  modeRow.append("RAM / VRAM display", modeSel);
  panel.appendChild(modeRow);

  const intRow = document.createElement("div");
  intRow.className = "sb-row";
  const inp = document.createElement("input");
  inp.type = "number";
  inp.min = 250;
  inp.step = 250;
  inp.value = config.interval;
  inp.addEventListener("change", () => {
    config.interval = Math.max(250, Number(inp.value) || 1000);
    saveConfig();
    restartPolling();
  });
  intRow.append("Refresh (ms)", inp);
  panel.appendChild(intRow);

  const btnRow = document.createElement("div");
  btnRow.className = "sb-row";
  const reset = document.createElement("button");
  reset.textContent = "Reset to defaults";
  reset.addEventListener("click", () => {
    config = structuredClone(DEFAULTS);
    saveConfig();
    resetWidths();
    restartPolling();
    togglePanel();
    togglePanel();
    if (lastData) render(lastData);
  });
  const close = document.createElement("button");
  close.textContent = "Close";
  close.addEventListener("click", togglePanel);
  btnRow.append(reset, close);
  panel.appendChild(btnRow);

  document.body.appendChild(panel);
}

document.addEventListener("mousedown", (e) => {
  if (panel && !panel.contains(e.target) && !root.contains(e.target)) togglePanel();
});

/* ---------- docking ---------- */

// Candidate anchors, tried in order. The monitor is inserted *before* the anchor,
// so it sits to the left of the Run / Manager cluster, like Crystools does.
const ANCHORS = [
  () => app.menu?.settingsGroup?.element, // legacy menu used by pysssss
  () => document.querySelector(".actionbar-container"),
  () => document.querySelector(".actionbar"),
  () => document.querySelector("[class*='actionbar']"),
];

function dock() {
  if (root.isConnected && !root.classList.contains("sb-floating")) return true;
  for (const find of ANCHORS) {
    const a = find();
    if (a && a.parentElement) {
      root.classList.remove("sb-floating");
      a.parentElement.insertBefore(root, a);
      return true;
    }
  }
  return false;
}

function ensureDocked() {
  if (root.isConnected && !root.classList.contains("sb-floating")) return;
  if (!dock() && !root.isConnected) {
    root.classList.add("sb-floating");
    document.body.appendChild(root);
  }
}

/* ---------- polling ---------- */

let timer = null;
let busy = false;

async function tick() {
  if (busy || document.hidden) return;
  busy = true;
  try {
    const res = await api.fetchApi("/sysbar/stats");
    if (res.ok) render(await res.json());
  } catch (e) {
    /* server restarting; try again next tick */
  } finally {
    busy = false;
  }
}

function restartPolling() {
  if (timer) clearInterval(timer);
  timer = setInterval(tick, config.interval);
  tick();
}

app.registerExtension({
  name: "SysBar.TopBarMonitor",
  async setup() {
    injectStyle();
    root.appendChild(makeGear());
    ensureDocked();
    // The new frontend re-renders its top bar, so re-dock if we get removed.
    setInterval(ensureDocked, 1500);
    restartPolling();
  },
});
