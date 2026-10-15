namespace Adhd.Application.Common;

// PostgreSQL mikrosaniye saklıyor. Hem DB'ye hem yanıta aynı hassasiyeti ver.
public sealed class UtcTimeProvider(TimeProvider source) : TimeProvider
{
    public override DateTimeOffset GetUtcNow()
    {
        var now = source.GetUtcNow().ToUniversalTime();
        return new DateTimeOffset(now.Ticks - now.Ticks % 10, TimeSpan.Zero);
    }
    public override TimeZoneInfo LocalTimeZone => TimeZoneInfo.Utc;
    public override long GetTimestamp() => source.GetTimestamp();
    public override long TimestampFrequency => source.TimestampFrequency;
    public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period) => source.CreateTimer(callback, state, dueTime, period);
}
