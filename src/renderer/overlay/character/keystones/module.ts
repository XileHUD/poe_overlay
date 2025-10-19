import { bindImageFallback } from "../../crafting/utils/imageFallback";
import { TRANSPARENT_PLACEHOLDER, createPlaceholderSvg } from "../../crafting/utils/imagePlaceholder";
import { applyFilterChipChrome, sanitizeCraftingHtml, type ChipChrome } from "../../utils";
import { prepareCharacterPanel } from "../utils";

type KeystoneEntry = {
	name: string;
	description?: string;
	image?: string;
	imageLocal?: string;
	ascendancy?: string;
	character?: string;
	stack_current?: number;
	stack_max?: number;
};

type KeystoneState = {
	panelEl: HTMLElement | null;
	data: KeystoneEntry[];
	cards: HTMLElement[];
	cardsWrap: HTMLElement | null;
	tagWrap: HTMLElement | null;
	countEl: HTMLSpanElement | null;
	searchInput: HTMLInputElement | null;
	selectedTags: Set<string>;
	tagCounts: Record<string, number>;
	filterTimer: number | null;
};

const TAGS = [
	"Damage",
	"Ailments",
	"Attributes",
	"Energy Shield",
	"Defences",
	"Life",
	"Mana",
	"Fire",
	"Cold",
	"Lightning",
	"Chaos",
	"Resistances",
	"Projectile",
	"Area",
	"Critical",
	"Spell",
	"Attack",
	"Minion",
	"Mechanics"
];

const PLACEHOLDER_ICON = createPlaceholderSvg(30, 30);

const state: KeystoneState = {
	panelEl: null,
	data: [],
	cards: [],
	cardsWrap: null,
	tagWrap: null,
	countEl: null,
	searchInput: null,
	selectedTags: new Set<string>(),
	tagCounts: Object.fromEntries(TAGS.map(tag => [tag, 0])),
	filterTimer: null
};

function ensurePanel(): HTMLElement {
	const panel = prepareCharacterPanel("Keystones");
	state.panelEl = panel;
	return panel;
}

function resolveImage(entry: KeystoneEntry): string {
	if (entry.imageLocal) return entry.imageLocal;
	if (entry.image) return entry.image;
	return "";
}

function deriveTags(entry: KeystoneEntry): string[] {
	const text = `${entry.name || ""} ${String(entry.description || "")}`;
	const tags = new Set<string>();
	if (/Damage/i.test(text)) tags.add("Damage");
	if (/Ailment|Bleed|Ignite|Chill|Freeze|Shock|Poison|Stun|Electrocute/i.test(text)) tags.add("Ailments");
	if (/Attribute|Strength|Dexterity|Intelligence/i.test(text)) tags.add("Attributes");
	if (/Energy Shield|\bES\b/i.test(text)) tags.add("Energy Shield");
	if (/Armour|Armor|Evasion/i.test(text)) tags.add("Defences");
	if (/\bLife\b/i.test(text)) tags.add("Life");
	if (/\bMana\b/i.test(text)) tags.add("Mana");
	if (/\bFire\b/i.test(text)) tags.add("Fire");
	if (/\bCold\b/i.test(text)) tags.add("Cold");
	if (/Lightning|Electrocute/i.test(text)) tags.add("Lightning");
	if (/\bChaos\b/i.test(text)) tags.add("Chaos");
	if (/Resist/i.test(text)) tags.add("Resistances");
	if (/Projectile/i.test(text)) tags.add("Projectile");
	if (/\bArea\b/i.test(text)) tags.add("Area");
	if (/Critical/i.test(text)) tags.add("Critical");
	if (/Cast|Spell/i.test(text)) tags.add("Spell");
	if (/\bAttack\b/i.test(text)) tags.add("Attack");
	if (/Minion/i.test(text)) tags.add("Minion");
	if (/Trap|Totem|Trigger/i.test(text)) tags.add("Mechanics");
	return Array.from(tags);
}

function recomputeTagCounts(): void {
	const counts = Object.fromEntries(TAGS.map(tag => [tag, 0]));
	state.data.forEach(entry => {
		deriveTags(entry).forEach(tag => {
			if (counts[tag] != null) counts[tag] += 1;
		});
	});
	state.tagCounts = counts;
}

function chipChrome(tag: string, active: boolean): ChipChrome {
	const key = tag.toLowerCase();
	const palette: Record<string, [number, number, number]> = {
		damage: [96, 125, 139],
		ailments: [156, 39, 176],
		attributes: [38, 166, 154],
		"energy shield": [38, 198, 218],
		defences: [109, 76, 65],
		armour: [109, 76, 65],
		armor: [109, 76, 65],
		life: [220, 68, 61],
		mana: [66, 165, 245],
		fire: [220, 68, 61],
		cold: [66, 165, 245],
		lightning: [255, 213, 79],
		chaos: [156, 39, 176],
		resistances: [255, 112, 67],
		projectile: [255, 179, 0],
		area: [171, 71, 188],
		critical: [255, 179, 0],
		spell: [92, 107, 192],
		attack: [121, 85, 72],
		minion: [156, 39, 176],
		mechanics: [96, 125, 139]
	};
	const [r, g, b] = palette[key] ?? [120, 144, 156];
	const background = active ? `rgba(${r},${g},${b},0.9)` : `rgba(${r},${g},${b},0.22)`;
	const border = `1px solid rgba(${r},${g},${b},0.6)`;
	const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	const color = active ? (luma > 180 ? "#000" : "#fff") : "var(--text-primary)";
	return { border, background, color };
}

