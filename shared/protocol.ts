/**
 * postMessage-protocol tussen de frontend (iframe) en de parent (Umbraco-backoffice), versie 1.
 * Zie PLAN.md §2. Gedeeld door web/ en backoffice/; bevat geen runtime-afhankelijkheden.
 */

export const PROTOCOL_SOURCE = 'umbraco-visual-editing' as const;
export const PROTOCOL_VERSION = 1 as const;

interface Envelope<T extends string> {
	source: typeof PROTOCOL_SOURCE;
	version: typeof PROTOCOL_VERSION;
	type: T;
}

export interface ScrollPosition {
	x: number;
	y: number;
}

/** frontend → parent. Het enige bericht dat vóór de handshake mag. */
export interface LoadedMessage extends Envelope<'loaded'> {
	url: string;
}

/** parent → frontend. Start de handshake. */
export interface InitMessage extends Envelope<'init'> {
	editMode: boolean;
	scroll?: ScrollPosition | null;
}

/** frontend → parent. Bevestigt de handshake (na scroll-herstel). */
export interface ReadyMessage extends Envelope<'ready'> {
	url: string;
	editMode: boolean;
}

/** frontend → parent. Redacteur klikte op een bewerkbaar element. */
export interface EditRequestMessage extends Envelope<'edit'> {
	entityType: 'document';
	documentKey: string;
	culture: string | null;
	propertyAlias: string | null;
	blockKey: string | null;
	blockPropertyAlias: string | null;
}

/** parent → frontend. Vraag de huidige scrollpositie op (vlak voor herladen). */
export interface GetScrollMessage extends Envelope<'getScroll'> {
	requestId: string;
}

/** frontend → parent. Antwoord op getScroll. */
export interface ScrollMessage extends Envelope<'scroll'>, ScrollPosition {
	requestId: string;
}

export type FrontendToParentMessage = LoadedMessage | ReadyMessage | EditRequestMessage | ScrollMessage;
export type ParentToFrontendMessage = InitMessage | GetScrollMessage;
export type ProtocolMessage = FrontendToParentMessage | ParentToFrontendMessage;

type Payload<M extends ProtocolMessage> = Omit<M, 'source' | 'version' | 'type'>;

export function createMessage<M extends ProtocolMessage>(type: M['type'], payload: Payload<M>): M {
	return { source: PROTOCOL_SOURCE, version: PROTOCOL_VERSION, type, ...payload } as M;
}

/** Herkent een bericht van dit protocol (juiste source en versie). Alle andere berichten worden genegeerd. */
export function isProtocolMessage(data: unknown): data is ProtocolMessage {
	return (
		typeof data === 'object' &&
		data !== null &&
		(data as { source?: unknown }).source === PROTOCOL_SOURCE &&
		(data as { version?: unknown }).version === PROTOCOL_VERSION &&
		typeof (data as { type?: unknown }).type === 'string'
	);
}

/** Normaliseert een origin (zonder trailing slash, lowercase), zodat vergelijken betrouwbaar is. */
export function normalizeOrigin(origin: string): string {
	try {
		return new URL(origin).origin;
	} catch {
		return '';
	}
}

/** Data-attributen die componenten renderen (PLAN.md §3). */
export const EDIT_ATTRIBUTES = {
	document: 'data-umb-doc',
	culture: 'data-umb-culture',
	property: 'data-umb-prop',
	block: 'data-umb-block',
	blockProperty: 'data-umb-block-prop',
	label: 'data-umb-label',
} as const;
