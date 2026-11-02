import { weekOrder } from "./model";
import "./styles.css";

const stripLetters = ["P", "P", "S", "Ç", "P", "C", "C"];
export function WeekStrip({ days }: { days: number[] }) {
  return (
    <span className="recurrence-strip" aria-hidden="true">
      {weekOrder.map(d => (
        <span key={d} data-on={days.includes(d) || undefined}>
          {stripLetters[d]}
        </span>
      ))}
    </span>
  );
}