function renderTagFilters(): void {
	if (!state.tagWrap) return;
	state.tagWrap.innerHTML = "";
	TAGS.forEach(tag => {
		const key = tag.toLowerCase();
		const btn = document.createElement("button");
		btn.type = "button";
		const count = state.tagCounts[tag] ?? 0;
		btn.textContent = count ? `${tag} (${count})` : tag;
		const active = state.selectedTags.has(key);
		applyFilterChipChrome(btn, chipChrome(tag, active), {
			padding: "3px 10px",
			textTransform: "none",
			fontWeight: active ? "600" : "500"
		});
		btn.style.fontSize = "11px";
		btn.addEventListener("click", () => {
			if (state.selectedTags.has(key)) {
				state.selectedTags.delete(key);
			} else {
				state.selectedTags.add(key);
			}
			renderTagFilters();
			applyFilter();
		});
		state.tagWrap?.appendChild(btn);
	});
	if (state.selectedTags.size) {
		const reset = document.createElement("button");
		reset.type = "button";
		reset.textContent = "Reset";
		applyFilterChipChrome(reset, { border: "1px solid var(--accent-red)", background: "var(--accent-red)", color: "#fff" }, {
			padding: "3px 10px",
			textTransform: "none",
			fontWeight: "600"
		});
		reset.style.fontSize = "11px";
		reset.addEventListener("click", () => {
			state.selectedTags.clear();
			renderTagFilters();
			applyFilter();
		});
		state.tagWrap.appendChild(reset);
	}
}

function createCard(entry: KeystoneEntry): HTMLElement {
	const card = document.createElement("div");
	card.className = "keystone-card";
	card.style.background = "var(--bg-card)";
	card.style.border = "1px solid var(--border-color)";
	card.style.borderRadius = "6px";
	card.style.padding = "6px";
	card.style.display = "flex";
	card.style.flexDirection = "column";
	card.style.gap = "4px";
	card.style.height = "100%";

	const tags = deriveTags(entry).map(tag => tag.toLowerCase());
	const sanitizedDesc = sanitizeCraftingHtml(entry.description || "");
	const searchBlob = `${entry.name || ""} ${sanitizedDesc.replace(/<[^>]+>/g, " ")}`.toLowerCase();
	card.dataset.search = searchBlob;
	card.dataset.tags = tags.join("|");

	const header = document.createElement("div");
	header.style.display = "flex";
	header.style.gap = "6px";
	header.style.alignItems = "center";

	const img = document.createElement("img");
	img.className = "keystone-img";
	img.width = 30;
	img.height = 30;
	img.style.width = "30px";
	img.style.height = "30px";
	img.style.objectFit = "contain";
	img.src = TRANSPARENT_PLACEHOLDER;
	const imagePath = resolveImage(entry);
	if (imagePath) {
		img.setAttribute("data-orig-src", imagePath);
	} else {
		img.src = PLACEHOLDER_ICON;
		img.style.opacity = "0.55";
		img.style.filter = "grayscale(1)";
	}
	header.appendChild(img);

	const title = document.createElement("div");
	title.style.fontWeight = "600";
	title.textContent = entry.name;
	header.appendChild(title);

	card.appendChild(header);

	const desc = document.createElement("div");
	desc.style.fontSize = "11px";
	desc.innerHTML = sanitizedDesc;
	card.appendChild(desc);

	return card;
}

function renderCards(): void {
	if (!state.cardsWrap) return;
	state.cardsWrap.innerHTML = "";
	const cards: HTMLElement[] = [];
	state.data.forEach(entry => {
		const card = createCard(entry);
		state.cardsWrap?.appendChild(card);
		cards.push(card);
	});
	state.cards = cards;
	bindImageFallback(state.cardsWrap, ".keystone-img[data-orig-src]", PLACEHOLDER_ICON, 0.55);
}

