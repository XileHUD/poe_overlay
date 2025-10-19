import { bindImageFallback } from "../../crafting/utils/imageFallback";
import { TRANSPARENT_PLACEHOLDER, createPlaceholderSvg } from "../../crafting/utils/imagePlaceholder";
import { sanitizeCraftingHtml } from "../../utils";
import { prepareCharacterPanel } from "../utils";

type AscendancyPassive = {
	name: string;
	ascendancy?: string;
	character?: string;
	explicitMods?: string[];
	image?: string;
	imageLocal?: string;
	stack_current?: number;
	stack_max?: number;
};

type AscendancyState = {
	panelEl: HTMLElement | null;
	passives: AscendancyPassive[];
	cardsWrap: HTMLElement | null;
	filterWrap: HTMLElement | null;
	searchInput: HTMLInputElement | null;
	selectedAscendancies: Set<string>;
	classes: string[];
	filterTimer: number | null;
};

const PLACEHOLDER_ICON = createPlaceholderSvg(46, 46, "?");

const state: AscendancyState = {
	panelEl: null,
	passives: [],
	cardsWrap: null,
	filterWrap: null,
	searchInput: null,
	selectedAscendancies: new Set<string>(),
	classes: [],
	filterTimer: null
};

function ensurePanel(): HTMLElement {
	const panel = prepareCharacterPanel("Ascendancy Passives");
	state.panelEl = panel;
	return panel;
}

function resolveImage(entry: AscendancyPassive): string {
	if (entry.imageLocal) return entry.imageLocal;
	if (entry.image) return entry.image;
	return "";
}

function cleanModText(mod: string): string {
	const sanitized = sanitizeCraftingHtml(mod)
		.replace(/<img[^>]*grantsSkill[^>]*>/gi, "")
		.replace(/<img[^>]*>/gi, "")
		.trim();
	return highlightNumbers(sanitized);
}

function highlightNumbers(text: string): string {
	return text
		.replace(/(\d+\s*[–-]\s*\d+)/g, '<span class="mod-value">$1</span>')
		.replace(/(?<![A-Za-z0-9>])([+\-]?\d+)(?![A-Za-z0-9<])/g, '<span class="mod-value">$1</span>')
		.replace(/(\d+%)/g, '<span class="mod-value">$1</span>');
}

function renderFilters(): void {
	const wrap = state.filterWrap;
	if (!wrap) return;
	wrap.innerHTML = "";
	state.classes.forEach(asc => {
		const button = document.createElement("button");
		button.type = "button";
		const active = state.selectedAscendancies.has(asc);
		button.textContent = asc;
		button.style.cssText = `padding:3px 8px; font-size:11px; border-radius:4px; cursor:pointer; border:1px solid var(--border-color); background:${active ? 'var(--accent-blue)' : 'var(--bg-tertiary)'}; color:${active ? '#fff' : 'var(--text-primary)'};`;
		button.addEventListener("click", () => {
			if (active) {
				state.selectedAscendancies.delete(asc);
			} else {
				state.selectedAscendancies.add(asc);
			}
			renderFilters();
			applyFilter();
		});
		wrap.appendChild(button);
	});
	if (state.selectedAscendancies.size) {
		const reset = document.createElement("button");
		reset.type = "button";
		reset.textContent = "Reset";
		reset.style.cssText = "padding:3px 8px; font-size:11px; border-radius:4px; cursor:pointer; background:var(--accent-red); color:#fff; border:1px solid var(--accent-red);";
		reset.addEventListener("click", () => {
			state.selectedAscendancies.clear();
			renderFilters();
			applyFilter();
		});
		wrap.appendChild(reset);
	}
}

