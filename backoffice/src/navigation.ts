import { encodeFolderName } from '@umbraco-cms/backoffice/router';
import type { UmbDocumentWorkspaceContext } from '@umbraco-cms/backoffice/document';

/**
 * Navigatie binnen de backoffice naar tab, property, block en veld.
 *
 * Publieke API's (bron: content-editor.element.ts, content-type-structure-manager.class.d.ts):
 * - tabroute van de content-editor: "tab/{encodeFolderName(tabName)}" of "root"
 * - tab van een property via de structuur van het documenttype
 *
 * Interne DOM (geen publieke API, zie FINDINGS.md): het vinden van `umb-property` (`.alias`), van
 * `umb-block-list-entry` (`.contentKey`) en de edit-link van dat item, en van het invoerveld in de property-editor.
 * Dat staat bewust allemaal in dit bestand, zodat het op één plek kan breken.
 */

export interface EditTarget {
	documentKey: string;
	culture: string | null;
	propertyAlias: string | null;
	blockKey: string | null;
	blockPropertyAlias: string | null;
}

/** Tabsegment ("tab/inhoud" of "root") voor een property, op basis van de structuur van het documenttype. */
export async function tabSegmentFor(workspace: UmbDocumentWorkspaceContext, propertyAlias: string): Promise<string | null> {
	const structure = workspace.structure;
	const property = await structure.getPropertyStructureByAlias(propertyAlias);
	if (!property) return null;
	let containerId = property.container?.id ?? null;
	while (containerId) {
		const container = structure.getOwnerContainerById(containerId);
		if (!container) break;
		if (container.type === 'Tab') return `tab/${encodeFolderName(container.name ?? '')}`;
		containerId = container.parent?.id ?? null;
	}
	return 'root';
}

export function navigate(path: string) {
	if (location.pathname === path) return;
	history.pushState(null, '', path);
}

/** Zoekt door alle (open) shadow roots heen. */
function deepQueryAll(root: ParentNode, predicate: (el: Element) => boolean, out: Element[] = []): Element[] {
	// Ook de eigen shadow root van het startelement (bv. umb-property → editor → input).
	if (root instanceof Element && root.shadowRoot) deepQueryAll(root.shadowRoot, predicate, out);
	for (const el of Array.from(root.querySelectorAll('*'))) {
		if (predicate(el)) out.push(el);
		if (el.shadowRoot) deepQueryAll(el.shadowRoot, predicate, out);
	}
	return out;
}

function deepQuery<T extends Element>(root: ParentNode, predicate: (el: Element) => boolean): T | null {
	return (deepQueryAll(root, predicate)[0] as T | undefined) ?? null;
}

const isProperty = (alias: string) => (el: Element) =>
	el.localName === 'umb-property' && (el as Element & { alias?: string }).alias === alias;

const isBlockEntry = (key: string) => (el: Element) =>
	el.localName === 'umb-block-list-entry' && (el as Element & { contentKey?: string }).contentKey === key;

/** Het bovenste open modal (sidebar of dialoog), of null. Nieuwe modals worden achteraan toegevoegd. */
function topModal(): Element | null {
	const modals = deepQueryAll(document, (el) => el.localName === 'uui-modal-sidebar' || el.localName === 'uui-modal-dialog');
	return modals.at(-1) ?? null;
}

async function waitFor<T>(find: () => T | null, timeoutMs = 5000): Promise<T | null> {
	const end = performance.now() + timeoutMs;
	while (performance.now() < end) {
		const found = find();
		if (found) return found;
		await new Promise((r) => setTimeout(r, 100));
	}
	return null;
}

/**
 * Brengt het veld van een edit-verzoek in beeld en geeft het focus.
 * - `getScope` levert de editor waarin gezocht wordt: de editor naast de preview, of het modal met een ander document.
 * - property op het document: `umb-property` met die alias. Staat hij niet op de zichtbare tab en is `tryTabs` aan,
 *   dan worden de tabs van die editor één voor één geopend (hun eigen links).
 * - veld in een block: het block-item in de Block List-property, geopend via zijn eigen edit-link (dezelfde routed
 *   modal als een klik op het item), en daarin de property van het block.
 * Geeft het gefocuste element terug, of null.
 */
