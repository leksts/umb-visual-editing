namespace VisualEditing.Cms.VisualEditing;

/// <summary>Configuratie onder <c>VisualEditing</c> in appsettings.</summary>
public sealed class VisualEditingOptions
{
    public const string SectionName = "VisualEditing";

    /// <summary>
    /// Zet de hele extensie aan of uit. Met <c>false</c> registreert de composer niets: de Delivery API is dan exact
    /// de standaard-Umbraco-API. De integratietests gebruiken dit voor de baseline.
    /// </summary>
    public bool Enabled { get; set; } = true;

    /// <summary>
    /// Basis-URL van de frontend (Astro). De backoffice-extensie accepteert alleen postMessage van de origin van de
    /// preview-URL die deze server uitgeeft; daarmee is dit ook de allowlist van de parent.
    /// </summary>
    public string FrontendUrl { get; set; } = "http://localhost:4321";

    /// <summary>Gedeeld geheim met de frontend om preview-tokens te ondertekenen (HMAC-SHA256).</summary>
    public string PreviewSecret { get; set; } = string.Empty;

    public int TokenLifetimeMinutes { get; set; } = 60;

    /// <summary>Documenttypes waarvoor een frontend-preview bestaat ("additional preview environment").</summary>
    public string[] DocumentTypes { get; set; } = [];

    /// <summary>Naam van de request-header die edit-modus aanvraagt (alleen geldig samen met preview + API-key).</summary>
    public string HeaderName { get; set; } = "Visual-Editing";
}
