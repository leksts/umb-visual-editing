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

/// <param name="PropertyAlias">Block List-property waarin het block staat: op het document, of (genest) op het ouder-block.</param>
/// <param name="ParentBlockKey">Ouder-block bij een genest block; <c>null</c> op het eerste niveau.</param>
/// <param name="Path">Plek in de boom, bv. <c>blocks[5].items[1]</c>.</param>
public sealed record EditBlockMetadata(
    Guid BlockKey,
    Guid? SettingsKey,
    string ElementType,
    string PropertyAlias,
    Guid? ParentBlockKey,
    string Path,
    int Index,
    IReadOnlyDictionary<string, EditPropertyMetadata> Properties);
