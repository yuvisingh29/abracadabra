// ============================
// Gemini Flash Image Generator
// ============================

const API_KEY_B64 = "QUl6YVN5QkFsR2dvMEFOZ0RvS2lFdFBaRl9LRGV2TzFyVHRsWVNJCgo=";
const API_KEY = atob(API_KEY_B64).trim();
const MODEL_ID = "gemini-2.5-flash-image";

const promptEl = document.getElementById("prompt");
const fileEl = document.getElementById("images");
const goEl = document.getElementById("go");
const cancelEl = document.getElementById("cancel");
const resultEl = document.getElementById("result");
const progressEl = document.getElementById("progress");

const openPresetsEl = document.getElementById("open-presets");
const modalEl = document.getElementById("preset-modal");
const backdropEl = document.getElementById("preset-backdrop");
const closePresetsEl = document.getElementById("close-presets");
const listEl = document.getElementById("preset-list");
const searchEl = document.getElementById("preset-search");

let running = false, controller = null, files = [];
let presetsCache = [];

// ============================
// File and Encoding Functions
// ============================

fileEl.addEventListener("change", e => { files = Array.from(e.target.files || []); });

const toB64 = f => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(f);
});

function bodyOf(prompt, encoded) {
    return {
        contents: [{
            role: "user",
            parts: [
                ...(prompt ? [{ text: prompt }] : []),
                ...(encoded || []).map(x => ({ inlineData: { mimeType: x.type, data: x.b64 } }))
            ]
        }],
        generationConfig: { responseModalities: ["IMAGE"], temperature: 1.0 }
    };
}

// ============================
// Gemini API Call
// ============================

async function callGemini(body, signal) {
    const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${API_KEY}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal }
    );
    const j = await r.json();
    let img = null;
    (j?.candidates || []).forEach(c =>
        (c?.content?.parts || []).forEach(p => {
            if (!img && p?.inlineData?.data)
                img = { mime: p.inlineData.mimeType || "image/png", b64: p.inlineData.data };
        })
    );
    return img;
}

// ============================
// UI Logic
// ============================

function setBusy(b) { running = b; goEl.disabled = b; cancelEl.disabled = !b; }

cancelEl.addEventListener("click", () => {
    if (controller) controller.abort();
    setBusy(false);
});

goEl.addEventListener("click", async () => {
    if (running) return;
    setBusy(true);
    resultEl.innerHTML = "";
    progressEl.textContent = "0/6";

    const encoded = files.length
        ? await Promise.all(files.map(async f => ({ b64: await toB64(f), type: f.type })))
        : [];

    const need = 6;
    let got = 0;

    while (running && got < need) {
        controller = new AbortController();
        const body = bodyOf(promptEl.value.trim(), encoded);
        let img = null;
        try { img = await callGemini(body, controller.signal); } catch { }
        if (!running) break;
        if (img && img.b64) {
            const el = document.createElement("img");
            el.src = `data:${img.mime};base64,${img.b64}`;
            resultEl.appendChild(el);
            got++;
            progressEl.textContent = `${got}/6`;
        }
    }
    setBusy(false);
});

// ============================
// Presets Modal Logic
// ============================

function openPresets() {
    modalEl.classList.add("show");
    modalEl.setAttribute("aria-hidden", "false");
    if (!presetsCache.length) loadPresets();
    searchEl.value = "";
    searchEl.focus();
}

function closePresets() {
    modalEl.classList.remove("show");
    modalEl.setAttribute("aria-hidden", "true");
}

openPresetsEl.addEventListener("click", openPresets);
closePresetsEl.addEventListener("click", closePresets);
backdropEl.addEventListener("click", closePresets);
document.addEventListener("keydown", e => {
    if (e.key === "Escape" && modalEl.classList.contains("show")) closePresets();
});

function renderPresets(items) {
    listEl.innerHTML = "";
    items.forEach(p => {
        const card = document.createElement("div");
        card.className = "preset-card";

        const top = document.createElement("div");
        top.className = "preset-top";

        const title = document.createElement("h3");
        title.textContent = p.title || "untitled";

        const select = document.createElement("button");
        select.className = "preset-select";
        select.textContent = "select";

        top.appendChild(title);
        top.appendChild(select);

        const text = document.createElement("div");
        text.className = "preset-text";
        text.textContent = (p.text || "").trim();

        card.appendChild(top);
        card.appendChild(text);
        listEl.appendChild(card);

        select.addEventListener("click", () => {
            promptEl.value = text.textContent.trim();
            closePresets();
            promptEl.focus();
            promptEl.setSelectionRange(promptEl.value.length, promptEl.value.length);
        });
    });
}

async function loadPresets() {
    try {
        const res = await fetch("presets.json", { cache: "no-store" });
        if (!res.ok) throw new Error("failed to load");
        const data = await res.json();
        presetsCache = Array.isArray(data?.presets) ? data.presets : [];
        renderPresets(presetsCache);
    } catch {
        listEl.innerHTML = "<p>couldn’t load presets.json. run a local server if opening locally.</p>";
    }
}

searchEl.addEventListener("input", () => {
    const q = searchEl.value.toLowerCase().trim();
    if (!q) { renderPresets(presetsCache); return; }
    const filtered = presetsCache.filter(p =>
        (p.title || "").toLowerCase().includes(q) ||
        (p.text || "").toLowerCase().includes(q)
    );
    renderPresets(filtered);
});
