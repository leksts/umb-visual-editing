using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DeliveryApi;
using VisualEditing.Cms.VisualEditing.EditMetadata;
using VisualEditing.Cms.VisualEditing.Preview;

namespace VisualEditing.Cms.VisualEditing;

/// <summary>
/// Registreert de Visual Editing-extensie. Met <c>VisualEditing:Enabled=false</c> wordt niets geregistreerd en is de
/// Delivery API exact de standaard-Umbraco-API. Dat gebruiken de integratietests als baseline.
/// </summary>
public sealed class VisualEditingComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        IConfigurationSection section = builder.Config.GetSection(VisualEditingOptions.SectionName);
        if (!section.GetValue(nameof(VisualEditingOptions.Enabled), true))
        {
            return;
        }

        builder.Services.Configure<VisualEditingOptions>(section);
        builder.Services.TryAddSingleton(TimeProvider.System);

        // Delivery API: metadata berekenen (decorator) en serialiseren (JSON-modifier).
        builder.Services.AddSingleton<EditModeService>();
        builder.Services.AddSingleton<EditMetadataStore>();
        builder.Services.AddSingleton<EditMetadataBuilder>();
        builder.Services.AddSingleton<IConfigureOptions<JsonOptions>, EditMetadataJsonOptions>();
        Decorate<IApiContentResponseBuilder>(builder.Services, (sp, inner) => new EditMetadataContentResponseBuilder(
            inner,
            sp.GetRequiredService<EditModeService>(),
            sp.GetRequiredService<EditMetadataBuilder>(),
            sp.GetRequiredService<EditMetadataStore>()));

        // Preview-URL's voor de frontend ("additional preview environments").
        builder.UrlProviders().Append<VisualEditingUrlProvider>();
        builder.UrlProviders().Append<FrontendPreviewUrlProvider>();
    }

    /// <summary>Vervangt de bestaande registratie door een decorator met dezelfde lifetime.</summary>
    private static void Decorate<TService>(IServiceCollection services, Func<IServiceProvider, TService, TService> decorate)
        where TService : class
    {
        ServiceDescriptor descriptor = services.LastOrDefault(d => d.ServiceType == typeof(TService))
            ?? throw new InvalidOperationException($"Geen registratie gevonden voor {typeof(TService).Name}.");

        Func<IServiceProvider, TService> createInner = descriptor switch
        {
            { ImplementationInstance: TService instance } => _ => instance,
            { ImplementationFactory: { } factory } => sp => (TService)factory(sp),
            { ImplementationType: { } type } => sp => (TService)ActivatorUtilities.CreateInstance(sp, type),
            _ => throw new InvalidOperationException($"Registratie van {typeof(TService).Name} wordt niet ondersteund."),
        };

        services.Remove(descriptor);
        services.Add(new ServiceDescriptor(typeof(TService), sp => decorate(sp, createInner(sp)), descriptor.Lifetime));
    }
}
