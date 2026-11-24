using System.Text.Json;
using System.Text.Json.Nodes;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Cms.Core.Serialization;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Core.Services.OperationStatus;
using Umbraco.Cms.Core.Strings;

namespace VisualEditing.Cms.VisualEditing.Seed;

/// <summary>
/// Maakt bij het opstarten idempotent de documenttypes, de Block List en de demo-content aan.
/// Bestaat een item (op vaste key) al, dan wordt het overgeslagen. Zo is de seed herhaalbaar:
/// database verwijderen en opnieuw starten geeft exact dezelfde keys.
/// </summary>
public sealed class ContentSeeder : INotificationAsyncHandler<UmbracoApplicationStartedNotification>
{
    private static readonly Guid UserKey = Constants.Security.SuperUserKey;

    private readonly IRuntimeState _runtimeState;
    private readonly IContentTypeService _contentTypeService;
    private readonly IDataTypeService _dataTypeService;
    private readonly IContentService _contentService;
    private readonly IMediaService _mediaService;
    private readonly PropertyEditorCollection _propertyEditors;
    private readonly IConfigurationEditorJsonSerializer _configSerializer;
    private readonly IShortStringHelper _shortStringHelper;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<ContentSeeder> _logger;

    public ContentSeeder(
        IRuntimeState runtimeState,
        IContentTypeService contentTypeService,
        IDataTypeService dataTypeService,
        IContentService contentService,
        IMediaService mediaService,
        PropertyEditorCollection propertyEditors,
        IConfigurationEditorJsonSerializer configSerializer,
        IShortStringHelper shortStringHelper,
        IWebHostEnvironment env,
        ILogger<ContentSeeder> logger)
    {
        _runtimeState = runtimeState;
        _contentTypeService = contentTypeService;
        _dataTypeService = dataTypeService;
        _contentService = contentService;
        _mediaService = mediaService;
        _propertyEditors = propertyEditors;
        _configSerializer = configSerializer;
        _shortStringHelper = shortStringHelper;
        _env = env;
        _logger = logger;
    }

    public async Task HandleAsync(UmbracoApplicationStartedNotification notification, CancellationToken cancellationToken)
    {
        if (_runtimeState.Level != RuntimeLevel.Run)
        {
            return;
        }

        if (_contentService.GetById(SeedKeys.Home) is not null)
        {
            if (_contentTypeService.Get(SeedKeys.CalloutBlockType) is null)
            {
                _logger.LogWarning("Visual Editing seed: de database is van een oudere seed (zonder geneste blocks). Stop de site en verwijder umbraco/Data/Umbraco.sqlite.db* om opnieuw te seeden.");
            }

            _logger.LogInformation("Visual Editing seed: content bestaat al.");
            await ApplyUpgradesAsync();
            return;
        }

        _logger.LogInformation("Visual Editing seed: documenttypes en content aanmaken.");

        IDataType textBox = await FirstByEditor(Constants.PropertyEditors.Aliases.TextBox);
        IDataType textArea = await FirstByEditor(Constants.PropertyEditors.Aliases.TextArea);
        IDataType imagePicker = await GetImagePicker();

        IContentType textBlock = await EnsureElementType(SeedKeys.TextBlockType, "textBlock", "Tekstblok", "icon-text", ("heading", "Kop", textBox), ("text", "Tekst", textArea));
        IContentType quoteBlock = await EnsureElementType(SeedKeys.QuoteBlockType, "quoteBlock", "Citaat", "icon-quote", ("quote", "Citaat", textArea), ("author", "Auteur", textBox));
        // Geneste blocks: "Uitgelicht" heeft een eigen Block List (items) met tekstblokken en citaten.
        IDataType nestedBlockList = await EnsureBlockList(SeedKeys.NestedBlockListDataType, "Uitgelicht - Blocks", textBlock, quoteBlock);
        IContentType calloutBlock = await EnsureElementType(SeedKeys.CalloutBlockType, "calloutBlock", "Uitgelicht", "icon-star", ("title", "Titel", textBox), ("items", "Items", nestedBlockList));
        IDataType blockList = await EnsureBlockList(SeedKeys.BlockListDataType, "Artikel - Blocks", textBlock, quoteBlock, calloutBlock);

        IContentType article = await EnsureArticleType(textBox, textArea, imagePicker, blockList);
        IContentType home = await EnsureHomeType(textBox, textArea, article);

        CopyAssets();
        Guid[] media = [CreateImage(1, "Lijnen"), CreateImage(2, "Vormen"), CreateImage(3, "Velden")];

        IContent homeDoc = _contentService.Create("Home", Constants.System.Root, home.Alias);
        homeDoc.Key = SeedKeys.Home;
        homeDoc.SetValue("title", "Visual Editing voor headless Umbraco");
        homeDoc.SetValue("intro", "Een proof of concept: klik op content in de preview en kom uit bij het juiste document en veld in de backoffice.");
        SaveAndPublish(homeDoc);

        CreateArticle(homeDoc, SeedKeys.ArticleA, 1, "Waarom headless?", "Waarom headless?",
            "Headless Umbraco scheidt content van presentatie. Redacteuren willen toch zien wat ze maken.", media[0],
            Text("De Content Delivery API", Lorem(4)),
            Text("Eigen componenten", Lorem(4)),
            Quote("Wie de componenten beheert, beheert ook de edit-metadata.", "Ada de Redacteur"),
            Text("Preview in de backoffice", Lorem(4)),
            Text("Wat dit oplevert", Lorem(4)),
            Callout("Verdieping: blocks in blocks",
                Text("Een block in een block", Lorem(1)),
                Quote("Ook een citaat in een kader is met één klik te bewerken.", "Nina Nest")));

        CreateArticle(homeDoc, SeedKeys.ArticleB, 2, "Componenten als contract", "Componenten als contract",
            "Elke Vue-component rendert zijn eigen data-attributen, alleen in edit-modus.", media[1],
            Text("Expliciet boven impliciet", Lorem(3)),
            Quote("Geen onzichtbare tekens in je strings.", "Bas Bouwer"));

        // Artikel C krijgt na publicatie een niet-gepubliceerde titelwijziging, voor de preview-test.
        CreateArticle(homeDoc, SeedKeys.ArticleC, 3, "Preview zonder cookies", "Preview zonder cookies (concept)",
            "Een token in de URL in plaats van een third-party cookie.", media[2],
            Text("Tokens met een vervaltijd", Lorem(3)),
            Quote("Een iframe is een andere site dan je denkt.", "Cora Cookie"));

        await ApplyUpgradesAsync();
        _logger.LogInformation("Visual Editing seed: klaar.");
    }

