import { css, customElement, html, nothing, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import {
	UMB_DOCUMENT_ENTITY_TYPE,
	UMB_DOCUMENT_WORKSPACE_CONTEXT,
	UMB_EDIT_DOCUMENT_WORKSPACE_PATH_PATTERN,
	type UmbDocumentWorkspaceContext,
} from '@umbraco-cms/backoffice/document';
import { UmbModalRouteRegistrationController } from '@umbraco-cms/backoffice/router';
import { UMB_WORKSPACE_MODAL } from '@umbraco-cms/backoffice/workspace';
import { UMB_PROPERTY_DATASET_CONTEXT } from '@umbraco-cms/backoffice/property';
import { UMB_ACTION_EVENT_CONTEXT, type UmbActionEventContext } from '@umbraco-cms/backoffice/action';
import { UmbEntityUpdatedEvent } from '@umbraco-cms/backoffice/entity-action';
import { DocumentService } from '@umbraco-cms/backoffice/external/backend-api';
import { tryExecute } from '@umbraco-cms/backoffice/resources';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import { createExtensionElement } from '@umbraco-cms/backoffice/extension-api';
import type { UmbWorkspaceViewElement } from '@umbraco-cms/backoffice/workspace';
import type { EditRequestMessage } from '../../shared/protocol';
import { PreviewBridge } from './preview-bridge';
import { focusTarget, modalScope, navigate, tabSegmentFor, type EditTarget } from './navigation';
import { VISUAL_EDITING_VIEW_PATHNAME } from './index';

const URL_PROVIDER_ALIAS = 'VisualEditing';
/** Manifest van de standaard "Content"-view van documenten (kind contentEditor), bron: documents/workspace/manifests.js. */
const CONTENT_VIEW_ALIAS = 'Umb.WorkspaceView.Document.Edit';

/**
 * Workspace-view "Visual editing": links de frontend-preview in een iframe, rechts de standaard content-editor van
 * Umbraco (hetzelfde element als de view "Content"). Klik in de preview → juiste tab en veld rechts; veld in een
 * block → het block wordt geopend en het veld krijgt focus; element van een ander document → dat document opent in
 * een modal, de preview blijft staan. Opslaan → iframe herlaadt met behoud van de scrollpositie.
 */
@customElement('visual-editing-workspace-view')
export class VisualEditingWorkspaceViewElement extends UmbLitElement implements UmbWorkspaceViewElement {
	@state() private _previewUrl?: string;
	@state() private _error?: string;
	@state() private _ready = false;
	@state() private _editor?: HTMLElement;

	#workspace?: UmbDocumentWorkspaceContext;
	#actionEvents?: UmbActionEventContext;
	#unique?: string | null;
	#culture: string | null = null;
	/** Documenten die op de getoonde pagina staan (uit "ready"); opslaan van één ervan herlaadt de preview. */
	#previewDocuments = new Set<string>();
	/** Route naar het workspace-modal (publieke modal-route-API, zoals document-item-ref.element.ts). */
	#documentModalPath?: string;
	#bridge = new PreviewBridge({
		onReady: (documentKeys) => this.#onReady(documentKeys),
		onEdit: (message) => this.#onEdit(message),
	});

	constructor() {
		super();
		this.consumeContext(UMB_DOCUMENT_WORKSPACE_CONTEXT, (workspace) => {
			this.#workspace = workspace;
			this.observe(workspace?.unique, (unique) => this.#setUnique(unique ?? null), '_observeUnique');
		});
		this.consumeContext(UMB_PROPERTY_DATASET_CONTEXT, (dataset) => {
			this.#culture = dataset?.getVariantId().culture ?? null;
		});
		this.consumeContext(UMB_ACTION_EVENT_CONTEXT, (context) => {
			this.#actionEvents?.removeEventListener(UmbEntityUpdatedEvent.TYPE, this.#onEntityUpdated);
			this.#actionEvents = context;
			this.#actionEvents?.addEventListener(UmbEntityUpdatedEvent.TYPE, this.#onEntityUpdated);
		});
		// De standaard content-editor via het geregistreerde manifest van de Content-view (publieke extension-API),
		// zodat dezelfde editor (tabs, validatie, property-editors) naast de preview staat.
		this.observe(umbExtensionsRegistry.byAlias(CONTENT_VIEW_ALIAS), async (manifest) => {
			if (!manifest || this._editor) return;
			this._editor = await createExtensionElement(manifest as never);
		}, '_observeContentView');
		// Een ander document openen in een modal, met dezelfde publieke API als de documentlijst/content picker.
		new UmbModalRouteRegistrationController(this, UMB_WORKSPACE_MODAL)
			.addUniquePaths(['unique'])
			.onSetup(() => ({ data: { entityType: UMB_DOCUMENT_ENTITY_TYPE, preset: {} } }))
			.observeRouteBuilder((routeBuilder) => {
				this.#documentModalPath = routeBuilder({});
			});
	}

	override connectedCallback() {
		super.connectedCallback();
		this.#bridge.connect();
	}

	override disconnectedCallback() {
		super.disconnectedCallback();
		this.#bridge.disconnect();
		this.#actionEvents?.removeEventListener(UmbEntityUpdatedEvent.TYPE, this.#onEntityUpdated);
	}

	async #setUnique(unique: string | null) {
		if (!unique || unique === this.#unique) return;
		this.#unique = unique;
		this._ready = false;
		await this.#loadPreviewUrl();
	}

	/** Preview-URL via de standaard Management API-endpoint en onze URL-provider (DECISIONS.md D5). */
	async #loadPreviewUrl(): Promise<string | undefined> {
		if (!this.#unique) return;
		const { data, error } = await tryExecute(
			this,
			DocumentService.getDocumentByIdPreviewUrl({
				path: { id: this.#unique },
				query: { providerAlias: URL_PROVIDER_ALIAS, culture: this.#culture ?? undefined },
			}),
			{ disableNotifications: true },
		);
		if (error || !data?.url) {
			this._error = data?.message ?? error?.message ?? 'Geen preview-URL beschikbaar voor dit document.';
			this._previewUrl = undefined;
			return;
		}
		this._error = undefined;
		this._previewUrl = data.url;
		return data.url;
	}

	override updated() {
		const iframe = this.renderRoot.querySelector('iframe');
		if (iframe && this._previewUrl) this.#bridge.attach(iframe, this._previewUrl);
	}

	#onReady(documentKeys: string[]) {
		this.#previewDocuments = new Set(documentKeys);
		this._ready = true;
	}

	#onEntityUpdated = (event: Event) => {
		const e = event as UmbEntityUpdatedEvent;
		if (e.getEntityType() !== UMB_DOCUMENT_ENTITY_TYPE) return;
		const unique = e.getUnique();
		if (!unique || (unique !== this.#unique && !this.#previewDocuments.has(unique))) return;
		this.#reloadPreview();
	};

	/** Na opslaan: scrollpositie vragen, nieuwe URL (vers token) laden, positie meegeven in de volgende handshake. */
	async #reloadPreview() {
		const scroll = await this.#bridge.getScroll();
		this.#bridge.setPendingScroll(scroll);
		this._ready = false;
		const url = await this.#loadPreviewUrl();
		if (!url) return;
		const iframe = this.renderRoot.querySelector('iframe');
		if (iframe) {
			const u = new URL(url);
			u.searchParams.set('rnd', String(Date.now()));
			this._previewUrl = u.toString();
		}
	}

	async #onEdit(message: EditRequestMessage) {
		const target: EditTarget = {
			documentKey: message.documentKey,
			culture: message.culture,
			propertyAlias: message.propertyAlias,
			blockKey: message.blockKey,
			blockPropertyAlias: message.blockPropertyAlias,
			blockPath: message.blockPath ?? null,
		};
		this.dispatchEvent(new CustomEvent('visual-editing-edit', { detail: target, bubbles: true, composed: true }));
		if (!target.propertyAlias) return;
		const base = location.pathname.split(`/view/${VISUAL_EDITING_VIEW_PATHNAME}`)[0] + `/view/${VISUAL_EDITING_VIEW_PATHNAME}`;

		if (target.documentKey === this.#unique) {
			// Eigen document: juiste tab in de editor naast de preview (sluit ook een open modal), dan veld focussen.
			const segment = this.#workspace ? await tabSegmentFor(this.#workspace, target.propertyAlias) : null;
			navigate(segment ? `${base}/${segment}` : base);
			await focusTarget(() => this.renderRoot.querySelector('#editor'), target);
			return;
		}

		// Ander document (bv. een artikelkaart op de homepage): open het in een modal; de preview blijft staan.
		if (!this.#documentModalPath) return;
		const modal = `${this.#documentModalPath.replace(/\/?$/, '/')}${UMB_EDIT_DOCUMENT_WORKSPACE_PATH_PATTERN.generateLocal({ unique: target.documentKey })}`;
		navigate(new URL(modal, location.href).pathname);
		await focusTarget(modalScope, target, { tryTabs: true });
	}

	override render() {
		return html`
			<div id="preview" ?data-ready=${this._ready}>
				${this._error
					? html`<uui-box headline="Visual editing"><p>${this._error}</p></uui-box>`
					: this._previewUrl
						? html`<iframe title="Preview" src=${this._previewUrl}></iframe>`
						: html`<uui-loader></uui-loader>`}
			</div>
			<div id="editor">
				${this._editor ?? nothing}
			</div>
		`;
	}

	static override styles = [
		css`
			:host {
				display: grid;
				grid-template-columns: minmax(0, 3fr) minmax(360px, 2fr);
				height: 100%;
				min-height: 0;
			}
			#preview {
				position: relative;
				min-height: 0;
				border-right: 1px solid var(--uui-color-border);
				background: var(--uui-color-surface);
			}
			iframe {
				display: block;
				width: 100%;
				height: 100%;
				border: 0;
			}
			#editor {
				min-height: 0;
				overflow: auto;
			}
			uui-loader {
				margin: var(--uui-size-layout-1);
			}
		`,
	];
}

export default VisualEditingWorkspaceViewElement;

declare global {
	interface HTMLElementTagNameMap {
		'visual-editing-workspace-view': VisualEditingWorkspaceViewElement;
	}
}
