import { UMB_WORKSPACE_CONDITION_ALIAS } from '@umbraco-cms/backoffice/workspace';

export const VISUAL_EDITING_VIEW_PATHNAME = 'visual-editing';

/**
 * Extensies van de Visual Editing-PoC (geladen via het bundle-manifest in umbraco-package.json).
 *
 * - workspaceView (bron: docs 18.latest, extension-types/workspaces/workspace-views; examples/workspace-view-hint):
 *   een eigen weergave in de document-workspace met de preview in een iframe.
 * - workspaceActionMenuItem, kind "previewOption" (bron: docs 18.latest, reference/content-delivery-api/
 *   additional-preview-environments-support): de frontend-preview in een nieuw venster, via de URL-provider
 *   "FrontendPreview".
 */
export const manifests: Array<UmbExtensionManifest> = [
	{
		type: 'workspaceView',
		alias: 'VisualEditing.WorkspaceView.Document',
		name: 'Visual Editing workspace view',
		element: () => import('./visual-editing-workspace-view.element.js'),
		weight: 150, // tussen "Content" (200) en "Info" (100); Content blijft de standaardweergave
		meta: {
			label: 'Visual editing',
			pathname: VISUAL_EDITING_VIEW_PATHNAME,
			icon: 'icon-display',
		},
		conditions: [{ alias: UMB_WORKSPACE_CONDITION_ALIAS, match: 'Umb.Workspace.Document' }],
	},
	{
		type: 'workspaceActionMenuItem',
		kind: 'previewOption',
		alias: 'VisualEditing.PreviewOption.Frontend',
		name: 'Frontend preview option',
		forWorkspaceActions: 'Umb.WorkspaceAction.Document.SaveAndPreview',
		weight: 90,
		meta: {
			icon: 'icon-display',
			label: 'Frontend (Astro)',
			urlProviderAlias: 'FrontendPreview',
		},
	} as UmbExtensionManifest,
	{
		// Bron: docs 18.latest, extension-types/workspaces/workspace-editor-actions; block/workspace/manifests.js
		// (Umb.WorkspaceAction.Block.SubmitUpdate gebruikt dezelfde workspace-conditie).
		type: 'workspaceAction',
		kind: 'default',
		alias: 'VisualEditing.WorkspaceAction.Block.UpdateAndSave',
		name: 'Visual Editing: update block(s) and save document',
		api: () => import('./update-and-save.action.js'),
		weight: 10,
		meta: {
			label: 'Update & save',
			look: 'secondary',
		},
		conditions: [{ alias: UMB_WORKSPACE_CONDITION_ALIAS, match: 'Umb.Workspace.Block' }],
	},
];
