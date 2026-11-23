using Microsoft.Extensions.Options;
using Umbraco.Cms.Core.DeliveryApi;

namespace VisualEditing.Cms.VisualEditing.EditMetadata;

/// <summary>
/// Bepaalt of het huidige Delivery API-request in edit-modus is: preview (header <c>Preview: true</c>),
/// geldige API-key, en de header <c>Visual-Editing: true</c>. Alle drie zijn nodig (DECISIONS.md D3).
/// Het resultaat wordt per request in <see cref="HttpContext.Items"/> gecachet.
/// </summary>
public sealed class EditModeService
{
    private static readonly object CacheKey = new();

    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly IRequestPreviewService _requestPreviewService;
    private readonly IApiAccessService _apiAccessService;
    private readonly IOptions<VisualEditingOptions> _options;

    public EditModeService(
        IHttpContextAccessor httpContextAccessor,
        IRequestPreviewService requestPreviewService,
        IApiAccessService apiAccessService,
        IOptions<VisualEditingOptions> options)
    {
        _httpContextAccessor = httpContextAccessor;
        _requestPreviewService = requestPreviewService;
        _apiAccessService = apiAccessService;
        _options = options;
    }

    public bool IsEditRequest()
    {
        HttpContext? context = _httpContextAccessor.HttpContext;
        if (context is null)
        {
            return false;
        }

        if (context.Items.TryGetValue(CacheKey, out object? cached) && cached is bool value)
        {
            return value;
        }

        var result =
            string.Equals(context.Request.Headers[_options.Value.HeaderName], "true", StringComparison.OrdinalIgnoreCase)
            && _requestPreviewService.IsPreview()
            && _apiAccessService.HasPreviewAccess();

        context.Items[CacheKey] = result;
        return result;
    }
}
