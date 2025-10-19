import { bindImageFallback } from "../../crafting/utils/imageFallback";
import { TRANSPARENT_PLACEHOLDER, createPlaceholderSvg } from "../../crafting/utils/imagePlaceholder";
import { sanitizeCraftingHtml } from "../../utils";
import { prepareCharacterPanel } from "../utils";

type AtlasNode = {
	name: string;
	description?: string;
	description_html?: string;
	image?: string;
	imageLocal?: string;
};

type AtlasState = {
	panelEl: HTMLElement | null;
	nodes: AtlasNode[];
	cardsWrap: HTMLElement | null;
	tagWrap: HTMLElement | null;
	searchInput: HTMLInputElement | null;
	selectedTags: Set<string>;
	tagCounts: Record<string, number>;
	filterTimer: number | null;
};

const CURATED_TAGS = [
	"quantity",
	"rarity",
	"explicit",
	"prefix",
	"suffix",
	"delirium",
	"breach",
	"expedition",
	"runic",
	"remnants",
	"spirit",
	"ritual",
	"azmeri",
	"essence",
	"strongbox",
	"shrine",
	"boss",
	"waystone",
	"rogue",
	"biome",
	"monster pack size",
	"rare",
	"magic"
] as const;

const PLACEHOLDER_ICON = createPlaceholderSvg(28, 28, "?");

const state: AtlasState = {
	panelEl: null,
	nodes: [],
	cardsWrap: null,
	tagWrap: null,
	searchInput: null,
	selectedTags: new Set<string>(),
	tagCounts: Object.fromEntries(CURATED_TAGS.map(tag => [tag, 0])),
	filterTimer: null
};

function ensurePanel(): HTMLElement {
	const panel = prepareCharacterPanel("Atlas Nodes");
	state.panelEl = panel;
	return panel;
}

function deriveTags(node: AtlasNode): string[] {
	const text = `${node.name || ""} ${String(node.description || "")}`.toLowerCase();
	const tags = new Set<string>();
	if (/\bquantity\b|item\s+quantity/i.test(text)) tags.add("quantity");
	if (/\brarity\b|item\s+rarity/i.test(text)) tags.add("rarity");
	if (/\bexplicit\b/i.test(text)) tags.add("explicit");
	if (/\bprefix(?:es)?\b/i.test(text)) tags.add("prefix");
	if (/\bsuffix(?:es)?\b/i.test(text)) tags.add("suffix");
	if (/\bdelirium\b/i.test(text)) tags.add("delirium");
	if (/\bbreach\b/i.test(text)) tags.add("breach");
	if (/\bexpedition\b/i.test(text)) tags.add("expedition");
	if (/\brunic\b/i.test(text)) tags.add("runic");
	if (/\bremnants?\b/i.test(text)) tags.add("remnants");
	if (/\bspirit\b/i.test(text)) tags.add("spirit");
	if (/\britual\b/i.test(text)) tags.add("ritual");
	if (/\bazmeri\b/i.test(text)) tags.add("azmeri");
	if (/\bessence\b/i.test(text)) tags.add("essence");
	if (/\bstrongbox\b/i.test(text)) tags.add("strongbox");
	if (/\bshrine\b/i.test(text)) tags.add("shrine");
	if (/\bboss\b/i.test(text)) tags.add("boss");
	if (/\bwaystone\b/i.test(text)) tags.add("waystone");
	if (/\brogue\b/i.test(text)) tags.add("rogue");
	if (/\bbiome\b/i.test(text)) tags.add("biome");
	if (/monster\s+pack\s+size/i.test(text)) tags.add("monster pack size");
	if (/\brare\b/i.test(text)) tags.add("rare");
	if (/\bmagic\b/i.test(text)) tags.add("magic");
	return Array.from(tags);
}

function recomputeTagCounts(): void {
	const counts = Object.fromEntries(CURATED_TAGS.map(tag => [tag, 0]));
	state.nodes.forEach(node => {
		deriveTags(node).forEach(tag => {
			if (counts[tag] != null) counts[tag] += 1;
		});
	});
	state.tagCounts = counts;
}

function tagPalette(tag: string): [number, number, number] {
	const key = tag.toLowerCase();
	if (key === "quantity") return [67, 160, 71];
	if (key === "rarity") return [255, 213, 79];
	if (key === "explicit") return [92, 107, 192];
	if (key === "prefix") return [38, 166, 154];
	if (key === "suffix") return [244, 124, 96];
	if (key === "delirium") return [156, 39, 176];
	if (key === "breach") return [121, 85, 72];
	if (key === "expedition") return [66, 165, 245];
	if (key === "runic") return [0, 150, 136];
	if (key === "remnants") return [158, 158, 158];
	if (key === "spirit") return [171, 71, 188];
	if (key === "ritual") return [244, 143, 177];
	if (key === "azmeri") return [109, 76, 65];
	if (key === "essence") return [0, 188, 212];
	if (key === "strongbox") return [255, 168, 37];
	if (key === "shrine") return [126, 87, 194];
	if (key === "boss") return [239, 83, 80];
	if (key === "waystone") return [120, 144, 156];
	if (key === "rogue") return [124, 77, 255];
	if (key === "biome") return [141, 110, 99];
	if (key === "monster pack size") return [46, 125, 50];
	if (key === "rare") return [255, 167, 38];
	if (key === "magic") return [64, 136, 255];
	return [120, 144, 156];
}

