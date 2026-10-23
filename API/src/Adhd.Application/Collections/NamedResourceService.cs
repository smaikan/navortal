using Adhd.Application.Common;
using Adhd.Domain.Collections;
using Adhd.Domain.Tasks;

namespace Adhd.Application.Collections;

public sealed record NamedResourceFields(string Name, string? Description);
public sealed record NamedResourceView(Guid Id, string Name, string? Description, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, DateTimeOffset? ArchivedAt, long Version);
public sealed record NamedResourceSummary(Guid ResourceId, int TaskCount, int CompletedCount, int OpenComponentCount, long KnownEstimatedSeconds, int UnknownEstimateCount);
public sealed record NamedResourcePage(NamedResourceView[] Items, int Offset, int Limit, int Total, NamedResourceSummary[]? Summaries = null);
public sealed record NamedResourceWorkload(Guid ResourceId, WorkloadForestSummary Values);
public interface INamedResourceStore<T> where T : class, INamedResource, new()
{
    Task<NamedResourceView> CreateAsync(Guid userId, NamedResourceFields fields, CancellationToken ct);
    Task<NamedResourceView> GetAsync(Guid userId, Guid id, CancellationToken ct);
    Task<NamedResourcePage> ListAsync(Guid userId, int offset, int limit, string? search, bool includeArchived, bool includeSummary, CancellationToken ct);
    Task<NamedResourceView> UpdateAsync(Guid userId, Guid id, long version, NamedResourceFields? fields, bool archive, CancellationToken ct);
    Task<NamedResourceWorkload> WorkloadAsync(Guid userId, Guid id, CancellationToken ct);
}
public sealed class NamedResourceService<T>(INamedResourceStore<T> store) where T : class, INamedResource, new()
{
    public Task<NamedResourceView> CreateAsync(Guid userId, NamedResourceFields fields, CancellationToken ct) => store.CreateAsync(userId, Validate(fields), ct);
    public Task<NamedResourceView> GetAsync(Guid userId, Guid id, CancellationToken ct) => store.GetAsync(userId, id, ct);
    public Task<NamedResourcePage> ListAsync(Guid userId, int offset, int limit, string? search, bool includeArchived, bool includeSummary, CancellationToken ct)
    {
        if (offset is < 0 or > 100000 || limit is < 1 or > 100 || search?.Length > 200) throw new UseCaseException(ErrorKind.Validation, "resource_query_invalid", "Liste filtreleri geçersiz.");
        return store.ListAsync(userId, offset, limit, search, includeArchived, includeSummary, ct);
    }
    public Task<NamedResourceView> UpdateAsync(Guid userId, Guid id, long version, NamedResourceFields fields, CancellationToken ct) => store.UpdateAsync(userId, id, version, Validate(fields), false, ct);
    public Task<NamedResourceView> ArchiveAsync(Guid userId, Guid id, long version, CancellationToken ct) => store.UpdateAsync(userId, id, version, null, true, ct);
    public Task<NamedResourceWorkload> WorkloadAsync(Guid userId, Guid id, CancellationToken ct) => store.WorkloadAsync(userId, id, ct);
    private static NamedResourceFields Validate(NamedResourceFields fields)
    {
        if (string.IsNullOrWhiteSpace(fields.Name) || fields.Name.Trim().Length > 200 || fields.Description?.Length > 10000)
            throw new UseCaseException(ErrorKind.Validation, "resource_invalid", "Ad veya açıklamayı kontrol edin.");
        return fields with { Name = fields.Name.Trim() };
    }
}
