namespace Adhd.Application.Common;

public enum ErrorKind { Validation, NotFound, Conflict, Unauthenticated, Unavailable }

public sealed class UseCaseException(ErrorKind kind, string code, string message) : Exception(message)
{
    public ErrorKind Kind { get; } = kind;
    public string Code { get; } = code;
}