function createCard(entry: AscendancyPassive): HTMLElement {
	const card = document.createElement("div");
	card.style.background = "var(--bg-card)";
	card.style.border = "1px solid var(--border-color)";
	card.style.borderRadius = "6px";
	card.style.padding = "6px";
	card.style.display = "flex";
	card.style.flexDirection = "column";
	card.style.gap = "4px";

	const header = document.createElement("div");
	header.style.display = "flex";
	header.style.gap = "10px";
	header.style.alignItems = "flex-start";

	const img = document.createElement("img");
	img.className = "asc-img";
	img.width = 46;
	img.height = 46;
	img.style.width = "46px";
	img.style.height = "46px";
	img.style.objectFit = "contain";
	img.src = TRANSPARENT_PLACEHOLDER;
	const path = resolveImage(entry);
	if (path) {
		img.setAttribute("data-orig-src", path);
	} else {
		img.src = PLACEHOLDER_ICON;
		img.style.opacity = "0.5";
		img.style.filter = "grayscale(1)";
	}

	header.appendChild(img);

	const body = document.createElement("div");
	body.style.display = "flex";
	body.style.flexDirection = "column";
	body.style.gap = "6px";
	body.style.flex = "1";

	const title = document.createElement("div");
	title.style.fontWeight = "600";
	title.style.fontSize = "13px";
	title.textContent = entry.name;
	body.appendChild(title);

	const meta = document.createElement("div");
	meta.style.display = "flex";
	meta.style.flexWrap = "wrap";
	meta.style.gap = "6px";
	const metaParts: string[] = [];
	if (entry.ascendancy) {
		metaParts.push(`<span style="background:var(--accent-blue); color:#fff; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600; letter-spacing:0.3px;">${entry.ascendancy}</span>`);
	}
	if (entry.character) {
		metaParts.push(`<span style="background:var(--bg-tertiary); color:var(--text-primary); padding:2px 8px; border-radius:12px; font-size:11px;">${entry.character}</span>`);
	}
	if (entry.stack_current != null && entry.stack_max != null) {
		metaParts.push(`<span>Stack: ${entry.stack_current} / ${entry.stack_max}</span>`);
	}
	meta.innerHTML = metaParts.join("");
	if (meta.childElementCount || meta.innerHTML) {
		body.appendChild(meta);
	}

	const desc = document.createElement("div");
	desc.style.fontSize = "11px";
	const mods = (entry.explicitMods || []).map(cleanModText).filter(Boolean).join("<br>");
	desc.innerHTML = mods;
	body.appendChild(desc);

	header.appendChild(body);
	card.appendChild(header);

	const searchBlob = [
		entry.name,
		entry.ascendancy || "",
		entry.character || "",
		(entry.explicitMods || []).join(" ")
	].join(" ").toLowerCase();
	card.dataset.search = searchBlob;
	card.dataset.ascendancy = (entry.ascendancy || "").toLowerCase();

	return card;
}

function renderCards(): void {
	const wrap = state.cardsWrap;
	if (!wrap) return;
	wrap.innerHTML = "";
	const fragment = document.createDocumentFragment();
	state.passives.forEach(passive => {
		fragment.appendChild(createCard(passive));
	});
	wrap.appendChild(fragment);
	bindImageFallback(wrap, ".asc-img", PLACEHOLDER_ICON, 0.5);
}

