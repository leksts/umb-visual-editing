import type { PreviewContext } from './preview';

/**
 * Modus waarin een pagina rendert (DECISIONS.md D23):
 * - live:    gepubliceerde site, voor bezoekers;
 * - preview: concept-content zoals de bezoeker hem zou zien, maar zonder gevolgen (geen tracking, geen echte acties);
 * - edit:    preview in de backoffice met kaders en klik-naar-veld: alles bereikbaar, stil en klikbaar.
 * Komt uit de server-side preview-context, dus SSR en hydration zien dezelfde waarde.
 */
export type RenderMode = 'live' | 'preview' | 'edit';

export function renderMode(preview: PreviewContext): RenderMode {
	if (!preview.enabled) return 'live';
	return preview.edit ? 'edit' : 'preview';
}

/**
 * Wat een component in een modus doet:
 * - live:        zoals op de site;
 * - readonly:    externe bronnen alleen lezen, acties (versturen, bestellen) alleen simuleren;
 * - static:      geen externe verzoeken; voorbeeld- of vaste data;
 * - placeholder: alleen een kader dat zegt welk component hier staat.
 */
export type Behavior = 'live' | 'readonly' | 'static' | 'placeholder';

export interface BlockPolicy {
	preview: Behavior;
	edit: Behavior;
}

/** Standaard voor een blocktype zonder expliciete keuze: liever te voorzichtig dan per ongeluk een echte actie. */
export const DEFAULT_POLICY: BlockPolicy = { preview: 'readonly', edit: 'static' };

/**
 * Expliciete keuze per blocktype, op één plek (naast de koppeling blocktype → component in BlockList.astro).
 * Nieuwe blocktypes horen hier een regel te krijgen; zonder regel geldt DEFAULT_POLICY.
 */
export const BLOCK_POLICIES: Record<string, BlockPolicy> = {
	textBlock: { preview: 'live', edit: 'live' },
	quoteBlock: { preview: 'live', edit: 'live' },
	calloutBlock: { preview: 'live', edit: 'live' },
	// Uitklapblok: geen externe verzoeken; in edit-modus rendert het component zichzelf open (op basis van `mode`).
	faqBlock: { preview: 'live', edit: 'live' },
	// Externe API: in preview echt ophalen (alleen lezen), in edit-modus voorbeelddata (elke save herlaadt de preview).
	exchangeRateBlock: { preview: 'readonly', edit: 'static' },
};

export function behaviorFor(blockType: string, mode: RenderMode): Behavior {
	if (mode === 'live') return 'live';
	return (BLOCK_POLICIES[blockType] ?? DEFAULT_POLICY)[mode];
}
