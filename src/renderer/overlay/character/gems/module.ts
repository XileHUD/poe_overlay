import { bindImageFallback } from "../../crafting/utils/imageFallback";
import { TRANSPARENT_PLACEHOLDER, createPlaceholderSvg } from "../../crafting/utils/imagePlaceholder";
import { applyFilterChipChrome, sanitizeCraftingHtml, type ChipChrome } from "../../utils";
import { buildPoe2ChipChrome } from "../../shared/filterChips";
import { prepareCharacterPanel } from "../utils";

type GemEntry = {
	name: string;
	type?: string;
	description?: string;
	tags?: string[];
	image?: string;
	imageLocal?: string;
};

type GemGroups = Record<string, GemEntry[]>;

type GemState = {
	panelEl: HTMLElement | null;
	groups: GemGroups;
	searchInput: HTMLInputElement | null;
	tagWrap: HTMLElement | null;
	sectionsEl: HTMLElement | null;
	imageDiagEl: HTMLElement | null;
	imgLogBtn: HTMLButtonElement | null;
	selectedTags: Set<string>;
	sortedTags: string[];
	tagCounts: Record<string, number>;
	filterTimer: number | null;
	tagsExpanded: boolean;
};

const ORDER = [
	{ key: "skill", label: "Skill Gems" },
	{ key: "support", label: "Support Gems" },
	{ key: "spirit", label: "Spirit Gems" },
	{ key: "lineage", label: "Lineage Supports" }
] as const;

const PLACEHOLDER_ICON = createPlaceholderSvg(28, 28, "?");

const state: GemState = {
	panelEl: null,
	groups: {},
	searchInput: null,
	tagWrap: null,
	sectionsEl: null,
	imageDiagEl: null,
	imgLogBtn: null,
	selectedTags: new Set<string>(),
	sortedTags: [],
	tagCounts: {},
	filterTimer: null,
	tagsExpanded: false
};

function ensurePanel(): HTMLElement {
	const panel = prepareCharacterPanel("Gems");
	state.panelEl = panel;
	return panel;
}

function computeTagMetadata(groups: GemGroups): void {
	const tagCounts: Record<string, number> = {};
	const acc = new Set<string>();
	ORDER.forEach(({ key }) => {
		(groups[key] || []).forEach(entry => {
			(entry.tags || []).forEach(tag => {
				if (!tag) return;
				acc.add(tag);
				tagCounts[tag] = (tagCounts[tag] || 0) + 1;
			});
		});
	});
	state.sortedTags = Array.from(acc).sort((a, b) => a.localeCompare(b));
	state.tagCounts = tagCounts;
}

function chipChrome(tag: string, active: boolean): ChipChrome {
	const key = tag.toLowerCase();
	const palette: Record<string, [number, number, number]> = {
		fire: [220, 68, 61],
		life: [220, 68, 61],
		cold: [66, 165, 245],
		mana: [66, 165, 245],
		lightning: [255, 213, 79],
		chaos: [156, 39, 176],
		minion: [156, 39, 176],
		"energy shield": [38, 198, 218],
		es: [38, 198, 218],
		armour: [109, 76, 65],
		armor: [109, 76, 65],
		defences: [109, 76, 65],
		evasion: [46, 125, 50],
		resistances: [255, 112, 67],
		resist: [255, 112, 67],
		projectile: [255, 179, 0],
		area: [171, 71, 188],
		critical: [255, 179, 0],
		crit: [255, 179, 0],
		spell: [92, 107, 192],
		attack: [121, 85, 72],
		damage: [96, 125, 139],
		ailments: [96, 125, 139],
		mechanics: [96, 125, 139],
		movement: [67, 160, 71],
		speed: [67, 160, 71],
		elemental: [255, 152, 0]
	};
	return buildPoe2ChipChrome(palette[key] ?? [120, 144, 156], active);
}