function renderPanel(panel: HTMLElement): void {
	panel.innerHTML = "";
	const wrapper = document.createElement("div");
	wrapper.className = "page-inner keystones-view";
	wrapper.style.display = "flex";
	wrapper.style.flexDirection = "column";
	wrapper.style.gap = "10px";

	const topRow = document.createElement("div");
	topRow.style.display = "flex";
	topRow.style.flexWrap = "wrap";
	topRow.style.gap = "6px";
	topRow.style.alignItems = "center";

	const countEl = document.createElement("span");
	countEl.id = "keystoneCount";
	countEl.style.fontWeight = "600";
	countEl.textContent = `Keystones (${state.data.length})`;
	state.countEl = countEl;

	const searchInput = document.createElement("input");
	searchInput.id = "keystoneSearch";
	searchInput.type = "text";
	searchInput.placeholder = "Search keystones...";
	searchInput.style.flex = "1 1 240px";
	searchInput.style.minWidth = "200px";
	searchInput.style.padding = "4px 8px";
	searchInput.style.background = "var(--bg-tertiary)";
	searchInput.style.color = "var(--text-primary)";
	searchInput.style.border = "1px solid var(--border-color)";
	searchInput.style.borderRadius = "4px";
	searchInput.style.fontSize = "12px";

	const clearBtn = document.createElement("button");
	clearBtn.id = "keystoneClear";
	clearBtn.type = "button";
	clearBtn.textContent = "Clear";
	applyFilterChipChrome(clearBtn, { border: "1px solid var(--border-color)", background: "var(--bg-tertiary)", color: "var(--text-primary)" }, {
		padding: "3px 10px",
		textTransform: "none",
		fontWeight: "500"
	});

	topRow.append(countEl, searchInput, clearBtn);

	const tagShell = document.createElement("div");
	tagShell.style.background = "var(--bg-secondary)";
	tagShell.style.padding = "8px";
	tagShell.style.borderRadius = "6px";

	const tagWrap = document.createElement("div");
	tagWrap.id = "keystoneTagFilters";
	tagWrap.style.display = "flex";
	tagWrap.style.flexWrap = "wrap";
	tagWrap.style.gap = "6px";
	tagWrap.style.justifyContent = "center";
	tagWrap.style.width = "100%";
	tagShell.appendChild(tagWrap);
	state.tagWrap = tagWrap;

	const cardsWrap = document.createElement("div");
	cardsWrap.id = "keystoneCards";
	cardsWrap.style.display = "grid";
	cardsWrap.style.gridTemplateColumns = "repeat(auto-fit, minmax(260px, 1fr))";
	cardsWrap.style.gap = "10px";
	cardsWrap.style.alignItems = "stretch";
	state.cardsWrap = cardsWrap;

	wrapper.append(topRow, tagShell, cardsWrap);
	panel.appendChild(wrapper);

	state.searchInput = searchInput;
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

	renderCards();
	renderTagFilters();
}

export function applyFilter(): void {
	const query = (state.searchInput?.value || "").trim().toLowerCase();
	const tags = Array.from(state.selectedTags);
	let shown = 0;

	state.cards.forEach(card => {
		const blob = card.dataset.search || "";
		const cardTags = (card.dataset.tags || "").split("|").filter(Boolean);
		const matchesQuery = !query || blob.includes(query);
		const matchesTags = !tags.length || tags.every(tag => cardTags.includes(tag));
		const visible = matchesQuery && matchesTags;
		card.style.display = visible ? "" : "none";
		if (visible) shown += 1;
	});

	if (state.countEl) {
		const total = state.data.length;
		const label = !query && !tags.length ? `Keystones (${total})` : `Keystones (${shown} / ${total})`;
		state.countEl.textContent = label;
	}

	if (state.panelEl) {
		state.panelEl.scrollTop = 0;
	}
}

export function scheduleFilter(): void {
	if (state.filterTimer) {
		window.clearTimeout(state.filterTimer);
	}
	state.filterTimer = window.setTimeout(() => {
		applyFilter();
	}, 120);
}

async function fetchKeystones(): Promise<KeystoneEntry[]> {
	const payload = await (window as any).electronAPI?.getKeystones?.();
	if (!payload || payload.error) {
		throw new Error(payload?.error || "unknown error");
	}
	return (payload.keystones || []) as KeystoneEntry[];
}

export async function show(): Promise<void> {
	(window as any).__lastPanel = "keystones";
	const panel = ensurePanel();
	panel.innerHTML = "<div class='no-mods'>Loading...</div>";
	try {
		state.data = await fetchKeystones();
		state.selectedTags.clear();
		recomputeTagCounts();
		renderPanel(panel);
		applyFilter();
	} catch (err) {
		const message = err instanceof Error ? err.message : "unknown";
		panel.innerHTML = `<div class='no-mods' style='color:var(--accent-red);'>Failed to load Keystones (${message})</div>`;
	}
}

export async function reload(): Promise<void> {
	if (!state.panelEl) {
		await show();
		return;
	}
	state.panelEl.innerHTML = "<div class='no-mods'>Reloading...</div>";
	try {
		state.data = await fetchKeystones();
		state.selectedTags.clear();
		recomputeTagCounts();
		renderPanel(state.panelEl);
		applyFilter();
	} catch (err) {
		const message = err instanceof Error ? err.message : "unknown";
		state.panelEl.innerHTML = `<div class='no-mods' style='color:var(--accent-red);'>Failed to load Keystones (${message})</div>`;
	}
}

export function hide(): void {
	if (state.panelEl) {
		state.panelEl.style.display = "none";
	}
}

