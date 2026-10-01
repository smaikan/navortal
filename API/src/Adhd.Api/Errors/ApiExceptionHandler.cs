using System.Diagnostics;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Adhd.Application.Common;

namespace Adhd.Api.Errors;

public sealed class ApiExceptionHandler(ILogger<ApiExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken cancellationToken)
    {
        var known = exception as UseCaseException;
        var status = known?.Kind switch
        { ErrorKind.Validation => 400, ErrorKind.NotFound => 404, ErrorKind.Conflict => 409, ErrorKind.Unauthenticated => 401, ErrorKind.Unavailable => 503, _ => 500 };
        if (known is null) logger.LogError("Unhandled {ExceptionType}; trace {TraceId}", exception.GetType().Name, context.TraceIdentifier);
        context.Response.StatusCode = status;
        await Results.Problem(statusCode: status, title: known?.Message ?? "İşlem tamamlanamadı.", extensions: new Dictionary<string, object?>
        {
            ["code"] = known?.Code ?? "internal_error", ["traceId"] = Activity.Current?.Id ?? context.TraceIdentifier
        }).ExecuteAsync(context);
        return true;
    }
}
