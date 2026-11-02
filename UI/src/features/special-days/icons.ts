import { CalendarHeart, Gift, PartyPopper, Star } from "lucide-react";
import type { Kind } from "./model";

/** Her türün renk yanında simgesi var. Anlam yalnız renge kalmıyor. */
export const kindIcon: Record<Kind, typeof Gift> = {
  Birthday: Gift,
  Anniversary: CalendarHeart,
  Holiday: PartyPopper,
  Other: Star,
};
