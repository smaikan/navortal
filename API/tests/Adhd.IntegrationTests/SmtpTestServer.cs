using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading.Channels;
using MimeKit;

namespace Adhd.IntegrationTests;

// Yerel gerçek SMTP alıcısıyla dene. Production'daki MailKit göndericisi aynı kalsın.
public sealed class SmtpTestServer : IAsyncDisposable
{
    private readonly TcpListener listener = new(IPAddress.Loopback, 0);
    private readonly CancellationTokenSource stop = new();
    private readonly Channel<MimeMessage> messages = Channel.CreateUnbounded<MimeMessage>();
    private readonly Task runner;
    public int Port => ((IPEndPoint)listener.LocalEndpoint).Port;
    public SmtpTestServer()
    {
        listener.Start();
        runner = RunAsync();
    }
    public bool HasMessage => messages.Reader.TryPeek(out _);
    public async Task<MimeMessage> ReceiveAsync() => await messages.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(10));
    private async Task RunAsync()
    {
        try
        {
            while (!stop.IsCancellationRequested)
            {
                using var client = await listener.AcceptTcpClientAsync(stop.Token);
                await using var stream = client.GetStream();
                using var reader = new StreamReader(stream, Encoding.ASCII, leaveOpen: true);
                await using var writer = new StreamWriter(stream, Encoding.ASCII, leaveOpen: true) { NewLine = "\r\n", AutoFlush = true };
                await writer.WriteLineAsync("220 localhost test SMTP");
                while (await reader.ReadLineAsync(stop.Token) is { } line)
                {
                    if (line.StartsWith("DATA", StringComparison.OrdinalIgnoreCase))
                    {
                        await writer.WriteLineAsync("354 end with dot");
                        var body = new StringBuilder();
                        while (await reader.ReadLineAsync(stop.Token) is { } data && data != ".")
                            body.Append(data.StartsWith("..", StringComparison.Ordinal) ? data[1..] : data).Append("\r\n");
                        await using var input = new MemoryStream(Encoding.ASCII.GetBytes(body.ToString()));
                        await messages.Writer.WriteAsync(await MimeMessage.LoadAsync(input, stop.Token), stop.Token);
                        await writer.WriteLineAsync("250 accepted");
                    }
                    else if (line.StartsWith("QUIT", StringComparison.OrdinalIgnoreCase))
                    { await writer.WriteLineAsync("221 bye"); break; }
                    else await writer.WriteLineAsync("250 localhost");
                }
            }
        }
        catch (OperationCanceledException) when (stop.IsCancellationRequested) { }
        catch (SocketException) when (stop.IsCancellationRequested) { }
    }
    public async ValueTask DisposeAsync()
    {
        await stop.CancelAsync(); listener.Stop(); await runner; stop.Dispose();
    }
}
