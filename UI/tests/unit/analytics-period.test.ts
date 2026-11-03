import { describe, expect, it } from "vitest";
import {
  accuracySentence,
  bucketFor,
  bucketLabel,
  leadSentence,
  rangeText,
  readView,
  roughDuration,
  viewUrl,
  weekStart,
} from "../../src/features/analytics/period";
const read = (query: string, today = "2026-10-28", weekStartsOn = 1) =>
  readView(new URLSearchParams(query), today, weekStartsOn);
describe("analysis periods", () => {
  it("defaults to this week up to today and compares with the same days of last week", () => {
    // 28 Ekim 2026 çarşamba.
    const v = read("");
    expect(v).toMatchObject({
      period: "week",
      fromDate: "2026-10-26",
      toDate: "2026-10-28",
      bucket: "Day",
      dimension: "Project",
      previous: { fromDate: "2026-10-19", toDate: "2026-10-21" },
      ongoing: true,
    });
  });
  it("honours the preferred week start, including Sunday and a week starting today", () => {
    expect(weekStart("2026-10-28", 0).toString()).toBe("2026-10-25");
    expect(weekStart("2026-10-28", 3).toString()).toBe("2026-10-28");
    expect(weekStart("2026-10-25", 1).toString()).toBe("2026-10-19");
    expect(read("", "2026-11-01", 1)).toMatchObject({ fromDate: "2026-10-26", ongoing: false });
    expect(read("period=lastWeek", "2026-10-28", 0)).toMatchObject({
      fromDate: "2026-10-18",
      toDate: "2026-10-24",
      previous: { fromDate: "2026-10-11", toDate: "2026-10-17" },
      ongoing: false,
    });
  });
  it("this month compares day by day and clamps the 31st to a shorter previous month", () => {
    expect(read("period=month", "2026-03-31")).toMatchObject({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      previous: { fromDate: "2026-02-01", toDate: "2026-02-28" },
      ongoing: false,
    });
    expect(read("period=month", "2028-03-30").previous).toEqual({ fromDate: "2028-02-01", toDate: "2028-02-29" });
    expect(read("period=month", "2026-10-05")).toMatchObject({ previous: { toDate: "2026-09-05" }, ongoing: true });
  });
  it("last month is a whole calendar month compared with the whole month before, across a year", () => {
    expect(read("period=lastMonth", "2026-01-15")).toMatchObject({
      fromDate: "2025-12-01",
      toDate: "2025-12-31",
      previous: { fromDate: "2025-11-01", toDate: "2025-11-30" },
      bucket: "Day",
    });
  });
  it("custom ranges keep the 366-day limit, pick a server grouping and compare with the equal span before", () => {
    const v = read("period=custom&fromDate=2026-01-14&toDate=2026-01-15&dimension=Task");
    expect(v).toMatchObject({
      bucket: "Day",
      dimension: "Task",
      previous: { fromDate: "2026-01-12", toDate: "2026-01-13" },
    });
    expect(bucketFor({ fromDate: "2026-01-01", toDate: "2026-03-03" })).toBe("Day");
    expect(bucketFor({ fromDate: "2026-01-01", toDate: "2026-03-04" })).toBe("Week");
    expect(bucketFor({ fromDate: "2024-01-01", toDate: "2024-12-31" })).toBe("Month");
    expect(() => read("period=custom&fromDate=2024-01-01&toDate=2025-01-01")).toThrow("1–366");
    expect(read("period=custom&fromDate=0002-01-01&toDate=0002-01-02").previous).toBeNull();
    // Dönemsiz eski bağlantı özel aralık olarak okunur.
    expect(read("fromDate=2026-01-14&toDate=2026-01-15&bucket=Week&offset=25").period).toBe("custom");
  });
  it("rejects unknown or repeated intent and round-trips through the URL", () => {
    expect(() => read("period=yesterday")).toThrow("Geçerli bir dönem");
    expect(() => read("dimension=Tag")).toThrow("Geçerli bir kırılım");
    expect(() => read("period=week&period=month")).toThrow("birden fazla");
    expect(read("suggestionTask=nope")).toEqual(read(""));
    for (const q of ["period=month&dimension=Category", "period=custom&fromDate=2026-01-14&toDate=2026-01-15"]) {
      const v = read(q);
      expect(read(new URL(viewUrl(v), "https://local.test").searchParams.toString())).toEqual(v);
    }
    expect(viewUrl(read(""))).toBe("/analytics?period=week");
  });
});
describe("analysis wording", () => {
  it("rounds to minutes without inventing zero", () => {
    expect(roughDuration(0)).toBe("0 dk");
    expect(roughDuration("0.4")).toBe("1 dk’dan az");
    expect(roughDuration(3599)).toBe("1 sa");
    expect(roughDuration("51600.9")).toBe("14 sa 20 dk");
  });
  it("compares neutrally and never shames an empty period", () => {
    expect(leadSentence("week", 51600, 44400)).toBe(
      "Bu hafta 14 sa 20 dk çalıştın; geçen haftanın aynı günlerine göre 2 sa fazla.",
    );
    expect(leadSentence("lastMonth", 3600, 7200)).toBe("Geçen ay 1 sa çalıştın; önceki aya göre 1 sa az.");
    expect(leadSentence("custom", 600, 630)).toBe("Bu aralıkta 10 dk çalıştın; önceki eşit süreye göre aynı düzeyde.");
    expect(leadSentence("month", 600, null)).toBe("Bu ay 10 dk çalıştın.");
    expect(leadSentence("week", 0, 9000)).toBe("Bu hafta kayıtlı çalışma yok. Bu, yaptığın bütün emeği ölçmez.");
  });
  it("only claims an estimate bias with at least three samples", () => {
    expect(accuracySentence(2, 1500)).toMatch(/^Henüz yeterli örnek yok.*şu an 2 var\.$/);
    expect(accuracySentence(3, null)).toMatch(/^Henüz yeterli örnek yok/);
    expect(accuracySentence(11, "1500")).toBe(
      "İşler tahmininden ortalama 25 dk daha uzun sürüyor (11 işe göre). Yeni bir iş planlarken payını biraz geniş tutabilirsin.",
    );
    expect(accuracySentence(4, -600)).toBe("İşler tahmininden ortalama 10 dk daha kısa sürüyor (4 işe göre).");
    expect(accuracySentence(4, 30)).toBe("Tahminlerin gerçeğe çok yakın (4 işe göre).");
  });
  it("labels axes compactly", () => {
    expect(bucketLabel({ fromDate: "2026-10-28", toDate: "2026-10-28" }, "Day", 7)).toBe("Çar");
    expect(bucketLabel({ fromDate: "2026-10-28", toDate: "2026-10-28" }, "Day", 31)).toBe("28");
    expect(bucketLabel({ fromDate: "2026-10-26", toDate: "2026-11-01" }, "Week", 10)).toBe("26 Eki");
    expect(bucketLabel({ fromDate: "2026-10-05", toDate: "2026-10-11" }, "Week", 10)).toBe("5–11 Eki");
    expect(bucketLabel({ fromDate: "2026-10-01", toDate: "2026-10-31" }, "Month", 12)).toBe("Eki");
    expect(rangeText({ fromDate: "2026-10-26", toDate: "2026-11-01" })).toBe("26 Eki – 1 Kas 2026");
    expect(rangeText({ fromDate: "2025-12-29", toDate: "2026-01-04" })).toBe("29 Ara 2025 – 4 Oca 2026");
  });
});