    /// <summary>
    /// Latere uitbreidingen van de seed, ook toepasbaar op een bestaande database (zonder eigen content te verliezen):
    /// blocktypes "Veelgestelde vraag" (uitklapblok) en "Wisselkoers" (externe API), toegevoegd aan de Block List en
    /// als blocks 2 en 3 aan artikel B (DECISIONS.md D23). Idempotent op vaste keys.
    /// </summary>
    private async Task ApplyUpgradesAsync()
    {
        if (_contentTypeService.Get(SeedKeys.ExchangeRateBlockType) is not null)
        {
            return;
        }

        _logger.LogInformation("Visual Editing seed: upgrade met uitklapblok en wisselkoers.");
        IDataType textBox = await FirstByEditor(Constants.PropertyEditors.Aliases.TextBox);
        IDataType textArea = await FirstByEditor(Constants.PropertyEditors.Aliases.TextArea);
        IContentType faq = await EnsureElementType(SeedKeys.FaqBlockType, "faqBlock", "Veelgestelde vraag", "icon-help-alt", ("question", "Vraag", textBox), ("answer", "Antwoord", textArea));
        IContentType rate = await EnsureElementType(SeedKeys.ExchangeRateBlockType, "exchangeRateBlock", "Wisselkoers", "icon-coins", ("title", "Titel", textBox), ("currency", "Valuta", textBox));
        await AllowInBlockList(SeedKeys.BlockListDataType, faq, rate);

        IContent? article = _contentService.GetById(SeedKeys.ArticleB);
        if (article?.GetValue<string>("blocks") is not { } json || json.Contains(SeedKeys.Block(2, 2).ToString()))
        {
            return;
        }

        JsonObject value = JsonNode.Parse(json)!.AsObject();
        Dictionary<string, object?>[] extra =
        [
            new() { ["$type"] = SeedKeys.FaqBlockType, ["question"] = "Waarom staat dit antwoord in edit-modus open?", ["answer"] = "Een dichtgeklapt antwoord kun je niet aanklikken. In edit-modus is het uitklapblok daarom altijd open; in preview en live werkt het zoals de bezoeker het ziet." },
            new() { ["$type"] = SeedKeys.ExchangeRateBlockType, ["title"] = "Koers van vandaag", ["currency"] = "USD" },
        ];
        var layout = value["layout"]![Constants.PropertyEditors.Aliases.BlockList]!.AsArray();
        var contentData = value["contentData"]!.AsArray();
        var expose = value["expose"]!.AsArray();
        for (var i = 0; i < extra.Length; i++)
        {
            Guid key = SeedKeys.Block(2, layout.Count);
            JsonObject block = JsonSerializer.SerializeToNode(BlockListObject(_ => key, null, [extra[i]]))!.AsObject();
            layout.Add(block["layout"]![Constants.PropertyEditors.Aliases.BlockList]![0]!.DeepClone());
            contentData.Add(block["contentData"]![0]!.DeepClone());
            expose.Add(block["expose"]![0]!.DeepClone());
        }

        article.SetValue("blocks", value.ToJsonString());
        SaveAndPublish(article);
    }

