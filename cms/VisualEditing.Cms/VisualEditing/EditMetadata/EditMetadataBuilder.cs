using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Models.Blocks;
using Umbraco.Cms.Core.Models.PublishedContent;
using Umbraco.Cms.Core.Services;
using Umbraco.Extensions;

namespace VisualEditing.Cms.VisualEditing.EditMetadata;

/// <summary>
/// Berekent de edit-metadata van een document uit het (preview-)<see cref="IPublishedContent"/>.
/// Labels en tabs komen uit het documenttype (<see cref="IContentTypeService"/>, gecachet door Umbraco).
/// Blocks: Block List, ook genest (een Block List-property van een block). Alle blocks staan plat in één dictionary;
/// <c>parentBlockKey</c> en <c>path</c> geven de plek in de boom. Block Grid-layouts zijn buiten scope.
/// </summary>
public sealed class EditMetadataBuilder
{
    private readonly IContentTypeService _contentTypeService;
    private readonly IVariationContextAccessor _variationContextAccessor;

    public EditMetadataBuilder(IContentTypeService contentTypeService, IVariationContextAccessor variationContextAccessor)
    {
        _contentTypeService = contentTypeService;
        _variationContextAccessor = variationContextAccessor;
    }

    public EditMetadataModel Build(IPublishedContent content)
    {
        IContentType? contentType = _contentTypeService.Get(content.ContentType.Key);
        string? culture = content.ContentType.VariesByCulture() ? _variationContextAccessor.VariationContext?.Culture : null;

        var properties = new Dictionary<string, EditPropertyMetadata>();
        var blocks = new Dictionary<string, EditBlockMetadata>();

        foreach (IPublishedProperty property in content.Properties)
        {
            properties[property.Alias] = Describe(contentType, property.PropertyType);
            AddBlocks(property, culture, parent: null, pathPrefix: string.Empty, blocks);
        }

        return new EditMetadataModel(
            Version: 1,
            EntityType: "document",
            DocumentKey: content.Key,
            DocumentType: content.ContentType.Alias,
            Culture: culture,
            Properties: properties,
            Blocks: blocks);
    }

    /// <summary>Voegt de blocks van een Block List-property toe, en daarna (diepte eerst) hun geneste blocks.</summary>
    private void AddBlocks(IPublishedProperty property, string? culture, Guid? parent, string pathPrefix, Dictionary<string, EditBlockMetadata> blocks)
    {
        if (property.GetValue(culture) is not BlockListModel blockList)
        {
            return;
        }

        var index = 0;
        foreach (BlockListItem item in blockList)
        {
            IContentType? elementType = _contentTypeService.Get(item.Content.ContentType.Key);
            var path = $"{pathPrefix}{property.Alias}[{index}]";
            blocks[item.ContentKey.ToString()] = new EditBlockMetadata(
                BlockKey: item.ContentKey,
                SettingsKey: item.Settings is null ? null : item.SettingsKey,
                ElementType: item.Content.ContentType.Alias,
                PropertyAlias: property.Alias,
                ParentBlockKey: parent,
                Path: path,
                Index: index,
                Properties: item.Content.Properties.ToDictionary(p => p.Alias, p => Describe(elementType, p.PropertyType)));

            foreach (IPublishedProperty nested in item.Content.Properties)
            {
                AddBlocks(nested, culture, item.ContentKey, $"{path}.", blocks);
            }

            index++;
        }
    }

    private static EditPropertyMetadata Describe(IContentTypeComposition? type, IPublishedPropertyType propertyType)
    {
        IPropertyType? definition = type?.CompositionPropertyTypes.FirstOrDefault(p => p.Alias == propertyType.Alias);
        return new EditPropertyMetadata(
            Alias: propertyType.Alias,
            Label: definition?.Name ?? propertyType.Alias,
            EditorAlias: propertyType.EditorAlias,
            Tab: type is null || definition is null ? null : TabOf(type, definition));
    }

    /// <summary>
    /// Naam van de tab waarin de property staat. Een groep kan direct een tab zijn, of een groep binnen een tab
    /// (alias "tab/groep"). Properties buiten tabs geven <c>null</c> (in de backoffice: de route "root").
    /// </summary>
    private static string? TabOf(IContentTypeComposition type, IPropertyType definition)
    {
        PropertyGroup[] groups = type.CompositionPropertyGroups.ToArray();
        PropertyGroup? group = groups.FirstOrDefault(g => g.PropertyTypes?.Any(p => p.Alias == definition.Alias) == true);
        if (group is null)
        {
            return null;
        }

        if (group.Type == PropertyGroupType.Tab)
        {
            return group.Name;
        }

        var slash = group.Alias.IndexOf('/');
        if (slash < 0)
        {
            return null;
        }

        var tabAlias = group.Alias[..slash];
        return groups.FirstOrDefault(g => g.Type == PropertyGroupType.Tab && g.Alias == tabAlias)?.Name;
    }
}
