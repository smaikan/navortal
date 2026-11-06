// UI_E2E_PROFILE=true derlemesinde React zamanlama izleri ve kaynağa eşlenen V8 örnekleri.
// Yalnız kod yeri, bileşen/fonksiyon adı ve süre çıkarılır. Props, sorgulu URL veya veri çıkmaz.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SourceMapConsumer } from "source-map-js";

const safe = name => (/^[A-Za-z0-9_$ .()/:<>⚛@[\]-]{1,120}$/u.test(name) ? name : "other");
const round = value => Math.round(value * 10) / 10;

export function summarizeReactTracks(events) {
  const entries = events
    .filter(e => e.name === "TimeStamp" && typeof e.args?.data?.track === "string")
    .map(e => ({
      track: safe(e.args.data.track),
      name: safe(String(e.args.data.message ?? e.args.data.name ?? "")),
      start: Number(e.args.data.start),
      end: Number(e.args.data.end),
    }))
    .filter(e => Number.isFinite(e.start) && Number.isFinite(e.end) && e.end >= e.start);
  if (!entries.length) return { available: false };
  // Chrome aralığı mikrosaniyelik iz saatinde saklar. performance.now değeri çok daha küçük olurdu.
  const scale = entries[0].start > 1e8 ? 1 / 1000 : 1;
  const origin = Math.min(...entries.map(e => e.start));
  return {
    available: true,
    phases: entries
      .filter(e => (e.end - e.start) * scale >= 1)
      .sort((a, b) => a.start - b.start)
      .slice(0, 120)
      .map(e => ({
        track: e.track,
        name: e.name,
        atMs: round((e.start - origin) * scale),
        durationMs: round((e.end - e.start) * scale),
      })),
  };
}

/** Yalnız renderer uzun işlerinde kaynak fonksiyonun kendi ve kapsadığı CPU süresi. */
export function summarizeCpu(events, { buildDir, longTasks, threads, origin }) {
  const profiles = new Map();
  for (const e of events) {
    if (e.name === "Profile" && e.args?.data?.startTime !== undefined && threads.has(`${e.pid}:${e.tid}`))
      profiles.set(e.id, { pid: e.pid, tid: e.tid, time: Number(e.args.data.startTime), nodes: new Map(), samples: [] });
    if (e.name !== "ProfileChunk") continue;
    const profile = profiles.get(e.id);
    const chunk = e.args?.data?.cpuProfile;
    if (!profile || !chunk) continue;
    for (const node of chunk.nodes ?? []) profile.nodes.set(node.id, node);
    const deltas = e.args.data.timeDeltas ?? [];
    (chunk.samples ?? []).forEach((id, index) => {
      profile.time += Number(deltas[index] ?? 0);
      profile.samples.push({ id, time: profile.time });
    });
  }
  const counts = {
    profiles: events.filter(e => e.name === "Profile").length,
    chunks: events.filter(e => e.name === "ProfileChunk").length,
    rendererProfiles: profiles.size,
  };
  // Tarayıcı iç sayfaları da aynı izde. Bu kaynağın scriptini çalıştıran profili seçiyoruz.
  for (const [id, profile] of profiles)
    if (![...profile.nodes.values()].some(node => node.callFrame?.url?.startsWith(origin))) profiles.delete(id);
  counts.pageProfiles = profiles.size;
  const windows = longTasks.map(task => [task.ts, task.ts + task.dur]);
  const inside = time => windows.some(([from, to]) => time >= from && time <= to);
  const maps = new Map();
  const consumer = url => {
    const file = /\/_next\/(static\/.+\.js)$/.exec(url.split("?")[0])?.[1];
    if (!file) return null;
    if (!maps.has(file)) {
      // Turbopack her eşlemeyi ayrı adlandırır. Parçanın kendi sourceMappingURL yorumunu izliyoruz.
      const chunk = join(buildDir, file);
      const name = existsSync(chunk) ? /\/\/# sourceMappingURL=(\S+)\s*$/.exec(readFileSync(chunk, "utf8"))?.[1] : undefined;
      const path = name && !name.includes("..") ? join(dirname(chunk), name) : "";
      maps.set(file, path && existsSync(path) ? new SourceMapConsumer(JSON.parse(readFileSync(path, "utf8"))) : null);
    }
    return maps.get(file);
  };
  const labels = new Map();
  const label = node => {
    const frame = node.callFrame ?? {};
    const key = `${frame.url}:${frame.lineNumber}:${frame.columnNumber}:${frame.functionName}`;
    if (labels.has(key)) return labels.get(key);
    let text;
    if (!frame.url) text = frame.functionName ? `(${safe(frame.functionName)})` : "(program)";
    else {
      const map = consumer(frame.url);
      const original = map?.originalPositionFor({ line: frame.lineNumber + 1, column: frame.columnNumber });
      if (original?.source) {
        const source = original.source.replace(/^.*?\/(src|node_modules)\//, "$1/").replace(/^turbopack:\/\/\/?(\[project\]\/)?/, "");
        const pkg = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(source)?.[1];
        text = pkg ? `${pkg} ${safe(original.name ?? frame.functionName ?? "")}` : `${safe(source)}:${original.line} ${safe(original.name ?? "")}`;
      } else text = `${safe(frame.url.split("/").pop() ?? "")} ${safe(frame.functionName || "(anonymous)")}`;
    }
    labels.set(key, text);
    return text;
  };
  const self = new Map(),
    inclusive = new Map();
  let total = 0;
  for (const profile of profiles.values()) {
    const ordered = profile.samples;
    for (let index = 0; index < ordered.length; index++) {
      const sample = ordered[index];
      if (!inside(sample.time)) continue;
      const weight = ((ordered[index + 1]?.time ?? sample.time) - sample.time) / 1000;
      if (weight <= 0 || weight > 50) continue;
      total += weight;
      let node = profile.nodes.get(sample.id);
      const top = node ? label(node) : "(unknown)";
      self.set(top, (self.get(top) ?? 0) + weight);
      const seen = new Set();
      while (node) {
        const text = label(node);
        if (!seen.has(text)) {
          seen.add(text);
          inclusive.set(text, (inclusive.get(text) ?? 0) + weight);
        }
        node = node.parent ? profile.nodes.get(node.parent) : undefined;
      }
    }
  }
  const top = (map, count) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([name, ms]) => ({ name, ms: round(ms) }));
  return {
    available: total > 0,
    counts,
    sampledLongTaskMs: round(total),
    bySelf: top(self, 50),
    // Kapsayan süre yalnız kendi kaynaklarımızda. Paket içi işlerde kendi süre özeti kullanılır.
    byInclusive: top(new Map([...inclusive].filter(([name]) => name.startsWith("src/"))), 60),
  };
}