    /// <summary>Voegt element types toe aan de toegestane blocks van een bestaande Block List.</summary>
    private async Task AllowInBlockList(Guid dataTypeKey, params IContentType[] elementTypes)
    {
        IDataType dataType = await _dataTypeService.GetAsync(dataTypeKey) ?? throw new InvalidOperationException("Block List niet gevonden.");
        JsonArray blocks = JsonSerializer.SerializeToNode(dataType.ConfigurationData.TryGetValue("blocks", out var existing) ? existing : Array.Empty<object>())!.AsArray();
        foreach (IContentType type in elementTypes)
        {
            if (blocks.Any(b => b?["contentElementTypeKey"]?.GetValue<string>() is { } k && Guid.Parse(k) == type.Key))
            {
                continue;
            }

            blocks.Add(new JsonObject
            {
                ["contentElementTypeKey"] = type.Key.ToString(),
                ["label"] = BlockLabels.TryGetValue(type.Alias, out var label) ? label : type.Name ?? type.Alias,
            });
        }

        var configuration = new Dictionary<string, object>(dataType.ConfigurationData)
        {
            ["blocks"] = JsonSerializer.Deserialize<List<Dictionary<string, object>>>(blocks.ToJsonString())!,
        };
        dataType.ConfigurationData = configuration;
        Attempt<IDataType, DataTypeOperationStatus> result = await _dataTypeService.UpdateAsync(dataType, UserKey);
        if (!result.Success)
        {
            throw new InvalidOperationException($"Block List bijwerken mislukt: {result.Status}");
        }
    }

    private void CreateArticle(IContent parent, Guid key, int n, string publishedTitle, string draftTitle, string intro, Guid mediaKey, params Dictionary<string, object?>[] blocks)
    {
        IContent doc = _contentService.Create(publishedTitle, parent, "article");
        doc.Key = key;
        doc.SetValue("title", publishedTitle);
        doc.SetValue("intro", intro);
        doc.SetValue("image", JsonSerializer.Serialize(new[]
        {
            new { key = SeedKeys.Block(n, 9), mediaKey, mediaTypeAlias = "Image", crops = Array.Empty<object>(), focalPoint = (object?)null },
        }));
        doc.SetValue("blocks", BlockListValue(n, blocks));
        SaveAndPublish(doc);

        if (draftTitle != publishedTitle)
        {
            IContent draft = _contentService.GetById(key)!;
            draft.SetValue("title", draftTitle);
            _contentService.Save(draft);
        }
    }

    private void SaveAndPublish(IContent content)
    {
        _contentService.Save(content);
        PublishResult result = _contentService.Publish(content, ["*"]);
        if (!result.Success)
        {
            throw new InvalidOperationException($"Publiceren van '{content.Name}' mislukt: {result.Result}");
        }
    }

    private static Dictionary<string, object?> Text(string heading, string text) =>
        new() { ["$type"] = SeedKeys.TextBlockType, ["heading"] = heading, ["text"] = text };

    private static Dictionary<string, object?> Quote(string quote, string author) =>
        new() { ["$type"] = SeedKeys.QuoteBlockType, ["quote"] = quote, ["author"] = author };

    private static Dictionary<string, object?> Callout(string title, params Dictionary<string, object?>[] items) =>
        new() { ["$type"] = SeedKeys.CalloutBlockType, ["title"] = title, ["items"] = items };

    /// <summary>Block List-waarde in het v15+-formaat: layout, contentData, settingsData en expose.</summary>
    private static string BlockListValue(int article, Dictionary<string, object?>[] blocks) =>
        JsonSerializer.Serialize(BlockListObject(i => SeedKeys.Block(article, i), (parent, i) => SeedKeys.NestedBlock(article, parent, i), blocks));

