"use client";
import { useState } from "react";
import { Play } from "lucide-react";
import { Surface } from "../../components/ui/surface";
import { pickCard, type PickCard } from "./card-pick-model";
import "./card-pick.css";

/** Saatsiz işlerden birini seçer. Yalnız ekranda seçim yapar; plan ve görev değişmez. */
export function CardPick({
  cards,
  canStart,
  start,
  close,
  trigger,
}: {
  cards: readonly PickCard[];
  canStart: boolean;
  start: (taskId: string) => void;
  close: () => void;
  trigger: HTMLElement;
}) {
  const [card, setCard] = useState(() => pickCard(cards, null));
  const [round, setRound] = useState(0);
  return (
    <Surface title="Kart seç" modal placement="confirm" returnTo={trigger} onClose={close}>
      <div className="card-pick">
        <div className="card-pick-deck" aria-live="polite">
          <article key={round} className="card-pick-card">
            <p className="card-pick-title">{card.title}</p>
            {card.meta && <p className="card-pick-meta">{card.meta}</p>}
          </article>
        </div>
        {!canStart && <p className="muted">Yeni iş başlatmak için çalışan işi durdur.</p>}
        <div className="card-pick-actions">
          <button
            type="button"
            className="primary"
            disabled={!canStart}
            onClick={() => {
              start(card.taskId);
              close();
            }}
          >
            <Play aria-hidden="true" size={15} />
            Başlat
          </button>
          {cards.length > 1 && (
            <button
              type="button"
              onClick={() => {
                setCard(pickCard(cards, card.taskId));
                setRound(round + 1);
              }}
            >
              Tekrar kart seç
            </button>
          )}
        </div>
      </div>
    </Surface>
  );
}
