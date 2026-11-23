namespace VisualEditing.Cms.VisualEditing.Seed;

/// <summary>
/// Vaste keys voor de seed. Daardoor zijn document- en block-keys na elke herinstallatie gelijk,
/// en kunnen tests en fixtures ernaar verwijzen.
/// </summary>
public static class SeedKeys
{
    public static readonly Guid HomeType = Guid.Parse("5e0d0000-0000-4000-8000-000000000001");
    public static readonly Guid ArticleType = Guid.Parse("5e0d0000-0000-4000-8000-000000000002");
    public static readonly Guid TextBlockType = Guid.Parse("5e0d0000-0000-4000-8000-000000000003");
    public static readonly Guid QuoteBlockType = Guid.Parse("5e0d0000-0000-4000-8000-000000000004");

    public static readonly Guid BlockListDataType = Guid.Parse("5e0d0000-0000-4000-8000-000000000010");

    public static readonly Guid Home = Guid.Parse("5e0d0000-0000-4000-8000-000000000201");
    public static readonly Guid ArticleA = Guid.Parse("5e0d0000-0000-4000-8000-000000000211");
    public static readonly Guid ArticleB = Guid.Parse("5e0d0000-0000-4000-8000-000000000212");
    public static readonly Guid ArticleC = Guid.Parse("5e0d0000-0000-4000-8000-000000000213");

    public static Guid Media(int n) => Guid.Parse($"5e0d0000-0000-4000-8000-00000000010{n}");

    public static Guid Block(int article, int index) => Guid.Parse($"5e0d0000-0000-4000-8000-0000000003{article}{index}");
}