function renderTagFilters(): void {
	if (!state.tagWrap) return;
	state.tagWrap.innerHTML = "";
	
	const MAX_TAGS_COLLAPSED = 21;
	const tagsToShow = (state.tagsExpanded || state.sortedTags.length <= MAX_TAGS_COLLAPSED) ? state.sortedTags : state.sortedTags.slice(0, MAX_TAGS_COLLAPSED);
	const needsShowMore = state.sortedTags.length > MAX_TAGS_COLLAPSED;
	
	tagsToShow.forEach(tag => {
		const btn = document.createElement("div");
		const active = state.selectedTags.has(tag);
		const count = state.tagCounts[tag] || 0;
		btn.textContent = count ? `${tag} (${count})` : tag;
		applyFilterChipChrome(btn, chipChrome(tag, active), {
			padding: "3px 10px",
			fontWeight: active ? "600" : "500"
		});
		btn.style.margin = "0 4px 4px 0";
		btn.addEventListener("click", () => {
			if (state.selectedTags.has(tag)) {
				state.selectedTags.delete(tag);
			} else {
				state.selectedTags.add(tag);
			}
			renderTagFilters();
			applyFilter();
		});
		state.tagWrap?.appendChild(btn);
	});
	
	if (needsShowMore) {
		const showMoreBtn = document.createElement("div");
		showMoreBtn.textContent = state.tagsExpanded ? "Show Less" : "Show More";
		applyFilterChipChrome(showMoreBtn, { border: "1px solid var(--border-color)", background: "var(--bg-tertiary)", color: "var(--text-primary)" }, {
			padding: "3px 10px",
			fontWeight: "500"
		});
		showMoreBtn.style.margin = "0 4px 4px 0";
		showMoreBtn.addEventListener("click", () => {
			state.tagsExpanded = !state.tagsExpanded;
			renderTagFilters();
		});
		state.tagWrap.appendChild(showMoreBtn);
	}
	
	if (state.selectedTags.size) {
		const reset = document.createElement("div");
		reset.textContent = "Reset";
		applyFilterChipChrome(reset, { border: "1px solid var(--accent-red)", background: "var(--accent-red)", color: "#fff" }, {
			padding: "3px 10px",
			fontWeight: "600"
		});
		reset.style.margin = "0 4px 4px 0";
		reset.addEventListener("click", () => {
			state.selectedTags.clear();
			renderTagFilters();
			applyFilter();
		});
		state.tagWrap.appendChild(reset);
	}
}

function gemMatches(entry: GemEntry, query: string, tags: string[]): boolean {
	const q = query.toLowerCase();
	const desc = (entry.description || "").toLowerCase();
	const matchesQuery = !q || entry.name.toLowerCase().includes(q) || (entry.type || "").toLowerCase().includes(q) || desc.includes(q);
	if (!matchesQuery) return false;
	if (!tags.length) return true;
	const gemTags = entry.tags || [];
	return tags.every(tag => gemTags.includes(tag) || desc.includes(tag.toLowerCase()));
}

