using System.Data;
using System.Security.Cryptography;
using System.Text.Json;
using Adhd.Application.Common;
using Adhd.Application.Tasks;
using Adhd.Infrastructure.Persistence;
using Microsoft.Extensions.Options;
using Adhd.Infrastructure.Auth;
using System.Text;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Tasks;

public sealed partial class TaskReadStore(PlannerDbContext db, TimeProvider clock, IOptions<JwtSettings> settings) : ITaskReadStore
{
    private sealed record AncestorCursor(Guid Owner, Guid Task, long Version, int Offset);
    private sealed record AncestorReadRow(Guid Id, string Title, Guid? ParentTaskId, long Version, int Depth, bool HasCycle);
    public async Task<TaskAncestorPage> AncestorsAsync(Guid userId, Guid taskId, int limit, string? cursor, CancellationToken ct)
    {
        if (limit is < 1 or > 100 || cursor?.Length > 4096)
            throw new UseCaseException(ErrorKind.Validation,"ancestor_query_invalid","Limit 1–100 olmalı; geçerli üst yol imlecini kullanın.");
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead,ct);
        if (!await db.Tasks.AsNoTracking().AnyAsync(t=>t.UserId==userId && t.Id==taskId && t.DeletedAt==null,ct))
            throw new UseCaseException(ErrorKind.NotFound,"task_not_found","Görev bulunamadı.");
        var version=await db.PlanningStates.AsNoTracking().Where(x=>x.UserId==userId).Select(x=>x.PlanningVersion).SingleAsync(ct);
        var offset=0;
        if (cursor is not null)
        {
            AncestorCursor saved;
            try {saved=ReadCursor(cursor) ?? throw new JsonException();}
            catch(Exception e) when(e is CryptographicException or JsonException or FormatException)
            {throw new UseCaseException(ErrorKind.Validation,"ancestor_cursor_invalid","Üst yol imleci geçersiz; yolu yeniden okuyun.");}
            if(saved.Owner!=userId || saved.Task!=taskId || saved.Offset<0)
                throw new UseCaseException(ErrorKind.Validation,"ancestor_cursor_invalid","Üst yol imleci bu göreve ait değil.");
            if(saved.Version!=version) throw new UseCaseException(ErrorKind.Conflict,"ancestor_cursor_stale","Görev ağacı değişmiş; üst yolu baştan okuyun.");
            offset=saved.Offset;
        }
        var rows=await db.Database.SqlQuery<AncestorReadRow>($"""
            WITH RECURSIVE ancestors AS (
                SELECT t."Id",t."Title",t."ParentTaskId",t."Version",0 AS depth,ARRAY[t."Id"] AS path
                FROM tasks t WHERE t."UserId"={userId} AND t."Id"={taskId} AND t."DeletedAt" IS NULL
                UNION ALL
                SELECT t."Id",t."Title",t."ParentTaskId",t."Version",a.depth+1,a.path||t."Id"
                FROM ancestors a JOIN tasks t ON t."UserId"={userId} AND t."Id"=a."ParentTaskId" AND t."DeletedAt" IS NULL
                WHERE NOT t."Id"=ANY(a.path) AND a.depth<{offset}::bigint+{limit}+1
            ), checked AS (
                SELECT "Id","Title","ParentTaskId","Version",depth AS "Depth",
                    COALESCE(bool_or("ParentTaskId"=ANY(path)) OVER(),false) AS "HasCycle" FROM ancestors
            ) SELECT * FROM checked WHERE "Depth"=0 OR ("Depth">{offset} AND "Depth"<={offset}::bigint+{limit}+1) ORDER BY "Depth"
            """).ToArrayAsync(ct);
        if(rows.Any(x=>x.HasCycle)) throw new UseCaseException(ErrorKind.Conflict,"task_tree_cycle","Görev ağacı döngü içeriyor; üst yol okunamadı.");
        var page=rows.Where(x=>x.Depth>0).ToArray();
        var next=page.Length>limit ? WriteCursor(new AncestorCursor(userId,taskId,version,checked(offset+limit))) : null;
        var result=new TaskAncestorPage(taskId,version,page.Take(limit).Select(x=>new TaskAncestorRow(x.Id,x.Title,x.ParentTaskId,x.Version)).ToArray(),next);
        await tx.CommitAsync(ct);return result;
    }
    private byte[] CursorSignature(string payload) => HMACSHA256.HashData(Encoding.UTF8.GetBytes(settings.Value.SigningKey),Encoding.UTF8.GetBytes("adhd.task-ancestors.v1:"+payload));
    private string WriteCursor(AncestorCursor value) {
        var payload=Convert.ToBase64String(JsonSerializer.SerializeToUtf8Bytes(value)).TrimEnd('=').Replace('+','-').Replace('/','_');
        return payload+"."+Convert.ToHexString(CursorSignature(payload));
    }
    private AncestorCursor? ReadCursor(string value) {
        var parts=value.Split('.');
        if(parts.Length!=2 || !CryptographicOperations.FixedTimeEquals(CursorSignature(parts[0]),Convert.FromHexString(parts[1]))) throw new CryptographicException();
        var payload=parts[0].Replace('-','+').Replace('_','/');payload=payload.PadRight((payload.Length+3)/4*4,'=');
        return JsonSerializer.Deserialize<AncestorCursor>(Convert.FromBase64String(payload));
    }

}
