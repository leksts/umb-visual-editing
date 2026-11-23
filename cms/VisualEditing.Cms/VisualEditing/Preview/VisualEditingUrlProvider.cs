using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Models.PublishedContent;
using Umbraco.Cms.Core.Routing;

namespace VisualEditing.Cms.VisualEditing.Preview;

/// <summary>
/// "Additional preview environment" (v18-docs: reference/content-delivery-api/additional-preview-environments-support).
/// Levert de frontend-preview-URL met een kortlevend HMAC-token (DECISIONS.md D6). Twee varianten:
/// <list type="bullet">
/// <item><see cref="VisualEditingUrlProvider"/> (alias <c>VisualEditing</c>): met edit-modus, voor het iframe in de workspace-view.</item>
/// <item><see cref="FrontendPreviewUrlProvider"/> (alias <c>FrontendPreview</c>): zonder edit-modus, voor de knop "Save and preview".</item>
/// </list>
/// </summary>
public abstract class FrontendPreviewUrlProviderBase : IUrlProvider
{
    private readonly IOptions<VisualEditingOptions> _options;
    private readonly TimeProvider _timeProvider;

    protected FrontendPreviewUrlProviderBase(IOptions<VisualEditingOptions> options, TimeProvider timeProvider)
    {
        _options = options;
        _timeProvider = timeProvider;
    }

    public abstract string Alias { get; }

    protected abstract bool EditMode { get; }

    // Deze providers doen alleen preview; gepubliceerde URL's laten we aan de standaardproviders.
    public UrlInfo? GetUrl(IPublishedContent content, UrlMode mode, string? culture, Uri current) => null;

    public IEnumerable<UrlInfo> GetOtherUrls(int id, Uri current) => [];

    public Task<UrlInfo?> GetPreviewUrlAsync(IContent content, string? culture, string? segment)
    {
        VisualEditingOptions options = _options.Value;
        if (!options.DocumentTypes.Contains(content.ContentType.Alias, StringComparer.OrdinalIgnoreCase))
        {
            return Task.FromResult<UrlInfo?>(UrlInfo.AsMessage(
                $"Geen frontend-preview voor documenttype '{content.ContentType.Alias}'.", Alias, culture));
        }

        var expires = _timeProvider.GetUtcNow().AddMinutes(options.TokenLifetimeMinutes).ToUnixTimeSeconds();
        var query = new List<string> { $"preview={Uri.EscapeDataString(CreateToken(expires, options.PreviewSecret))}" };
        if (EditMode)
        {
            query.Add("ve=1");
        }

        if (!string.IsNullOrEmpty(culture))
        {
            query.Add($"culture={Uri.EscapeDataString(culture)}");
        }

        var url = new Uri($"{options.FrontendUrl.TrimEnd('/')}/preview/{content.Key}?{string.Join('&', query)}");
        return Task.FromResult<UrlInfo?>(UrlInfo.FromUri(url, Alias, culture, isExternal: true));
    }

    /// <summary>Token "&lt;exp&gt;.&lt;base64url(HMAC-SHA256(secret, exp))&gt;"; zelfde formaat als web/src/lib/preview.ts.</summary>
    public static string CreateToken(long expiresUnixSeconds, string secret)
    {
        var payload = expiresUnixSeconds.ToString(System.Globalization.CultureInfo.InvariantCulture);
        var mac = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(payload));
        return $"{payload}.{Convert.ToBase64String(mac).TrimEnd('=').Replace('+', '-').Replace('/', '_')}";
    }
}

public sealed class VisualEditingUrlProvider(IOptions<VisualEditingOptions> options, TimeProvider timeProvider)
    : FrontendPreviewUrlProviderBase(options, timeProvider)
{
    public const string ProviderAlias = "VisualEditing";

    public override string Alias => ProviderAlias;

    protected override bool EditMode => true;
}

public sealed class FrontendPreviewUrlProvider(IOptions<VisualEditingOptions> options, TimeProvider timeProvider)
    : FrontendPreviewUrlProviderBase(options, timeProvider)
{
    public const string ProviderAlias = "FrontendPreview";

    public override string Alias => ProviderAlias;

    protected override bool EditMode => false;
}
