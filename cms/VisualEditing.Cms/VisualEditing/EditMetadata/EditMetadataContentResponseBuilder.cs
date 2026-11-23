using Umbraco.Cms.Core.DeliveryApi;
using Umbraco.Cms.Core.Models.DeliveryApi;
using Umbraco.Cms.Core.Models.PublishedContent;

namespace VisualEditing.Cms.VisualEditing.EditMetadata;

/// <summary>
/// Decorator op de standaard <see cref="IApiContentResponseBuilder"/>. Het response-object zelf blijft precies zoals
/// Umbraco het bouwt. Alleen in edit-modus wordt er metadata aan gekoppeld (via <see cref="EditMetadataStore"/>), en die
/// schrijft <see cref="EditMetadataJsonOptions"/> bij het serialiseren als <c>editMetadata</c> weg.
/// </summary>
public sealed class EditMetadataContentResponseBuilder : IApiContentResponseBuilder
{
    private readonly IApiContentResponseBuilder _inner;
    private readonly EditModeService _editMode;
    private readonly EditMetadataBuilder _metadataBuilder;
    private readonly EditMetadataStore _store;

    public EditMetadataContentResponseBuilder(
        IApiContentResponseBuilder inner,
        EditModeService editMode,
        EditMetadataBuilder metadataBuilder,
        EditMetadataStore store)
    {
        _inner = inner;
        _editMode = editMode;
        _metadataBuilder = metadataBuilder;
        _store = store;
    }

    public IApiContentResponse? Build(IPublishedContent content)
    {
        IApiContentResponse? response = _inner.Build(content);
        if (response is not null && _editMode.IsEditRequest())
        {
            _store.Attach(response, _metadataBuilder.Build(content));
        }

        return response;
    }
}
