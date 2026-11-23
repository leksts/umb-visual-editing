using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.Notifications;

namespace VisualEditing.Cms.VisualEditing.Seed;

/// <summary>Registreert de seed. Staat los van de Visual Editing-extensie, zodat de seed ook draait als die uit staat.</summary>
public sealed class SeedComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder) =>
        builder.AddNotificationAsyncHandler<UmbracoApplicationStartedNotification, ContentSeeder>();
}
