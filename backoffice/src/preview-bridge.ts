import {
	createMessage,
	isProtocolMessage,
	normalizeOrigin,
	type EditRequestMessage,
	type GetScrollMessage,
	type InitMessage,
	type ProtocolMessage,
	type ScrollPosition,
} from '../../shared/protocol';

export interface PreviewBridgeCallbacks {
	/** documentKeys: documenten met bewerkbare elementen op de getoonde pagina. */
	onReady(documentKeys: string[]): void;
	onEdit(message: EditRequestMessage): void;
}

/**
 * Parent-kant van het postMessage-protocol (shared/protocol.ts). Accepteert alleen berichten van het eigen iframe
 * (`event.source === iframe.contentWindow`) én van de origin van de preview-URL. Die URL komt van de server
 * (VisualEditingUrlProvider), dus de server bepaalt welke frontend-origin is toegestaan.
 * Berichten gaan altijd naar die ene origin, nooit naar "*".
 */
export class PreviewBridge {
	#iframe: HTMLIFrameElement | null = null;
	#origin = '';
	#pendingScroll: ScrollPosition | null = null;
	#scrollRequests = new Map<string, (pos: ScrollPosition | null) => void>();
	#counter = 0;
	#callbacks: PreviewBridgeCallbacks;

	constructor(callbacks: PreviewBridgeCallbacks) {
		this.#callbacks = callbacks;
	}

	connect() {
		window.addEventListener('message', this.#onMessage);
	}

	disconnect() {
		window.removeEventListener('message', this.#onMessage);
		this.#scrollRequests.forEach((resolve) => resolve(null));
		this.#scrollRequests.clear();
	}

	/** Koppelt het iframe en de toegestane origin (afgeleid van de preview-URL van de server). */
	attach(iframe: HTMLIFrameElement, previewUrl: string) {
		this.#iframe = iframe;
		this.#origin = normalizeOrigin(previewUrl);
	}

	/** Scrollpositie die bij de volgende handshake wordt meegegeven (na herladen). */
	setPendingScroll(scroll: ScrollPosition | null) {
		this.#pendingScroll = scroll;
	}

	/** Vraagt de scrollpositie op; na de time-out `null`. */
	getScroll(timeoutMs = 500): Promise<ScrollPosition | null> {
		const requestId = `s${++this.#counter}`;
		return new Promise((resolve) => {
			this.#scrollRequests.set(requestId, resolve);
			this.#post(createMessage<GetScrollMessage>('getScroll', { requestId }));
			setTimeout(() => {
				if (this.#scrollRequests.delete(requestId)) resolve(null);
			}, timeoutMs);
		});
	}

	#post(message: ProtocolMessage) {
		if (!this.#iframe?.contentWindow || !this.#origin) return;
		this.#iframe.contentWindow.postMessage(message, this.#origin);
	}

	#onMessage = (event: MessageEvent) => {
		if (!this.#iframe || event.source !== this.#iframe.contentWindow) return;
		if (normalizeOrigin(event.origin) !== this.#origin) return;
		if (!isProtocolMessage(event.data)) return;
		const message = event.data;
		switch (message.type) {
			case 'loaded':
				this.#post(createMessage<InitMessage>('init', { editMode: true, scroll: this.#pendingScroll }));
				this.#pendingScroll = null;
				break;
			case 'ready':
				this.#callbacks.onReady(Array.isArray(message.documentKeys) ? message.documentKeys.map(String) : []);
				break;
			case 'edit':
				this.#callbacks.onEdit(message);
				break;
			case 'scroll': {
				const resolve = this.#scrollRequests.get(message.requestId);
				if (resolve) {
					this.#scrollRequests.delete(message.requestId);
					resolve({ x: message.x, y: message.y });
				}
				break;
			}
			default:
				break;
		}
	};
}