    /// <summary>
    /// Een geneste Block List (een waarde die zelf een rij blocks is) wordt als object in de waarde van het
    /// ouder-block opgenomen, met keys via <paramref name="nestedKey"/> (één niveau diep in de seed).
    /// </summary>
    private static Dictionary<string, object> BlockListObject(Func<int, Guid> keyOf, Func<int, int, Guid>? nestedKey, Dictionary<string, object?>[] blocks)
    {
        var layout = new List<object>();
        var contentData = new List<object>();
        var expose = new List<object>();
        for (var i = 0; i < blocks.Length; i++)
        {
            Guid key = keyOf(i);
            var parentIndex = i;
            layout.Add(new { contentKey = key });
            contentData.Add(new
            {
                contentTypeKey = (Guid)blocks[i]["$type"]!,
                key,
                values = blocks[i].Where(kv => kv.Key != "$type").Select(kv => new
                {
                    alias = kv.Key,
                    value = kv.Value is Dictionary<string, object?>[] nested && nestedKey is not null
                        ? (object?)BlockListObject(n => nestedKey(parentIndex, n), null, nested)
                        : kv.Value,
                    culture = (string?)null,
                    segment = (string?)null,
                }).ToArray(),
            });
            expose.Add(new { contentKey = key, culture = (string?)null, segment = (string?)null });
        }

        return new Dictionary<string, object>
        {
            ["layout"] = new Dictionary<string, object> { [Constants.PropertyEditors.Aliases.BlockList] = layout },
            ["contentData"] = contentData,
            ["settingsData"] = Array.Empty<object>(),
            ["expose"] = expose,
        };
    }

    private static string Lorem(int sentences)
    {
        string[] pool =
        [
            "Een redacteur wil zien wat de bezoeker ziet, en met één klik bij het juiste veld uitkomen.",
            "De frontend bepaalt zelf welke elementen bewerkbaar zijn, op basis van expliciete metadata.",
            "Gepubliceerde responses blijven exact gelijk: de metadata verschijnt alleen in preview met edit-modus.",
            "Componenten zetten data-attributen op hun root-element of op het element van een veld.",
            "Het edit-script tekent overlays en praat via postMessage met de backoffice.",
            "Na opslaan herlaadt de preview en springt hij terug naar dezelfde scrollpositie.",
        ];
        return string.Join(' ', Enumerable.Range(0, sentences * 2).Select(i => pool[i % pool.Length]));
    }

    private async Task<IDataType> FirstByEditor(string editorAlias) =>
        (await _dataTypeService.GetByEditorAliasAsync(editorAlias)).OrderBy(d => d.Id).First();

    private async Task<IDataType> GetImagePicker()
    {
        IEnumerable<IDataType> pickers = await _dataTypeService.GetByEditorAliasAsync(Constants.PropertyEditors.Aliases.MediaPicker3);
        return pickers.FirstOrDefault(d => d.Name == "Image Media Picker") ?? pickers.OrderBy(d => d.Id).First();
    }

    private async Task<IContentType> EnsureElementType(Guid key, string alias, string name, string icon, params (string Alias, string Name, IDataType DataType)[] props)
    {
        if (_contentTypeService.Get(key) is { } existing)
        {
            return existing;
        }

        var type = new ContentType(_shortStringHelper, Constants.System.Root)
        {
            Key = key, Alias = alias, Name = name, Icon = icon, IsElement = true,
        };
        AddTab(type, "content", "Inhoud", props);
        await Create(type);
        return _contentTypeService.Get(key)!;
    }

    private async Task<IContentType> EnsureArticleType(IDataType textBox, IDataType textArea, IDataType imagePicker, IDataType blockList)
    {
        if (_contentTypeService.Get(SeedKeys.ArticleType) is { } existing)
        {
            return existing;
        }

        var type = new ContentType(_shortStringHelper, Constants.System.Root)
        {
            Key = SeedKeys.ArticleType, Alias = "article", Name = "Artikel", Icon = "icon-newspaper",
        };
        AddTab(type, "content", "Inhoud", ("title", "Titel", textBox), ("intro", "Intro", textArea), ("image", "Afbeelding", imagePicker));
        AddTab(type, "blocks", "Blocks", ("blocks", "Blocks", blockList));
        await Create(type);
        return _contentTypeService.Get(SeedKeys.ArticleType)!;
    }

