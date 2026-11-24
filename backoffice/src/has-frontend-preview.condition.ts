import { UmbConditionBase } from '@umbraco-cms/backoffice/extension-registry';
import type { UmbConditionConfigBase, UmbConditionControllerArguments, UmbExtensionCondition } from '@umbraco-cms/backoffice/extension-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_DOCUMENT_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/document';
import { DocumentService } from '@umbraco-cms/backoffice/external/backend-api';
import { tryExecute } from '@umbraco-cms/backoffice/resources';

export const HAS_FRONTEND_PREVIEW_CONDITION_ALIAS = 'VisualEditing.Condition.HasFrontendPreview';

/**
 * Alleen waar als het document een frontend-preview heeft, volgens dezelfde URL-provider als de view zelf
 * ("VisualEditing"; documenttypes uit `VisualEditing:DocumentTypes` in de CMS-config). Zo verschijnt de weergave
 * Visual editing, die vooraan staat en dus standaard opent, alleen bij documenten waar hij iets kan tonen
 * (DECISIONS.md D22). Een nieuw, nog niet opgeslagen document heeft nog geen preview-URL.
 *
 * Bron: core/extension-registry/conditions/switch.condition.js (UmbConditionBase, `permitted`).
 */
export class HasFrontendPreviewCondition extends UmbConditionBase<UmbConditionConfigBase> implements UmbExtensionCondition {
	#checked?: string;

	constructor(host: UmbControllerHost, args: UmbConditionControllerArguments<UmbConditionConfigBase>) {
		super(host, args);
		this.consumeContext(UMB_DOCUMENT_WORKSPACE_CONTEXT, (workspace) => {
			this.observe(workspace?.unique, (unique) => this.#check(unique ?? null), '_observeUnique');
		});
	}

	async #check(unique: string | null) {
		if (!unique) {
			this.permitted = false;
			return;
		}
		if (unique === this.#checked) return;
		this.#checked = unique;
		const { data } = await tryExecute(
			this,
			DocumentService.getDocumentByIdPreviewUrl({ path: { id: unique }, query: { providerAlias: 'VisualEditing' } }),
			{ disableNotifications: true },
		);
		if (unique !== this.#checked) return;
		this.permitted = !!data?.url;
	}
}

export { HasFrontendPreviewCondition as api };
