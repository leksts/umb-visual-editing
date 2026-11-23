using System.Runtime.CompilerServices;
using Umbraco.Cms.Core.Models.DeliveryApi;

namespace VisualEditing.Cms.VisualEditing.EditMetadata;

/// <summary>
/// Koppelt metadata aan een response-instantie zonder die instantie (of het type) te veranderen.
/// Een <see cref="ConditionalWeakTable{TKey,TValue}"/> houdt de instantie niet in leven: de metadata verdwijnt samen met
/// de response. Alleen <see cref="IApiContentResponse"/>-instanties die per request nieuw worden gebouwd, komen hier
/// terecht (DECISIONS.md D4), dus metadata kan niet in een ander request opduiken.
/// </summary>
public sealed class EditMetadataStore
{
    private readonly ConditionalWeakTable<IApiContentResponse, EditMetadataModel> _table = new();

    public void Attach(IApiContentResponse response, EditMetadataModel metadata) => _table.AddOrUpdate(response, metadata);

    public EditMetadataModel? Get(object response) =>
        response is IApiContentResponse r && _table.TryGetValue(r, out EditMetadataModel? metadata) ? metadata : null;
}