export async function focusTarget(
	getScope: () => ParentNode | null,
	target: EditTarget,
	opts: { tryTabs?: boolean } = {},
): Promise<HTMLElement | null> {
	if (!target.propertyAlias) return null;
	const alias = target.propertyAlias;
	const find = () => {
		const scope = getScope();
		return scope ? deepQuery<HTMLElement>(scope, isProperty(alias)) : null;
	};

	let property = await waitFor(find, opts.tryTabs ? 2000 : 5000);
	if (!property && opts.tryTabs) {
		const scope = getScope();
		const tabs = scope ? deepQueryAll(scope, (el) => el.localName === 'uui-tab' && !!el.getAttribute('href')) : [];
		for (const tab of tabs) {
			navigate(new URL(tab.getAttribute('href')!, location.href).pathname);
			property = await waitFor(find, 1500);
			if (property) break;
		}
	}
	if (!property) return null;

	if (!target.blockKey) {
		await focusField(property);
		markFocus(target);
		return property;
	}

	const entry = await waitFor(() => deepQuery<HTMLElement>(property!, isBlockEntry(target.blockKey!)));
	if (!entry) {
		await focusField(property);
		markFocus(target);
		return property;
	}
	entry.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });

	const field = target.blockPropertyAlias ? await openBlockAndFind(entry, target.blockPropertyAlias) : null;
	if (field) {
		await focusField(field);
	} else {
		highlight(entry);
	}
	markFocus(target);
	return field ?? entry;
}

/** Opent het block via de edit-link van het item en zoekt daarna de property in het geopende modal. */
async function openBlockAndFind(entry: HTMLElement, blockPropertyAlias: string): Promise<HTMLElement | null> {
	// De link wordt per route opgebouwd. Direct na een tab-navigatie kan hij nog bij de vorige route horen, en een
	// navigatie die tijdens het verwerken van de vorige wordt gestart, draait de router terug. Daarom: wachten tot de
	// link onder de huidige route valt, en één keer opnieuw proberen als het modal niet verschijnt.
	for (let attempt = 0; attempt < 2; attempt++) {
		const href = await waitFor(() => {
			const link = deepQuery<HTMLAnchorElement>(entry, (el) => el.localName === 'a' && !!el.getAttribute('href'));
			const path = link ? new URL(link.getAttribute('href')!, location.href).pathname : null;
			return path && path.startsWith(`${location.pathname.replace(/\/$/, '')}/`) ? path : null;
		}, 3000);
		if (!href) return null;
		await new Promise((r) => requestAnimationFrame(r));
		navigate(href);
		const field = await findInModal(blockPropertyAlias, 3000);
		if (field) return field;
	}
	return null;
}

/** Het bovenste open modal (block- of document-workspace) als zoekgebied. */
export const modalScope = (): ParentNode | null => topModal();

/** Zoekt een property in het bovenste open modal. */
async function findInModal(propertyAlias: string, timeoutMs = 5000): Promise<HTMLElement | null> {
	return waitFor(() => {
		const modal = topModal();
		return modal ? deepQuery<HTMLElement>(modal, isProperty(propertyAlias)) : null;
	}, timeoutMs);
}

/**
 * Scrollt naar de property, markeert hem kort en zet de focus in het eerste invoerveld (ook in shadow DOM).
 * Property-editors laden lui: er wordt even gewacht tot het invoerveld er is.
 */
export async function focusField(property: HTMLElement) {
	property.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
	highlight(property);
	const input = await waitFor(
		() =>
			deepQuery<HTMLElement>(
				property,
				(el) =>
					(el.localName === 'input' && (el as HTMLInputElement).type !== 'hidden') ||
					el.localName === 'textarea' ||
					el.getAttribute('contenteditable') === 'true',
			),
		1500,
	);
	const focusable =
		input ?? deepQuery<HTMLElement>(property, (el) => el.localName === 'button' || el.localName === 'uui-button');
	if (!focusable) return;
	focusable.focus({ preventScroll: true });
	// Een net geopend workspace-modal zet zelf nog de focus op het naamveld. Houd de focus kort vast.
	for (let i = 0; i < 8; i++) {
		await new Promise((r) => setTimeout(r, 125));
		if (!containsDeep(property, deepActiveElement())) focusable.focus({ preventScroll: true });
	}
}

function deepActiveElement(): Element | null {
	let el = document.activeElement;
	while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
	return el;
}

/** Is `node` (eventueel via shadow-hosts) een afstammeling van `ancestor`? */
function containsDeep(ancestor: Element, node: Node | null): boolean {
	while (node) {
		if (node === ancestor) return true;
		node = node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode;
	}
	return false;
}

/** Laatst gefocuste doel, zichtbaar voor tests (document.documentElement.dataset). */
function markFocus(target: EditTarget) {
	const d = document.documentElement.dataset;
	d.visualEditingFocusDocument = target.documentKey;
	d.visualEditingFocusProperty = target.propertyAlias ?? '';
	d.visualEditingFocusBlock = target.blockKey ?? '';
	d.visualEditingFocusBlockProperty = target.blockPropertyAlias ?? '';
}

function highlight(element: HTMLElement) {
	element.setAttribute('data-visual-editing-focus', '');
	const previous = element.style.outline;
	element.style.outline = '2px solid var(--uui-color-focus, #3544b1)';
	element.style.outlineOffset = '4px';
	setTimeout(() => {
		element.style.outline = previous;
		element.removeAttribute('data-visual-editing-focus');
	}, 2000);
}
