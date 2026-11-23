using System.Text.Json.Serialization.Metadata;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Umbraco.Cms.Core.Models.DeliveryApi;
using UmbracoConstants = Umbraco.Cms.Core.Constants;

namespace VisualEditing.Cms.VisualEditing.EditMetadata;

/// <summary>
/// Voegt via een System.Text.Json-contract-modifier een property <c>editMetadata</c> toe aan elk type dat
/// <see cref="IApiContentResponse"/> implementeert (ook het interface zelf, zodat het werkt in
/// <c>PagedViewModel&lt;IApiContentResponse&gt;</c> van de query-endpoint).
/// De property wordt alleen geschreven als er metadata gekoppeld is én het request in edit-modus is. In alle andere
/// gevallen wordt hij overgeslagen en is de output bytegelijk aan die van standaard-Umbraco (DECISIONS.md D2).
/// </summary>
public sealed class EditMetadataJsonOptions : IConfigureNamedOptions<JsonOptions>
{
    private const string PropertyName = "editMetadata";

    private readonly EditMetadataStore _store;
    private readonly EditModeService _editMode;

    public EditMetadataJsonOptions(EditMetadataStore store, EditModeService editMode)
    {
        _store = store;
        _editMode = editMode;
    }

    public void Configure(JsonOptions options)
    {
    }

    public void Configure(string? name, JsonOptions options)
    {
        if (name != UmbracoConstants.JsonOptionsNames.DeliveryApi)
        {
            return;
        }

        IJsonTypeInfoResolver resolver = options.JsonSerializerOptions.TypeInfoResolver
            ?? throw new InvalidOperationException("Delivery API JSON-opties hebben geen TypeInfoResolver.");
        options.JsonSerializerOptions.TypeInfoResolver = resolver.WithAddedModifier(AddEditMetadata);
    }

    private void AddEditMetadata(JsonTypeInfo typeInfo)
    {
        if (typeInfo.Kind != JsonTypeInfoKind.Object || !typeof(IApiContentResponse).IsAssignableFrom(typeInfo.Type))
        {
            return;
        }

        if (typeInfo.Properties.Any(p => p.Name == PropertyName))
        {
            return;
        }

        JsonPropertyInfo property = typeInfo.CreateJsonPropertyInfo(typeof(EditMetadataModel), PropertyName);
        property.Get = instance => _editMode.IsEditRequest() ? _store.Get(instance) : null;
        property.ShouldSerialize = (_, value) => value is not null;
        property.Order = 200; // na "cultures" (JsonPropertyOrder 100)
        typeInfo.Properties.Add(property);
    }
}
