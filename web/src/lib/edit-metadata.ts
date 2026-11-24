import type { EditDescriptor } from '../edit/attrs';
import type { ApiBlockItem, ApiContent } from './umbraco';

/** Edit-metadata zoals de Delivery API die meestuurt bij preview + edit-modus (PLAN.md §3). */
export interface EditPropertyMetadata {
	alias: string;
	label: string;
	editorAlias: string;
	tab?: string | null;
}

export interface EditBlockMetadata {
	blockKey: string;
	settingsKey: string | null;
	elementType: string;
	propertyAlias: string;
	/** Ouder-block bij een genest block, anders null. */
	parentBlockKey: string | null;
	path: string;
	index: number;
	properties: Record<string, EditPropertyMetadata>;
}

export interface EditMetadata {
	version: 1;
	entityType: 'document';
	documentKey: string;
	documentType: string;
	culture: string | null;
	properties: Record<string, EditPropertyMetadata>;
	blocks: Record<string, EditBlockMetadata>;
}

function labels(props: Record<string, EditPropertyMetadata>): Record<string, string> {
	return Object.fromEntries(Object.values(props).map((p) => [p.alias, p.label]));
}

/** Descriptor voor een component dat velden van het document zelf rendert. */
export function documentEdit(item: ApiContent | null | undefined): EditDescriptor | undefined {
	const meta = item?.editMetadata;
	if (!meta) return undefined;
	return {
		documentKey: meta.documentKey,
		culture: meta.culture,
		label: item!.name,
		labels: labels(meta.properties),
	};
}

/** Descriptor voor een block-component. Koppeling via de bestaande content.id van het block-item. */
export function blockEdit(item: ApiContent | null | undefined, block: ApiBlockItem): EditDescriptor | undefined {
	const meta = item?.editMetadata;
	const blockMeta = meta?.blocks[block.content.id];
	if (!meta || !blockMeta) return undefined;
	// Pad van buiten naar binnen via parentBlockKey; de eerste stap is de Block List-property op het document.
	const chain: EditBlockMetadata[] = [];
	for (let b: EditBlockMetadata | undefined = blockMeta; b; b = b.parentBlockKey ? meta.blocks[b.parentBlockKey] : undefined) {
		chain.unshift(b);
	}
	const root = chain[0];
	const parent = meta.properties[root.propertyAlias];
	return {
		documentKey: meta.documentKey,
		culture: meta.culture,
		propertyAlias: root.propertyAlias,
		blockKey: blockMeta.blockKey,
		blockPath: chain.map((b) => ({ propertyAlias: b.propertyAlias, blockKey: b.blockKey })),
		label: [parent?.label ?? root.propertyAlias, ...chain.map((b) => `${humanize(b.elementType)} ${b.index + 1}`)].join(' › '),
		labels: labels(blockMeta.properties),
	};
}

function humanize(alias: string): string {
	const known: Record<string, string> = {
		textBlock: 'Tekstblok',
		quoteBlock: 'Citaat',
		calloutBlock: 'Uitgelicht',
		faqBlock: 'Vraag',
		exchangeRateBlock: 'Wisselkoers',
	};
	return known[alias] ?? alias;
}

/**
 * Fase 2: edit-metadata in exact hetzelfde formaat, maar in de frontend afgeleid uit de response.
 * Wordt gebruikt met VE_METADATA_SOURCE=mock, en in fase 3 vervangen door de echte metadata van de API.
 */
export function withMockEditMetadata(item: ApiContent | null): ApiContent | null {
	if (!item) return item;
	const prop = (alias: string): EditPropertyMetadata => ({
		alias,
		label: alias.charAt(0).toUpperCase() + alias.slice(1),
		editorAlias: 'mock',
		tab: null,
	});
	const properties = Object.fromEntries(Object.keys(item.properties).map((a) => [a, prop(a)]));
	const blocks: Record<string, EditBlockMetadata> = {};
	const addBlocks = (props: Record<string, unknown>, parent: string | null, prefix: string) => {
		for (const [alias, value] of Object.entries(props)) {
			const items = (value as { items?: ApiBlockItem[] } | null)?.items;
			if (!Array.isArray(items)) continue;
			items.forEach((b, index) => {
				const path = `${prefix}${alias}[${index}]`;
				blocks[b.content.id] = {
					blockKey: b.content.id,
					settingsKey: b.settings?.id ?? null,
					elementType: b.content.contentType,
					propertyAlias: alias,
					parentBlockKey: parent,
					path,
					index,
					properties: Object.fromEntries(Object.keys(b.content.properties).map((a) => [a, prop(a)])),
				};
				addBlocks(b.content.properties, b.content.id, `${path}.`);
			});
		}
	};
	addBlocks(item.properties, null, '');
	return {
		...item,
		editMetadata: {
			version: 1,
			entityType: 'document',
			documentKey: item.id,
			documentType: item.contentType,
			culture: null,
			properties,
			blocks,
		},
	};
}