function renderSections(): void {
	const container = state.sectionsEl;
	if (!container) return;
	container.innerHTML = "";
	const query = (state.searchInput?.value || "").trim().toLowerCase();
	const tags = Array.from(state.selectedTags);

	ORDER.forEach(({ key, label }) => {
		const source = state.groups[key] || [];
		const list = source.filter(entry => gemMatches(entry, query, tags));
		if (!list.length) return;

		const section = document.createElement("div");

		const heading = document.createElement("div");
		heading.style.fontWeight = "600";
		heading.style.fontSize = "14px";
		heading.style.marginBottom = "4px";
		heading.textContent = `${label} (${list.length})`;
		section.appendChild(heading);

		const wrap = document.createElement("div");
		wrap.style.display = "grid";
		wrap.style.gridTemplateColumns = "repeat(auto-fit, minmax(230px, 1fr))";
		wrap.style.gap = "10px";

		list.forEach(entry => {
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
			header.style.alignItems = "center";
			header.style.gap = "6px";

			const img = document.createElement("img");
			img.className = "gem-img";
			img.width = 28;
			img.height = 28;
			img.style.width = "28px";
			img.style.height = "28px";
			img.style.objectFit = "contain";
			img.src = TRANSPARENT_PLACEHOLDER;
			const path = entry.imageLocal || entry.image || "";
			if (path) {
				img.setAttribute("data-orig-src", path);
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

			const type = document.createElement("div");
			type.style.fontSize = "10px";
			type.style.color = "var(--text-muted)";
			type.textContent = entry.type || "";
			card.appendChild(type);

			const desc = document.createElement("div");
			desc.style.fontSize = "11px";
			desc.style.maxHeight = "120px";
			desc.style.overflow = "auto";
			desc.innerHTML = sanitizeCraftingHtml(entry.description || "");
			card.appendChild(desc);

			const tagsRow = document.createElement("div");
			tagsRow.style.fontSize = "10px";
			tagsRow.style.display = "flex";
			tagsRow.style.flexWrap = "wrap";
			tagsRow.style.gap = "4px";
			const gemTags = entry.tags || [];
			if (gemTags.length) {
				gemTags.forEach(tag => {
					const chip = document.createElement("span");
					chip.style.background = "var(--bg-tertiary)";
					chip.style.padding = "2px 4px";
					chip.style.borderRadius = "3px";
					chip.style.lineHeight = "1";
					chip.textContent = tag;
					tagsRow.appendChild(chip);
				});
			} else {
				const none = document.createElement("span");
				none.style.opacity = "0.5";
				none.textContent = "No tags";
				tagsRow.appendChild(none);
			}
			card.appendChild(tagsRow);

			wrap.appendChild(card);
		});

			section.appendChild(wrap);
			container.appendChild(section);
	});

		if (container.childElementCount) {
			bindGemImages(container);
	}
}

function scheduleFilter(): void {
	if (state.filterTimer) {
		window.clearTimeout(state.filterTimer);
	}
	state.filterTimer = window.setTimeout(() => {
		applyFilter();
	}, 130);
}

export function applyFilter(): void {
	renderSections();
	if (state.panelEl) {
		state.panelEl.scrollTop = 0;
	}
}

function retryForbiddenImages(urls: string[]): void {
	if (!urls.length || !state.panelEl) return;
	const images = Array.from(state.panelEl.querySelectorAll<HTMLImageElement>("img.gem-img"));
	images.forEach(img => {
		const orig = img.getAttribute("data-orig-src") || "";
		if (!orig || !urls.includes(orig) || img.dataset.retry403) return;
		img.dataset.retry403 = "1";
		const bust = orig + (orig.includes("?") ? "&" : "?") + "reh=" + Date.now();
		setTimeout(() => {
			img.src = bust;
		}, 100);
	});
}

async function showImageLog(): Promise<void> {
	if (!state.imageDiagEl) return;
	try {
		const log = await (window as any).electronAPI?.getImageLog?.();
		state.imageDiagEl.style.display = "flex";
		if (!log || !log.length) {
			state.imageDiagEl.innerHTML = "<div style='font-size:11px; color:var(--text-muted);'>No image log entries.</div>";
			return;
		}
		state.imageDiagEl.innerHTML =
			`<div style='font-size:11px; font-weight:600;'>Recent Image Requests (${log.length})</div>` +
			`<div style='max-height:160px; overflow:auto; font-size:10px; line-height:1.25; background:var(--bg-tertiary); padding:4px; border:1px solid var(--border-color); border-radius:4px;'>` +
			log.slice().reverse().map((entry: any) => {
				const statusColor = entry.status >= 200 && entry.status < 300 ? "#6fbf73" : "var(--accent-red)";
				const status = entry.status ? `<span style='color:${statusColor};'>${entry.status}</span>` : "<span style='color:var(--accent-red);'>ERR</span>";
				const errorLine = entry.error ? `<div style='color:var(--accent-red);'>${entry.error}</div>` : "";
				return `<div style='margin-bottom:4px;'>${status} <span style='opacity:.7;'>${entry.method}</span> <span>${entry.url}</span>${errorLine}</div>`;
			}).join("") +
			`</div>`;
		const forbidden = (log || []).filter((entry: any) => entry.status === 403).map((entry: any) => entry.url).filter(Boolean);
		retryForbiddenImages(forbidden);
	} catch (err) {
		state.imageDiagEl.style.display = "flex";
		state.imageDiagEl.innerHTML = `<div style='color:var(--accent-red); font-size:11px;'>Failed to fetch image log</div>`;
	}
}

function setupDebugHotkey(btn: HTMLButtonElement): void {
	btn.style.display = "none";
	if ((window as any).__gemImgDebugHotkey) return;
	(window as any).__gemImgDebugHotkey = true;
	window.addEventListener("keydown", event => {
		if (event.ctrlKey && event.shiftKey && event.code === "KeyI") {
			btn.style.display = btn.style.display === "none" ? "" : "none";
		}
	});
}

function bindGemImages(root: ParentNode): void {
	const placeholder = PLACEHOLDER_ICON;
	root.querySelectorAll<HTMLImageElement>("img.gem-img[data-orig-src]").forEach(img => {
		if ((img as any)._gemBound) return;
		(img as any)._gemBound = true;
		const orig = img.getAttribute("data-orig-src") || "";
		img.style.opacity = "0";
		img.style.transition = "opacity 0.15s ease";

		const onLoad = () => {
			if (img.src === placeholder) {
				img.style.opacity = "0.55";
				img.style.filter = "grayscale(1)";
			} else {
				img.style.opacity = "1";
				img.style.filter = "none";
			}
		};
		const onError = () => {
			if (!img.dataset.retry) {
				img.dataset.retry = "1";
				const bust = orig + (orig.includes("?") ? "&" : "?") + "r=" + Date.now();
				setTimeout(() => {
					img.src = bust;
				}, 50);
				return;
			}
			img.src = placeholder;
			img.style.opacity = "0.55";
			img.style.filter = "grayscale(1)";
			try {
				(window as any).__imageErrorEvents = (window as any).__imageErrorEvents || [];
				(window as any).__imageErrorEvents.push({ ts: Date.now(), phase: "failed", src: orig });
			} catch {}
			img.removeEventListener("error", onError);
		};

		img.addEventListener("load", onLoad);
		img.addEventListener("error", onError);

		const setSrc = async (): Promise<void> => {
			if (!orig) {
				img.src = placeholder;
				img.style.opacity = "0.55";
				img.style.filter = "grayscale(1)";
				return;
			}
			try {
				if (!/^https?:/i.test(orig) && !/^file:/i.test(orig) && !/^data:/i.test(orig)) {
					const local = await (window as any).electronAPI?.getBundledImagePath?.(orig);
					if (local) {
						img.src = local;
						return;
					}
				}
			} catch {}
			img.src = orig;
		};

		void setSrc();
	});

	bindImageFallback(root, "img.gem-img", PLACEHOLDER_ICON, 0.55);
}

function renderPanel(panel: HTMLElement): void {
	panel.innerHTML = "";
	const wrapper = document.createElement("div");
	wrapper.className = "page-inner gems-view";
	wrapper.style.display = "flex";
	wrapper.style.flexDirection = "column";
	wrapper.style.gap = "10px";

	const topBar = document.createElement("div");
	topBar.style.display = "flex";
	topBar.style.alignItems = "center";
	topBar.style.gap = "6px";

	const searchInput = document.createElement("input");
	searchInput.id = "gemSearch";
	searchInput.type = "text";
	searchInput.placeholder = "Search gems...";
	searchInput.style.flex = "1";
	searchInput.style.padding = "4px 8px";
	searchInput.style.background = "var(--bg-tertiary)";
	searchInput.style.color = "var(--text-primary)";
	searchInput.style.border = "1px solid var(--border-color)";
	searchInput.style.borderRadius = "4px";
	searchInput.style.fontSize = "12px";

	const clearBtn = document.createElement("button");
	clearBtn.id = "gemClear";
	clearBtn.type = "button";
	clearBtn.textContent = "Clear";
	applyFilterChipChrome(clearBtn, { border: "1px solid var(--border-color)", background: "var(--bg-tertiary)", color: "var(--text-primary)" }, {
		padding: "4px 8px",
		textTransform: "none",
		fontWeight: "500"
	});

	topBar.append(searchInput, clearBtn);

	const tagRow = document.createElement("div");
	tagRow.style.display = "flex";
	tagRow.style.justifyContent = "space-between";
	tagRow.style.alignItems = "center";
	tagRow.style.gap = "8px";

	const tagShell = document.createElement("div");
	tagShell.style.background = "var(--bg-secondary)";
	tagShell.style.padding = "8px";
	tagShell.style.borderRadius = "6px";
	tagShell.style.flex = "1";

	const tagWrap = document.createElement("div");
	tagWrap.id = "gemTagFilters";
	tagWrap.style.display = "flex";
	tagWrap.style.flexWrap = "wrap";
	tagWrap.style.gap = "4px";
	tagWrap.style.justifyContent = "center";
	tagShell.appendChild(tagWrap);

	const imgLogBtn = document.createElement("button");
	imgLogBtn.id = "gemImgLogBtn";
	imgLogBtn.type = "button";
	imgLogBtn.title = "Show recent image request log";
	imgLogBtn.textContent = "Img Log";
	imgLogBtn.style.padding = "2px 6px";
	imgLogBtn.style.fontSize = "11px";
	imgLogBtn.style.background = "var(--bg-tertiary)";
	imgLogBtn.style.border = "1px solid var(--border-color)";
	imgLogBtn.style.borderRadius = "4px";
	imgLogBtn.style.cursor = "pointer";

	tagRow.append(tagShell, imgLogBtn);

	const imgDiag = document.createElement("div");
	imgDiag.id = "gemImgDiag";
	imgDiag.style.display = "none";
	imgDiag.style.flexDirection = "column";
	imgDiag.style.gap = "4px";
	imgDiag.style.marginBottom = "8px";

	const sections = document.createElement("div");
	sections.id = "gemSections";
	sections.style.display = "flex";
	sections.style.flexDirection = "column";
	sections.style.gap = "14px";

	wrapper.append(topBar, tagRow, imgDiag, sections);
	panel.appendChild(wrapper);

	state.searchInput = searchInput;
	state.tagWrap = tagWrap;
	state.sectionsEl = sections;
	state.imageDiagEl = imgDiag;
	state.imgLogBtn = imgLogBtn;

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
	imgLogBtn.addEventListener("click", () => void showImageLog());
	setupDebugHotkey(imgLogBtn);

	renderTagFilters();
	renderSections();
}

async function fetchGems(): Promise<GemGroups> {
	const payload = await (window as any).electronAPI?.getGems?.();
	if (!payload || payload.error) {
		throw new Error(payload?.error || "unknown error");
	}
	return (payload.gems || {}) as GemGroups;
}

export async function show(): Promise<void> {
	(window as any).__lastPanel = "gems";
	const panel = ensurePanel();
	panel.innerHTML = "<div class='no-mods'>Loading...</div>";
	setTimeout(() => {
		if (state.panelEl) state.panelEl.scrollTop = 0;
	}, 10);
	try {
		state.groups = await fetchGems();
		state.selectedTags.clear();
		computeTagMetadata(state.groups);
		renderPanel(panel);
		applyFilter();
	} catch (err) {
		const message = err instanceof Error ? err.message : "unknown";
		panel.innerHTML = `<div style="color:var(--accent-red);" class='no-mods'>Failed to load Gems (${message})</div>`;
	}
}

export async function reload(): Promise<void> {
	if (!state.panelEl) {
		await show();
		return;
	}
	state.panelEl.innerHTML = "<div class='no-mods'>Reloading...</div>";
	try {
		state.groups = await fetchGems();
		state.selectedTags.clear();
		computeTagMetadata(state.groups);
		renderPanel(state.panelEl);
		applyFilter();
	} catch (err) {
		const message = err instanceof Error ? err.message : "unknown";
		state.panelEl.innerHTML = `<div style="color:var(--accent-red);" class='no-mods'>Failed to load Gems (${message})</div>`;
	}
}

export function hide(): void {
	if (state.panelEl) {
		state.panelEl.style.display = "none";
	}
}

