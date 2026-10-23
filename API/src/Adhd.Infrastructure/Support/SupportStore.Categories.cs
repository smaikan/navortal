using System.Globalization;
using Adhd.Application.Support;
using Adhd.Domain.Support;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Support;

public sealed partial class SupportStore
{
    private const int CategoryLimit = 100;
    private const string DailyCategoryName = "Gün Notları";
    private static readonly CompareInfo TurkishCompare = CultureInfo.GetCultureInfo("tr-TR").CompareInfo;
    public async Task<NoteCategoryList> CategoriesAsync(Guid userId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        var state = await db.PlanningStates.AsNoTracking().SingleAsync(x => x.UserId == userId, ct);
        var rows = await db.NoteCategories.AsNoTracking().Where(x => x.UserId == userId).ToArrayAsync(ct);
        var ordered = rows.Where(x => x.RemovedAt == null).OrderBy(x => x.SortOrder).ThenBy(x => x.Id)
            .Concat(rows.Where(x => x.RemovedAt != null).OrderByDescending(x => x.RemovedAt).ThenBy(x => x.Id));
        await tx.CommitAsync(ct); return new(ordered.Select(CategoryView).ToArray(), state.NotesAllViewMode, state.NotesTaskViewMode, state.NotesVersion);
    }
    public async Task<NoteCategoryView> CreateCategoryAsync(Guid userId, NoteCategoryFields fields, CancellationToken ct)
    {
        var name = CategoryName(fields.Name); Color(fields.Color);
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var active = await db.NoteCategories.Where(x => x.UserId == userId && x.RemovedAt == null).ToListAsync(ct);
        if (active.Count >= CategoryLimit) throw Invalid("note_category_limit", $"En çok {CategoryLimit} etkin kategori olabilir.");
        Unique(active, name, null);
        var now = clock.GetUtcNow(); var row = new NoteCategory { Id = Guid.CreateVersion7(), UserId = userId, Name = name, Color = fields.Color, ShowInBar = fields.ShowInBar, PinInAll = fields.PinInAll,
            SortOrder = (active.Count == 0 ? 0 : active.Max(x => x.SortOrder)) + 1024, CreatedAt = now, UpdatedAt = now };
        db.NoteCategories.Add(row); state.NotesVersion++; await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return CategoryView(row);
    }
    public async Task<NoteCategoryView> ChangeCategoryAsync(Guid userId, Guid id, NoteCategoryChange change, CancellationToken ct)
    {
        var name = CategoryName(change.Name); Color(change.Color); if (!Enum.IsDefined(change.ViewMode)) throw Invalid("note_view_mode_invalid", "Görünüm geçersiz.");
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct); var row = await Category(userId, id, ct); Check(row.Version, change.Version);
        if (row.RemovedAt is not null) throw Conflict("note_category_removed", "Kategori kaldırılmış; önce geri getirin.");
        Unique(await db.NoteCategories.Where(x => x.UserId == userId && x.RemovedAt == null).ToListAsync(ct), name, id);
        row.Name = name; row.Color = change.Color; row.ShowInBar = change.ShowInBar; row.PinInAll = change.PinInAll; row.ViewMode = change.ViewMode;
        return await SaveCategory(row, state, ct, tx);
    }
    public async Task<NoteCategoryView> MoveCategoryAsync(Guid userId, Guid id, NoteCategoryMove move, CancellationToken ct)
    {
        if (move.BeforeCategoryId == id) throw Invalid("note_category_move_invalid", "Kategori kendi önüne taşınamaz.");
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct); var row = await Category(userId, id, ct); Check(row.Version, move.Version);
        if (row.RemovedAt is not null) throw Conflict("note_category_removed", "Kategori kaldırılmış; önce geri getirin.");
        var others = await db.NoteCategories.Where(x => x.UserId == userId && x.RemovedAt == null && x.Id != id).OrderBy(x => x.SortOrder).ThenBy(x => x.Id).ToListAsync(ct);
        if (move.BeforeCategoryId is { } beforeId)
        {
            var index = others.FindIndex(x => x.Id == beforeId); if (index < 0) throw Missing("note_category_not_found");
            var previous = index == 0 ? others[0].SortOrder - 2048 : others[index - 1].SortOrder; var order = decimal.Round((previous + others[index].SortOrder) / 2, 10, MidpointRounding.ToZero);
            if (order <= previous || order >= others[index].SortOrder)
            {
                for (var i = 0; i < others.Count; i++) others[i].SortOrder = (i + (i >= index ? 2 : 1)) * 1024m;
                order = (index + 1) * 1024m;
            }
            row.SortOrder = order;
        }
        else row.SortOrder = (others.Count == 0 ? 0 : others[^1].SortOrder) + 1024;
        return await SaveCategory(row, state, ct, tx);
    }
    public async Task<NoteCategoryView> RemoveCategoryAsync(Guid userId, Guid id, long version, bool restore, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct); var row = await Category(userId, id, ct); Check(row.Version, version);
        if (restore)
        {
            if (row.RemovedAt is null) throw Conflict("note_category_not_removed", "Kategori zaten etkin; güncel listeyi alın.");
            var active = await db.NoteCategories.Where(x => x.UserId == userId && x.RemovedAt == null).ToListAsync(ct);
            if (active.Count >= CategoryLimit) throw Invalid("note_category_limit", $"En çok {CategoryLimit} etkin kategori olabilir.");
            Unique(active, row.Name, id); row.RemovedAt = null; row.SortOrder = (active.Count == 0 ? 0 : active.Max(x => x.SortOrder)) + 1024;
        }
        else
        {
            if (row.RemovedAt is not null) throw Conflict("note_category_removed", "Kategori zaten kaldırılmış; güncel listeyi alın.");
            row.RemovedAt = clock.GetUtcNow();
        }
        return await SaveCategory(row, state, ct, tx);
    }
    public async Task<NoteSystemViews> SystemViewsAsync(Guid userId, NoteSystemViews views, CancellationToken ct)
    {
        if (!Enum.IsDefined(views.AllViewMode) || !Enum.IsDefined(views.TaskViewMode)) throw Invalid("note_view_mode_invalid", "Görünüm geçersiz.");
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        if (state.NotesAllViewMode != views.AllViewMode || state.NotesTaskViewMode != views.TaskViewMode)
        {
            state.NotesAllViewMode = views.AllViewMode; state.NotesTaskViewMode = views.TaskViewMode; state.NotesVersion++; await db.SaveChangesAsync(ct);
        }
        await tx.CommitAsync(ct); return new(state.NotesAllViewMode, state.NotesTaskViewMode);
    }
    private async Task<NoteCategoryView> SaveCategory(NoteCategory row, Adhd.Domain.Users.UserPlanningState state, CancellationToken ct, Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction tx)
    {
        row.Version++; row.UpdatedAt = clock.GetUtcNow(); state.NotesVersion++; await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return CategoryView(row);
    }
    // Yeni veya değişen not yalnız hesabın aktif kategorisine bağlanabilir.
    private async Task ActiveCategory(Guid userId, Guid id, CancellationToken ct)
    {
        var row = await db.NoteCategories.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.Id == id, ct) ?? throw Missing("note_category_not_found");
        if (row.RemovedAt is not null) throw Conflict("note_category_removed", "Kategori kaldırılmış; başka bir kategori seçin.");
    }
    private async Task<NoteCategory> Category(Guid userId, Guid id, CancellationToken ct) =>
        await db.NoteCategories.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == id, ct) ?? throw Missing("note_category_not_found");
    // Hesap kilidi tutulurken çağır. Kategoriyle not birlikte kaydolur.
    private async Task<Guid> DailyCategoryId(Guid userId, CancellationToken ct)
    {
        var active = await db.NoteCategories.AsNoTracking().Where(x => x.UserId == userId && x.RemovedAt == null)
            .OrderBy(x => x.SortOrder).ThenBy(x => x.Id).ToArrayAsync(ct);
        var existing = active.FirstOrDefault(x => TurkishCompare.Compare(x.Name, DailyCategoryName, CompareOptions.IgnoreCase) == 0);
        if (existing is not null) return existing.Id;
        var now = clock.GetUtcNow();
        var category = new NoteCategory
        {
            Id = Guid.CreateVersion7(), UserId = userId, Name = DailyCategoryName, Color = NoteCategoryColor.Blue,
            SortOrder = (active.LastOrDefault()?.SortOrder ?? 0) + 1024, CreatedAt = now, UpdatedAt = now
        };
        db.NoteCategories.Add(category);
        return category.Id;
    }
    private static void Unique(IEnumerable<NoteCategory> active, string name, Guid? except)
    {
        if (active.Any(x => x.Id != except && TurkishCompare.Compare(x.Name, name, CompareOptions.IgnoreCase) == 0))
            throw Conflict("note_category_name_taken", "Bu adla etkin bir kategori var.");
    }
    private static string CategoryName(string? value) => !string.IsNullOrWhiteSpace(value) && value.Trim().Length <= 40 ? value.Trim() : throw Invalid("note_category_name_invalid", "Kategori adı 1–40 karakter olmalı.");
    private static void Color(NoteCategoryColor color) { if (!Enum.IsDefined(color)) throw Invalid("note_category_color_invalid", "Kategori rengi geçersiz."); }
    private static NoteCategoryView CategoryView(NoteCategory x) => new(x.Id, x.Name, x.Color, x.ShowInBar, x.PinInAll, x.ViewMode, x.CreatedAt, x.UpdatedAt, x.RemovedAt, x.Version);
}