function renderTagFilters(): void {
	const wrap = state.tagWrap;
	if (!wrap) return;
	wrap.innerHTML = "";
	CURATED_TAGS.forEach(tag => {
		const key = tag.toLowerCase();
		const count = state.tagCounts[tag] || 0;
		const active = state.selectedTags.has(key);
		const button = document.createElement("button");
		button.type = "button";
		button.className = "key-tag";
		button.dataset.tag = key;
		button.textContent = count ? `${tag} (${count})` : tag;
		const [r, g, b] = tagPalette(tag);
		const background = active ? `rgba(${r},${g},${b},0.9)` : `rgba(${r},${g},${b},0.22)`;
		const border = `1px solid rgba(${r},${g},${b},0.6)`;
		const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
		const color = active ? (luma > 180 ? "#000" : "#fff") : "var(--text-primary)";
		button.style.cssText = `padding:3px 8px; font-size:11px; cursor:pointer; border-radius:4px; border:${border}; background:${background}; color:${color};`;
		button.addEventListener("click", () => {
			if (active) state.selectedTags.delete(key);
			else state.selectedTags.add(key);
			renderTagFilters();
			applyFilter();
		});
		wrap.appendChild(button);
	});
	if (state.selectedTags.size) {
		const reset = document.createElement("button");
		reset.type = "button";
		reset.textContent = "Reset";
		reset.style.cssText = "padding:3px 8px; font-size:11px; border-radius:4px; cursor:pointer; background:var(--accent-red); color:#fff; border:1px solid var(--accent-red);";
		reset.addEventListener("click", () => {
			state.selectedTags.clear();
			renderTagFilters();
			applyFilter();
		});
		wrap.appendChild(reset);
	}
}

function matchesTags(node: AtlasNode, activeTags: string[]): boolean {
	if (!activeTags.length) return true;
	const tags = deriveTags(node).map(tag => tag.toLowerCase());
	return activeTags.every(tag => tags.includes(tag));
}

function createCard(node: AtlasNode): HTMLElement {
	const card = document.createElement("div");
	card.style.background = "var(--bg-card)";
	card.style.border = "1px solid var(--border-color)";
	card.style.borderRadius = "6px";
	card.style.padding = "8px";
	card.style.display = "flex";
	card.style.flexDirection = "column";
	card.style.gap = "6px";
	card.style.height = "100%";

	const header = document.createElement("div");
	header.style.display = "flex";
	header.style.alignItems = "center";
	header.style.gap = "6px";

	const img = document.createElement("img");
	img.className = "atlas-img";
	img.width = 28;
	img.height = 28;
	img.style.width = "28px";
	img.style.height = "28px";
	img.style.objectFit = "contain";
	img.src = TRANSPARENT_PLACEHOLDER;
	const imagePath = node.imageLocal || node.image || "";
	if (imagePath) {
		img.setAttribute("data-orig-src", imagePath);
	} else {
		img.src = PLACEHOLDER_ICON;
		img.style.opacity = "0.5";
		img.style.filter = "grayscale(1)";
	}
	header.appendChild(img);

	const title = document.createElement("div");
	title.style.fontWeight = "700";
	title.style.fontSize = "15px";
	title.textContent = node.name;
	header.appendChild(title);

	card.appendChild(header);

	const body = document.createElement("div");
	body.style.fontSize = "12px";
	body.style.lineHeight = "1.35";
	const rawHtml = node.description_html && node.description_html.trim()
		? node.description_html
		: sanitizeCraftingHtml(node.description || "");
	body.innerHTML = rawHtml;
	card.appendChild(body);

	const blob = `${node.name} ${(node.description || "").toLowerCase()}`;
	card.dataset.search = blob.toLowerCase();

	return card;
}

function renderCards(filtered: AtlasNode[]): void {
	const wrap = state.cardsWrap;
	if (!wrap) return;
	wrap.innerHTML = "";
	const fragment = document.createDocumentFragment();
	filtered.forEach(node => {
		fragment.appendChild(createCard(node));
	});
	wrap.appendChild(fragment);
	bindImageFallback(wrap, ".atlas-img", PLACEHOLDER_ICON, 0.5);
}

