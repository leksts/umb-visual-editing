/**
 * Edit-script voor visual editing. Wordt alleen geladen in preview + edit-modus (EditRuntime.astro).
 *
 * - Handshake met de parent (backoffice) volgens shared/protocol.ts: "loaded" → "init" → "ready".
 *   Vóór de handshake alleen "loaded", gepost naar elke toegestane origin afzonderlijk (nooit "*").
 *   Na "init" wordt alleen nog met die ene origin gepraat.
 * - Detecteert bewerkbare elementen (data-umb-*), ook na hydration en DOM-wijzigingen (MutationObserver).
 * - Tekent een hover-overlay met label, en stuurt bij een klik een "edit"-bericht.
 * - Beantwoordt "getScroll" en herstelt de scrollpositie uit "init".
 */
import {
	EDIT_ATTRIBUTES as A,
	createMessage,
	isProtocolMessage,
	normalizeOrigin,
	parseBlockPath,
	type EditRequestMessage,
	type FrontendToParentMessage,
	type ProtocolMessage,
	type ReadyMessage,
	type ScrollMessage,
	type ScrollPosition,
} from '../../../shared/protocol';

interface RuntimeConfig {
	allowedOrigins: string[];
}

interface VisualEditingState {
	parentOrigin: string | null;
	editMode: boolean;
	editableCount: number;
}

declare global {
	interface Window {
		__umbVisualEditing?: VisualEditingState;
	}
}

const EDITABLE_SELECTOR = `[${A.document}]`;
/** Bedieningselementen binnen een bewerkbaar element blijven gewoon werken (bv. "Kopieer citaat"). */
const PASSTHROUGH_SELECTOR = 'button, input, select, textarea, label, summary, [data-umb-edit-ignore]';

export function startVisualEditing(): void {
	if (window.__umbVisualEditing) return; // al gestart
	const configEl = document.getElementById('umb-ve-config');
	const config: RuntimeConfig = configEl ? JSON.parse(configEl.textContent || '{}') : { allowedOrigins: [] };
	const allowed = new Set(config.allowedOrigins.map(normalizeOrigin).filter(Boolean));

	const state: VisualEditingState = { parentOrigin: null, editMode: false, editableCount: 0 };
	window.__umbVisualEditing = state;

	const inIframe = window.parent !== window;
	const overlay = new Overlay();
	const registry = new Set<HTMLElement>();
	let hovered: HTMLElement | null = null;

	// ---- berichten ---------------------------------------------------------------------------------------------

	function send(message: FrontendToParentMessage) {
		if (!state.parentOrigin) return;
		window.parent.postMessage(message, state.parentOrigin);
	}

	function announceLoaded() {
		if (!inIframe) return;
		const msg = createMessage<FrontendToParentMessage & { type: 'loaded' }>('loaded', { url: location.href });
		// Per origin posten: de browser levert alleen af als de parent echt die origin heeft.
		for (const origin of allowed) {
			window.parent.postMessage(msg, origin);
		}
	}

	function onMessage(event: MessageEvent) {
		if (!inIframe || event.source !== window.parent) return;
		if (!isProtocolMessage(event.data)) return;
		const origin = normalizeOrigin(event.origin);
		if (state.parentOrigin ? origin !== state.parentOrigin : !allowed.has(origin)) return;
		handle(event.data, origin);
	}

	function handle(message: ProtocolMessage, origin: string) {
		switch (message.type) {
			case 'init': {
				state.parentOrigin = origin;
				setEditMode(message.editMode === true);
				restoreScroll(message.scroll ?? null).then(() => {
					send(
						createMessage<ReadyMessage>('ready', {
							url: location.href,
							editMode: state.editMode,
							documentKeys: [...new Set([...registry].map((el) => el.getAttribute(A.document)!))],
						}),
					);
				});
				break;
			}
			case 'getScroll': {
				if (!state.parentOrigin) return;
				send(createMessage<ScrollMessage>('scroll', { requestId: String(message.requestId), x: scrollX, y: scrollY }));
				break;
			}
			default:
				break; // berichten in de andere richting of onbekend: negeren
		}
	}

	// ---- scroll -----------------------------------------------------------------------------------------------

	async function restoreScroll(scroll: ScrollPosition | null) {
		if (!scroll || !Number.isFinite(scroll.x) || !Number.isFinite(scroll.y)) return;
		const apply = () => window.scrollTo({ left: scroll.x, top: scroll.y, behavior: 'instant' as ScrollBehavior });
		apply();
		if (document.readyState !== 'complete') {
			await new Promise<void>((resolve) => addEventListener('load', () => resolve(), { once: true }));
			apply();
		}
		// Layout kan nog verschuiven (afbeeldingen, hydration): een paar frames blijven corrigeren.
		for (let i = 0; i < 10 && Math.abs(scrollY - scroll.y) > 1; i++) {
			await new Promise((r) => requestAnimationFrame(r));
			apply();
		}
	}

	// ---- detectie ---------------------------------------------------------------------------------------------

	function scan(root: ParentNode) {
		if (root instanceof HTMLElement && root.matches(EDITABLE_SELECTOR)) registry.add(root);
		root.querySelectorAll<HTMLElement>(EDITABLE_SELECTOR).forEach((el) => registry.add(el));
	}

	function prune() {
		for (const el of registry) if (!el.isConnected) registry.delete(el);
		if (hovered && !hovered.isConnected) setHovered(null);
		state.editableCount = registry.size;
		document.documentElement.toggleAttribute('data-umb-ve-active', state.editMode);
	}

	const observer = new MutationObserver((mutations) => {
		for (const m of mutations) {
			if (m.type === 'attributes' && m.target instanceof HTMLElement) {
				if (m.target.matches(EDITABLE_SELECTOR)) registry.add(m.target);
				else registry.delete(m.target);
			}
			m.addedNodes.forEach((n) => n instanceof HTMLElement && scan(n));
		}
		prune();
		if (hovered) overlay.show(hovered);
	});

	// ---- overlay en klik --------------------------------------------------------------------------------------

	function editableFrom(target: EventTarget | null): HTMLElement | null {
		if (!(target instanceof Element)) return null;
		return target.closest<HTMLElement>(EDITABLE_SELECTOR);
	}

	function setHovered(el: HTMLElement | null) {
		hovered = el;
		if (el && state.editMode) overlay.show(el);
		else overlay.hide();
	}

	function onPointerOver(event: PointerEvent | MouseEvent) {
		if (!state.editMode) return;
		setHovered(editableFrom(event.target));
	}

	function onPointerLeaveDocument(event: MouseEvent) {
		if (!event.relatedTarget) setHovered(null);
	}

	function onClick(event: MouseEvent) {
		if (!state.editMode) return;
		const target = event.target as Element | null;
		const el = editableFrom(target);
		if (!el) return;
		if (target?.closest(PASSTHROUGH_SELECTOR)) return;
		event.preventDefault();
		event.stopPropagation();
		const blockPath = parseBlockPath(el.getAttribute(A.blockPath));
		send(
			createMessage<EditRequestMessage>('edit', {
				entityType: 'document',
				documentKey: el.getAttribute(A.document)!,
				culture: el.getAttribute(A.culture),
				propertyAlias: el.getAttribute(A.property),
				blockKey: el.getAttribute(A.block),
				blockPropertyAlias: el.getAttribute(A.blockProperty),
				...(blockPath ? { blockPath } : {}),
			}),
		);
		overlay.flash();
	}

	function setEditMode(on: boolean) {
		state.editMode = on;
		document.documentElement.toggleAttribute('data-umb-ve-active', on);
		if (!on) setHovered(null);
	}

	// ---- start ------------------------------------------------------------------------------------------------

	scan(document);
	prune();
	observer.observe(document.body, {
		subtree: true,
		childList: true,
		attributes: true,
		attributeFilter: Object.values(A),
	});
	addEventListener('message', onMessage);
	document.addEventListener('mouseover', onPointerOver, true);
	document.addEventListener('mouseout', onPointerLeaveDocument, true);
	document.addEventListener('click', onClick, true);
	addEventListener('scroll', () => hovered && overlay.show(hovered), { passive: true });
	addEventListener('resize', () => hovered && overlay.show(hovered));
	announceLoaded();
}