    private async Task<IContentType> EnsureHomeType(IDataType textBox, IDataType textArea, IContentType article)
    {
        if (_contentTypeService.Get(SeedKeys.HomeType) is { } existing)
        {
            return existing;
        }

        var type = new ContentType(_shortStringHelper, Constants.System.Root)
        {
            Key = SeedKeys.HomeType, Alias = "home", Name = "Home", Icon = "icon-home", AllowedAsRoot = true,
            AllowedContentTypes = [new ContentTypeSort(article.Key, 0, article.Alias)],
        };
        AddTab(type, "content", "Inhoud", ("title", "Titel", textBox), ("intro", "Intro", textArea));
        await Create(type);
        return _contentTypeService.Get(SeedKeys.HomeType)!;
    }

    private void AddTab(ContentType type, string alias, string name, params (string Alias, string Name, IDataType DataType)[] props)
    {
        type.AddPropertyGroup(alias, name);
        type.PropertyGroups[alias]!.Type = PropertyGroupType.Tab;
        foreach ((string propAlias, string propName, IDataType dataType) in props)
        {
            type.AddPropertyType(new PropertyType(_shortStringHelper, dataType, propAlias) { Name = propName }, alias, name);
        }
    }

    private async Task Create(IContentType type)
    {
        Attempt<ContentTypeOperationStatus> result = await _contentTypeService.CreateAsync(type, UserKey);
        if (!result.Success)
        {
            throw new InvalidOperationException($"Documenttype '{type.Alias}' aanmaken mislukt: {result.Result}");
        }
    }

    private async Task<IDataType> EnsureBlockList(Guid key, string name, params IContentType[] elementTypes)
    {
        if (await _dataTypeService.GetAsync(key) is { } existing)
        {
            return existing;
        }

        IDataEditor editor = _propertyEditors[Constants.PropertyEditors.Aliases.BlockList]
            ?? throw new InvalidOperationException("Block List-editor niet gevonden.");

        var dataType = new DataType(editor, _configSerializer)
        {
            Key = key,
            Name = name,
            EditorUiAlias = "Umb.PropertyEditorUi.BlockList",
            ConfigurationData = new Dictionary<string, object>
            {
                ["blocks"] = elementTypes.Select(t => (object)new Dictionary<string, object>
                {
                    ["contentElementTypeKey"] = t.Key,
                    ["label"] = BlockLabels.TryGetValue(t.Alias, out var label) ? label : t.Name ?? t.Alias,
                }).ToArray(),
            },
        };

        Attempt<IDataType, DataTypeOperationStatus> result = await _dataTypeService.CreateAsync(dataType, UserKey);
        if (!result.Success)
        {
            throw new InvalidOperationException($"Block List aanmaken mislukt: {result.Status}");
        }

        return result.Result!;
    }

    private static readonly Dictionary<string, string> BlockLabels = new()
    {
        ["textBlock"] = "Tekstblok: {umbValue: heading}",
        ["quoteBlock"] = "Citaat: {umbValue: author}",
        ["calloutBlock"] = "Uitgelicht: {umbValue: title}",
        ["faqBlock"] = "Vraag: {umbValue: question}",
        ["exchangeRateBlock"] = "Wisselkoers: {umbValue: currency}",
    };

    private void CopyAssets()
    {
        string source = Path.Combine(_env.ContentRootPath, "VisualEditing", "Seed", "Assets");
        string target = Path.Combine(_env.WebRootPath, "media", "seed");
        Directory.CreateDirectory(target);
        foreach (string file in Directory.GetFiles(source, "*.svg"))
        {
            System.IO.File.Copy(file, Path.Combine(target, Path.GetFileName(file)), overwrite: true);
        }
    }

    private Guid CreateImage(int n, string name)
    {
        IMedia media = _mediaService.CreateMedia(name, Constants.System.Root, Constants.Conventions.MediaTypes.Image);
        media.Key = SeedKeys.Media(n);
        media.SetValue(Constants.Conventions.Media.File, JsonSerializer.Serialize(new { src = $"/media/seed/article-{n}.svg", crops = Array.Empty<object>() }));
        media.SetValue(Constants.Conventions.Media.Width, 1200);
        media.SetValue(Constants.Conventions.Media.Height, 600);
        media.SetValue(Constants.Conventions.Media.Extension, "svg");
        _mediaService.Save(media);
        return media.Key;
    }
}