function renderPanel(panel: HTMLElement): void {
	panel.innerHTML = "";
	const wrapper = document.createElement("div");
	wrapper.className = "page-inner ascendancy-view";

	const controls = document.createElement("div");
	controls.style.display = "flex";
	controls.style.gap = "6px";
	controls.style.alignItems = "center";
	controls.style.marginBottom = "8px";

	const searchInput = document.createElement("input");
	searchInput.id = "ascSearch";
	searchInput.type = "text";
	searchInput.placeholder = "Search ascendancy passives...";
	searchInput.style.flex = "1";
	searchInput.style.padding = "4px 8px";
	searchInput.style.background = "var(--bg-tertiary)";
	searchInput.style.border = "1px solid var(--border-color)";
	searchInput.style.borderRadius = "4px";
	searchInput.style.color = "var(--text-primary)";
	searchInput.style.fontSize = "12px";

	const clearBtn = document.createElement("button");
	clearBtn.id = "ascClear";
	clearBtn.type = "button";
	clearBtn.textContent = "Clear";
	clearBtn.className = "pin-btn";
	clearBtn.style.padding = "4px 8px";

	controls.append(searchInput, clearBtn);

	const filterShell = document.createElement("div");
	filterShell.style.background = "var(--bg-secondary)";
	filterShell.style.padding = "8px";
	filterShell.style.borderRadius = "6px";
	filterShell.style.marginBottom = "8px";

	const filterWrap = document.createElement("div");
	filterWrap.id = "ascClassFilters";
	filterWrap.style.display = "flex";
	filterWrap.style.flexWrap = "wrap";
	filterWrap.style.gap = "6px";
	filterWrap.style.justifyContent = "center";
	filterWrap.style.width = "100%";
	filterShell.appendChild(filterWrap);

	const cardsWrap = document.createElement("div");
	cardsWrap.id = "ascWrap";
	cardsWrap.style.display = "grid";
	cardsWrap.style.gridTemplateColumns = "repeat(auto-fit, minmax(260px, 1fr))";
	cardsWrap.style.gap = "10px";

	wrapper.append(controls, filterShell, cardsWrap);
	panel.appendChild(wrapper);

	state.searchInput = searchInput;
	state.filterWrap = filterWrap;
	state.cardsWrap = cardsWrap;

	searchInput.addEventListener("input", () => scheduleFilter());
	clearBtn.addEventListener("click", () => {
		if (state.searchInput) {
			state.searchInput.value = "";
		}
		state.selectedAscendancies.clear();
		renderFilters();
		applyFilter();
		state.searchInput?.focus();
	});

	renderFilters();
	renderCards();
	applyFilter();
}

function scheduleFilter(): void {
	if (state.filterTimer) {
		window.clearTimeout(state.filterTimer);
	}
	state.filterTimer = window.setTimeout(() => {
		applyFilter();
	}, 120);
}

export function applyFilter(): void {
	const query = (state.searchInput?.value || "").trim().toLowerCase();
	const filterAsc = Array.from(state.selectedAscendancies);
	const wrap = state.cardsWrap;
	if (!wrap) return;

	const cards = Array.from(wrap.children) as HTMLElement[];
	cards.forEach(card => {
		const searchBlob = card.dataset.search || "";
		const asc = card.dataset.ascendancy || "";
		const matchesSearch = !query || searchBlob.includes(query);
		const matchesAsc = !filterAsc.length || filterAsc.includes(asc);
		card.style.display = matchesSearch && matchesAsc ? "" : "none";
	});

	if (state.panelEl) {
		state.panelEl.scrollTop = 0;
	}
}

async function fetchAscendancyPassives(): Promise<AscendancyPassive[]> {
	const payload = await (window as any).electronAPI?.getAscendancyPassives?.();
	if (!payload || payload.error) {
		throw new Error(payload?.error || "unknown error");
	}
	return (payload.passives || []) as AscendancyPassive[];
}

export async function show(): Promise<void> {
	(window as any).__lastPanel = "asc_passives";
	const panel = ensurePanel();
	panel.innerHTML = "<div class='no-mods'>Loading...</div>";
	try {
		state.passives = await fetchAscendancyPassives();
		state.classes = Array.from(new Set(state.passives.map(p => p.ascendancy).filter(Boolean) as string[])).sort();
		state.selectedAscendancies.clear();
		renderPanel(panel);
	} catch (err) {
		const message = err instanceof Error ? err.message : "unknown";
		panel.innerHTML = `<div class='no-mods' style='color:var(--accent-red);'>Failed to load Ascendancy Passives (${message})</div>`;
	}
}

export async function reload(): Promise<void> {
	if (!state.panelEl) {
		await show();
		return;
	}
	state.panelEl.innerHTML = "<div class='no-mods'>Reloading...</div>";
	try {
		state.passives = await fetchAscendancyPassives();
		state.classes = Array.from(new Set(state.passives.map(p => p.ascendancy).filter(Boolean) as string[])).sort();
		state.selectedAscendancies.clear();
		renderPanel(state.panelEl);
	} catch (err) {
		const message = err instanceof Error ? err.message : "unknown";
		state.panelEl.innerHTML = `<div class='no-mods' style='color:var(--accent-red);'>Failed to load Ascendancy Passives (${message})</div>`;
	}
}

export function hide(): void {
	if (state.panelEl) {
		state.panelEl.style.display = "none";
	}
}

