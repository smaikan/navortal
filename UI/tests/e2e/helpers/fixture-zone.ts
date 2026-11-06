/** UTC 22/23 olsa da örnek 09 ve 10 saatleri aynı yerel günde kalsın. */
export function nextHourZone(frozen: string) {
  const match = /^Etc\/GMT([+-])(\d{1,2})$/.exec(frozen);
  const old = frozen === "Etc/UTC" ? 0 : match ? Number(match[2]) * (match[1] === "-" ? 1 : -1) : NaN;
  if (!Number.isInteger(old) || old < -12 || old > 11) throw new RangeError("Expected the fixture's 09:xx zone");
  const offset = old + 1;
  return offset === 0 ? "Etc/UTC" : `Etc/GMT${offset > 0 ? "-" : "+"}${Math.abs(offset)}`;
}