function buildPanel(): void {
	const panel = state.panelEl;
	if (!panel) return;
	panel.innerHTML = "";

	const wrapper = document.createElement("div");
	wrapper.className = "page-inner atlas-nodes-view";

	const controls = document.createElement("div");
	controls.style.display = "flex";
	controls.style.gap = "6px";
	controls.style.alignItems = "center";
	controls.style.marginBottom = "8px";

	const searchInput = document.createElement("input");
	searchInput.id = "atlasSearch";
	searchInput.type = "text";
	searchInput.placeholder = "Search atlas nodes...";
	searchInput.style.flex = "1";
	searchInput.style.padding = "4px 8px";
	searchInput.style.background = "var(--bg-tertiary)";
	searchInput.style.border = "1px solid var(--border-color)";
	searchInput.style.borderRadius = "4px";
	searchInput.style.color = "var(--text-primary)";
	searchInput.style.fontSize = "12px";

	const clearBtn = document.createElement("button");
	clearBtn.id = "atlasClear";
	clearBtn.type = "button";
	clearBtn.textContent = "Clear";
	clearBtn.className = "pin-btn";
	clearBtn.style.padding = "4px 8px";

	controls.append(searchInput, clearBtn);

	const tagShell = document.createElement("div");
	tagShell.style.background = "var(--bg-secondary)";
	tagShell.style.padding = "8px";
	tagShell.style.borderRadius = "6px";
	tagShell.style.marginBottom = "8px";

	const tagWrap = document.createElement("div");
	tagWrap.id = "atlasTagFilters";
	tagWrap.style.display = "flex";
	tagWrap.style.flexWrap = "wrap";
	tagWrap.style.gap = "6px";
	tagWrap.style.justifyContent = "center";
	tagWrap.style.width = "100%";
	tagShell.appendChild(tagWrap);

	const cardsWrap = document.createElement("div");
	cardsWrap.id = "atlasWrap";
	cardsWrap.style.display = "grid";
	cardsWrap.style.gridTemplateColumns = "repeat(auto-fit, minmax(320px, 1fr))";
	cardsWrap.style.gap = "10px";

	wrapper.append(controls, tagShell, cardsWrap);
	panel.appendChild(wrapper);

	state.searchInput = searchInput;
	state.tagWrap = tagWrap;
	state.cardsWrap = cardsWrap;

	searchInput.addEventListener("input", () => scheduleFilter());
	clearBtn.addEventListener("click", () => {
		if (state.searchInput) {
			state.searchInput.value = "";
		}
		state.selectedTags.clear();
		renderTagFilters();
		applyFilter();
		state.searchInput?.focus();
	});

	cardsWrap.addEventListener("click", event => {
		const target = event.target as HTMLElement | null;
		const link = target?.closest?.("a");
		if (link) {
			event.preventDefault();
			event.stopPropagation();
		}
	});

	renderTagFilters();
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
	const tags = Array.from(state.selectedTags);
	const filtered = state.nodes.filter(node => {
		const searchBlob = `${node.name} ${(node.description || "").toLowerCase()}`.toLowerCase();
		const matchesSearch = !query || searchBlob.includes(query);
		return matchesSearch && matchesTags(node, tags);
	});
	renderCards(filtered);
	if (state.panelEl) {
		state.panelEl.scrollTop = 0;
	}
}

async function fetchAtlasNodes(): Promise<AtlasNode[]> {
	const payload = await (window as any).electronAPI?.getAtlasNodes?.();
	if (!payload || payload.error) {
		throw new Error(payload?.error || "unknown error");
	}
	return (payload.nodes || []) as AtlasNode[];
}

export async function show(): Promise<void> {
	(window as any).__lastPanel = "atlas_nodes";
	const panel = ensurePanel();
	panel.innerHTML = "<div class='no-mods'>Loading...</div>";
	try {
		state.nodes = await fetchAtlasNodes();
		state.selectedTags.clear();
		recomputeTagCounts();
		buildPanel();
	} catch (err) {
		const message = err instanceof Error ? err.message : "unknown";
		panel.innerHTML = `<div class='no-mods' style='color:var(--accent-red);'>Failed to load Atlas Nodes (${message})</div>`;
	}
}

export async function reload(): Promise<void> {
	if (!state.panelEl) {
		await show();
		return;
	}
	state.panelEl.innerHTML = "<div class='no-mods'>Reloading...</div>";
	try {
		state.nodes = await fetchAtlasNodes();
		state.selectedTags.clear();
		recomputeTagCounts();
		buildPanel();
	} catch (err) {
		const message = err instanceof Error ? err.message : "unknown";
		state.panelEl.innerHTML = `<div class='no-mods' style='color:var(--accent-red);'>Failed to load Atlas Nodes (${message})</div>`;
	}
}

export function hide(): void {
	if (state.panelEl) {
		state.panelEl.style.display = "none";
	}
}

