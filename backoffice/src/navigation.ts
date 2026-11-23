import { UMB_EDIT_DOCUMENT_WORKSPACE_PATH_PATTERN } from '@umbraco-cms/backoffice/document';
import { encodeFolderName } from '@umbraco-cms/backoffice/router';
import type { UmbDocumentWorkspaceContext } from '@umbraco-cms/backoffice/document';

/**
 * Navigatie binnen de backoffice naar document, tab en property.
 *
 * Publieke API's (bron: src/packages/documents/documents/paths.ts, content-editor.element.ts):
 * - documentroute: UMB_EDIT_DOCUMENT_WORKSPACE_PATH_PATTERN + "/{variant}/view/{pathname}"
 * - tabroute van de content-editor: "tab/{encodeFolderName(tabName)}" of "root"
 *
 * Interne DOM (geen publieke API, zie FINDINGS.md): het vinden van het property-element en het block-item om te
 * scrollen en te markeren. Dat staat bewust apart in {@link focusProperty}, zodat het op één plek kan breken.
 */

export interface EditTarget {
	documentKey: string;
	culture: string | null;
	propertyAlias: string | null;
	blockKey: string | null;
	blockPropertyAlias: string | null;
}

const PENDING_KEY = 'umb-visual-editing:pending-focus';

/** Bewaart een focusdoel voor als de workspace van een ander document is geladen. */
export function setPendingFocus(target: EditTarget) {
	sessionStorage.setItem(PENDING_KEY, JSON.stringify(target));
}

export function takePendingFocus(documentKey: string): EditTarget | null {
	const raw = sessionStorage.getItem(PENDING_KEY);
	if (!raw) return null;
	const target = JSON.parse(raw) as EditTarget;
	if (target.documentKey !== documentKey) return null;
	sessionStorage.removeItem(PENDING_KEY);
	return target;
}

export function documentViewPath(documentKey: string, culture: string | null, pathname: string): string {
	const base = UMB_EDIT_DOCUMENT_WORKSPACE_PATH_PATTERN.generateAbsolute({ unique: documentKey });
	return `${base}/${culture ?? 'invariant'}/view/${pathname}`;
}

/** Tabsegment ("tab/Inhoud" of "root") voor een property, op basis van de structuur van het documenttype. */
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
	for (const el of Array.from(root.querySelectorAll('*'))) {
		if (predicate(el)) out.push(el);
		if (el.shadowRoot) deepQueryAll(el.shadowRoot, predicate, out);
	}
	return out;
}

function findProperty(scope: ParentNode, alias: string): HTMLElement | null {
	return (deepQueryAll(scope, (el) => el.localName === 'umb-property' && (el as HTMLElement & { alias?: string }).alias === alias)[0] ??
		null) as HTMLElement | null;
}

function findBlock(scope: ParentNode, blockKey: string): HTMLElement | null {
	return (deepQueryAll(
		scope,
		(el) => el.localName === 'umb-block-list-entry' && (el as HTMLElement & { contentKey?: string }).contentKey === blockKey,
	)[0] ?? null) as HTMLElement | null;
}

/**
 * Scrolt naar de property (of het block-item) en markeert die kort. Wacht tot het element er is (de tab rendert lui).
 * Geeft het gevonden element terug, of null.
 */
export async function focusProperty(scope: ParentNode, target: EditTarget, timeoutMs = 4000): Promise<HTMLElement | null> {
	if (!target.propertyAlias) return null;
	const end = performance.now() + timeoutMs;
	while (performance.now() < end) {
		const property = findProperty(scope, target.propertyAlias);
		if (property) {
			const block = target.blockKey ? findBlock(property, target.blockKey) : null;
			const element = block ?? property;
			element.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
			highlight(element);
			markFocus(target);
			return element;
		}
		await new Promise((r) => setTimeout(r, 100));
	}
	return null;
}

/** Laatst gefocuste doel, zichtbaar voor tests (document.documentElement.dataset). */
function markFocus(target: EditTarget) {
	const d = document.documentElement.dataset;
	d.visualEditingFocusProperty = target.propertyAlias ?? '';
	d.visualEditingFocusBlock = target.blockKey ?? '';
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
	const input = element.querySelector<HTMLElement>('input, textarea, [contenteditable]');
	input?.focus({ preventScroll: true });
}
