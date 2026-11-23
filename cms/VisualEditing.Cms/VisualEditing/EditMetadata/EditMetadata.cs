namespace VisualEditing.Cms.VisualEditing.EditMetadata;

/// <summary>
/// Edit-metadata per content-item (PLAN.md §3). Staat in de response naast de bestaande velden als <c>editMetadata</c>.
/// Versie 1. Property-aliassen en block-keys zijn dictionary-keys en worden niet door de naming policy aangepast.
/// </summary>
public sealed record EditMetadataModel(
    int Version,
    string EntityType,
    Guid DocumentKey,
    string DocumentType,
    string? Culture,
    IReadOnlyDictionary<string, EditPropertyMetadata> Properties,
    IReadOnlyDictionary<string, EditBlockMetadata> Blocks);

public sealed record EditPropertyMetadata(string Alias, string Label, string EditorAlias, string? Tab);

public sealed record EditBlockMetadata(
    Guid BlockKey,
    Guid? SettingsKey,
    string ElementType,
    string PropertyAlias,
    string Path,
    int Index,
    IReadOnlyDictionary<string, EditPropertyMetadata> Properties);
