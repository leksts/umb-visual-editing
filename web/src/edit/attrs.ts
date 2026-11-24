import { EDIT_ATTRIBUTES as A, formatBlockPath, type BlockPathStep } from '../../../shared/protocol';

/**
 * Edit-descriptor die een content-component als optionele prop `edit` ontvangt (DECISIONS.md D7).
 * Zonder descriptor (productie, of preview zonder edit-modus) renderen componenten geen enkel extra attribuut.
 */
export interface EditDescriptor {
	documentKey: string;
	culture?: string | null;
	/** Alleen bij blocks: alias van de Block List-property op het document. */
	propertyAlias?: string;
	/** Alleen bij blocks: content-key van het block. */
	blockKey?: string;
	/** Alleen bij geneste blocks: pad van buiten naar binnen (eerste stap = property op het document). */
	blockPath?: BlockPathStep[];
	/** Label voor de overlay (document- of blocknaam). */
	label?: string;
	/** Labels per property-alias (uit de metadata). */
	labels?: Record<string, string>;
}

export type EditAttrs = Record<string, string>;

const NONE: EditAttrs = Object.freeze({}) as EditAttrs;

function base(edit: EditDescriptor): EditAttrs {
	const attrs: EditAttrs = { [A.document]: edit.documentKey };
	if (edit.culture) attrs[A.culture] = edit.culture;
	return attrs;
}

/** Alleen bij een genest block (pad langer dan één stap); blocks op het eerste niveau houden hun attributen. */
function blockPath(edit: EditDescriptor): EditAttrs {
	return edit.blockPath && edit.blockPath.length > 1 ? { [A.blockPath]: formatBlockPath(edit.blockPath) } : {};
}

/** Attributen voor het root-element van een component: bij een block het hele block, anders niets. */
export function rootAttrs(edit: EditDescriptor | undefined | null): EditAttrs {
	if (!edit?.blockKey) return NONE;
	return {
		...base(edit),
		[A.property]: edit.propertyAlias ?? '',
		[A.block]: edit.blockKey,
		...blockPath(edit),
		[A.label]: edit.label ?? 'Block',
	};
}

/** Attributen voor het element dat één veld (property) rendert. */
export function fieldAttrs(edit: EditDescriptor | undefined | null, alias: string): EditAttrs {
	if (!edit) return NONE;
	const fieldLabel = edit.labels?.[alias] ?? alias;
	if (edit.blockKey) {
		return {
			...base(edit),
			[A.property]: edit.propertyAlias ?? '',
			[A.block]: edit.blockKey,
			[A.blockProperty]: alias,
			...blockPath(edit),
			[A.label]: `${edit.label ?? 'Block'} › ${fieldLabel}`,
		};
	}
	return { ...base(edit), [A.property]: alias, [A.label]: fieldLabel };
}

/**
 * Helper voor Vue-componenten: `const e = useEdit(() => props.edit)` en dan
 * `v-bind="e.root()"` / `v-bind="e.field('title')"`. Geeft gewone objecten terug, dus werkt identiek in SSR,
 * bij hydration en na re-renders (de attributen horen bij de vnode-props). Geen Vue-import nodig.
 */
export function useEdit(edit: () => EditDescriptor | undefined | null) {
	return {
		root: () => rootAttrs(edit()),
		field: (alias: string) => fieldAttrs(edit(), alias),
	};
}