/** Eén overlay-element in een eigen shadow root, zodat site-CSS er niet bij kan (en andersom). */
class Overlay {
	#host: HTMLElement;
	#box: HTMLElement;
	#label: HTMLElement;

	constructor() {
		this.#host = document.createElement('umb-ve-overlay');
		this.#host.setAttribute('data-umb-edit-ignore', '');
		const shadow = this.#host.attachShadow({ mode: 'open' });
		shadow.innerHTML = `
			<style>
				:host { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; }
				.box { position: fixed; display: none; outline: 2px solid #3544b1; outline-offset: 2px; border-radius: 3px;
					background: rgba(53, 68, 177, 0.06); transition: background .15s; }
				.box.flash { background: rgba(53, 68, 177, 0.25); }
				.label { position: absolute; left: -2px; bottom: 100%; margin-bottom: 4px; white-space: nowrap;
					font: 600 12px/1.4 system-ui, sans-serif; color: #fff; background: #3544b1; padding: 2px 8px; border-radius: 3px; }
				.box.below .label { bottom: auto; top: 100%; margin: 4px 0 0; }
			</style>
			<div class="box" part="box"><span class="label" part="label"></span></div>`;
		this.#box = shadow.querySelector('.box')!;
		this.#label = shadow.querySelector('.label')!;
		document.body.appendChild(this.#host);
	}

	show(el: HTMLElement) {
		const r = el.getBoundingClientRect();
		Object.assign(this.#box.style, {
			display: 'block',
			left: `${r.left}px`,
			top: `${r.top}px`,
			width: `${r.width}px`,
			height: `${r.height}px`,
		});
		this.#box.classList.toggle('below', r.top < 28);
		this.#label.textContent = el.getAttribute(A.label) || el.getAttribute(A.property) || 'Bewerken';
		this.#host.setAttribute('data-target-label', this.#label.textContent);
	}

	hide() {
		this.#box.style.display = 'none';
		this.#host.removeAttribute('data-target-label');
	}

	flash() {
		this.#box.classList.add('flash');
		setTimeout(() => this.#box.classList.remove('flash'), 250);
	}
}
