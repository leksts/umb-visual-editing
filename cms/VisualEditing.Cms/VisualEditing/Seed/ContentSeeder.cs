using System.Text.Json;
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
            _logger.LogInformation("Visual Editing seed: content bestaat al, overslaan.");
            return;
        }

        _logger.LogInformation("Visual Editing seed: documenttypes en content aanmaken.");

        IDataType textBox = await FirstByEditor(Constants.PropertyEditors.Aliases.TextBox);
        IDataType textArea = await FirstByEditor(Constants.PropertyEditors.Aliases.TextArea);
        IDataType imagePicker = await GetImagePicker();

        IContentType textBlock = await EnsureElementType(SeedKeys.TextBlockType, "textBlock", "Tekstblok", "icon-text", ("heading", "Kop", textBox), ("text", "Tekst", textArea));
        IContentType quoteBlock = await EnsureElementType(SeedKeys.QuoteBlockType, "quoteBlock", "Citaat", "icon-quote", ("quote", "Citaat", textArea), ("author", "Auteur", textBox));
        IDataType blockList = await EnsureBlockList(textBlock, quoteBlock);

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
            Text("Wat dit oplevert", Lorem(4)));

        CreateArticle(homeDoc, SeedKeys.ArticleB, 2, "Componenten als contract", "Componenten als contract",
            "Elke Vue-component rendert zijn eigen data-attributen, alleen in edit-modus.", media[1],
            Text("Expliciet boven impliciet", Lorem(3)),
            Quote("Geen onzichtbare tekens in je strings.", "Bas Bouwer"));

        // Artikel C krijgt na publicatie een niet-gepubliceerde titelwijziging, voor de preview-test.
        CreateArticle(homeDoc, SeedKeys.ArticleC, 3, "Preview zonder cookies", "Preview zonder cookies (concept)",
            "Een token in de URL in plaats van een third-party cookie.", media[2],
            Text("Tokens met een vervaltijd", Lorem(3)),
            Quote("Een iframe is een andere site dan je denkt.", "Cora Cookie"));

        _logger.LogInformation("Visual Editing seed: klaar.");
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

    /// <summary>Block List-waarde in het v15+-formaat: layout, contentData, settingsData en expose.</summary>
    private static string BlockListValue(int article, Dictionary<string, object?>[] blocks)
    {
        var layout = new List<object>();
        var contentData = new List<object>();
        var expose = new List<object>();
        for (var i = 0; i < blocks.Length; i++)
        {
            Guid key = SeedKeys.Block(article, i);
            layout.Add(new { contentKey = key });
            contentData.Add(new
            {
                contentTypeKey = (Guid)blocks[i]["$type"]!,
                key,
                values = blocks[i].Where(kv => kv.Key != "$type").Select(kv => new { alias = kv.Key, value = kv.Value, culture = (string?)null, segment = (string?)null }).ToArray(),
            });
            expose.Add(new { contentKey = key, culture = (string?)null, segment = (string?)null });
        }

        return JsonSerializer.Serialize(new Dictionary<string, object>
        {
            ["layout"] = new Dictionary<string, object> { [Constants.PropertyEditors.Aliases.BlockList] = layout },
            ["contentData"] = contentData,
            ["settingsData"] = Array.Empty<object>(),
            ["expose"] = expose,
        });
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

    private async Task<IDataType> EnsureBlockList(IContentType textBlock, IContentType quoteBlock)
    {
        if (await _dataTypeService.GetAsync(SeedKeys.BlockListDataType) is { } existing)
        {
            return existing;
        }

        IDataEditor editor = _propertyEditors[Constants.PropertyEditors.Aliases.BlockList]
            ?? throw new InvalidOperationException("Block List-editor niet gevonden.");

        var dataType = new DataType(editor, _configSerializer)
        {
            Key = SeedKeys.BlockListDataType,
            Name = "Artikel - Blocks",
            EditorUiAlias = "Umb.PropertyEditorUi.BlockList",
            ConfigurationData = new Dictionary<string, object>
            {
                ["blocks"] = new object[]
                {
                    new Dictionary<string, object> { ["contentElementTypeKey"] = textBlock.Key, ["label"] = "Tekstblok: {umbValue: heading}" },
                    new Dictionary<string, object> { ["contentElementTypeKey"] = quoteBlock.Key, ["label"] = "Citaat: {umbValue: author}" },
                },
            },
        };

        Attempt<IDataType, DataTypeOperationStatus> result = await _dataTypeService.CreateAsync(dataType, UserKey);
        if (!result.Success)
        {
            throw new InvalidOperationException($"Block List aanmaken mislukt: {result.Status}");
        }

        return result.Result!;
    }

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
