import { UmbWorkspaceActionBase, type UmbWorkspaceActionArgs } from '@umbraco-cms/backoffice/workspace';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_BLOCK_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/block';
import { UMB_DOCUMENT_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/document';
import { UmbContextConsumer } from '@umbraco-cms/backoffice/context-api';

type BlockWorkspace = typeof UMB_BLOCK_WORKSPACE_CONTEXT.TYPE;

/**
 * Knop "Update & save" in de footer van een block-workspace (naast Update). Bij geneste blocks staan er meerdere
 * block-modals open; zonder deze knop is het "Update", "Update", … en dan "Save" van het document (sluiten zonder
 * Update vraagt "Discard unsaved changes"). Deze knop doet dat in één keer:
 *
 * 1. elk open block, van binnen naar buiten, via `requestSubmit()` (hetzelfde als de knop Update: valideert, schrijft
 *    de waarde naar het ouder-block of het document en sluit het modal);
 * 2. daarna het document via `requestSave()` (hetzelfde als de knop Save). De preview herlaadt daarna vanzelf.
 *
 * Alleen publieke API (bron: block-workspace.context.js `submit`, submittable-workspace-context-base.js
 * `requestSubmit`, content-detail-workspace-base.js `requestSave`, context-consumer.d.ts `skipHost`).
 * Het ouder-block wordt gevonden door vanaf het block-workspace de context omhoog te vragen met `skipHost()`:
 * modals erven de contexten van het element dat ze opende (de Block List in het ouder-block).
 * Faalt de validatie van een block, dan stopt de reeks en blijft dat modal open met de meldingen.
 */
export class UpdateAndSaveWorkspaceAction extends UmbWorkspaceActionBase {
	#block = this.consumeContext(UMB_BLOCK_WORKSPACE_CONTEXT, () => {})
		.asPromise()
		.catch(() => undefined);
	// Het block-workspace heeft dezelfde context-alias ("UmbWorkspaceContext") als het document-workspace; zonder
	// passContextAliasMatches stopt het zoeken bij het block en wordt het document nooit gevonden.
	#document = this.consumeContext(UMB_DOCUMENT_WORKSPACE_CONTEXT, () => {})
		.passContextAliasMatches()
		.asPromise()
		.catch(() => undefined);

	constructor(host: UmbControllerHost, args: UmbWorkspaceActionArgs<never>) {
		super(host, args);
		// Alleen zinvol binnen een document (niet bv. in de block-configuratie van een datatype).
		this.#document.then((document) => (document ? this.enable() : this.disable()));
	}

	override async execute() {
		const document = await this.#document;
		const innermost = await this.#block;
		if (!document || !innermost) return;

		const chain = await blockChain(innermost);
		for (let i = 0; i < chain.length; i++) {
			// Een submit schrijft de waarde naar de Block List van het ouder-block (of het document). Die werkt zijn eigen
			// data asynchroon bij (via de property-editor). Wacht daarop, anders submit/bewaart de volgende stap oude data.
			const parent = chain[i + 1];
			const snapshot = () => JSON.stringify(parent ? parent.content.getData() : document.getData());
			const before = snapshot();
			const changed = chain[i].getHasUnpersistedChanges();
			await chain[i].requestSubmit();
			if (changed) await waitForChange(snapshot, before);
		}
		await document.requestSave();
	}
}

/** Wacht (per frame, maximaal `maxMs`) tot de snapshot verandert. */
async function waitForChange(snapshot: () => string, before: string, maxMs = 2000) {
	const end = performance.now() + maxMs;
	while (snapshot() === before && performance.now() < end) {
		await new Promise((r) => requestAnimationFrame(r));
	}
}

/** Het block en zijn ouder-blocks, van binnen naar buiten. */
async function blockChain(innermost: BlockWorkspace): Promise<BlockWorkspace[]> {
	const chain: BlockWorkspace[] = [];
	for (let block: BlockWorkspace | undefined = innermost; block && !chain.includes(block); block = await parentBlock(block)) {
		chain.push(block);
	}
	return chain;
}

async function parentBlock(block: BlockWorkspace): Promise<BlockWorkspace | undefined> {
	// Losse consumer (geen controller): eerst de promise aanmaken, dan zelf `request()` aanroepen. Zonder antwoord
	// wijst asPromise na één frame af (context-consumer.js), dan is er geen ouder-block.
	const consumer = new UmbContextConsumer(block.getHostElement(), UMB_BLOCK_WORKSPACE_CONTEXT).skipHost();
	const found = consumer.asPromise().catch(() => undefined);
	consumer.request();
	try {
		return await found;
	} finally {
		consumer.destroy();
	}
}

export { UpdateAndSaveWorkspaceAction as api };
