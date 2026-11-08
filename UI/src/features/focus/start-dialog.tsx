"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Surface } from "../../components/ui/surface";
import { useDialogGuard } from "../work/draft-guard";
import { settingsLabel } from "./model";
import { StartFeedback, StartFields, useFocusStart, type Selection } from "./start-form";

/** Pomodoro sayfası dışından (Gün Planlama, Beş dakika başla) açılan başlatma penceresi. */
export function StartDialog({
  selection,
  trigger,
  close,
  quick = false,
  immediate = false,
  task,
}: {
  quick?: boolean;
  /** Görev zaten seçiliyse onay beklemeden başlatır; sayfada kalır. Hata/belirsiz sonuçta pencere açık kalır. */
  immediate?: boolean;
  /** Sadece 5 dakika açılınca görev zaten aranmış ve seçilmiş oluyor. */
  task?: { id: string; title: string };
  selection: Selection;
  zone: string;
  trigger: HTMLElement;
  close: () => void;
}) {
  const router = useRouter();
  const start = useFocusStart({
    selection,
    quick,
    task,
    done: () => {
      close();
      if (quick && !immediate) router.push("/focus");
    },
  });
  const guard = useDialogGuard({
    dirty: false,
    pending: start.pending || start.uncertain || start.workUncertain,
    close,
    trigger,
    message: "Odak başlatma seçimini bırakmak istiyor musun?",
  });
  const started = useRef(false);
  useEffect(() => {
    if (!immediate || !task || started.current) return;
    started.current = true;
    void start.run();
    // Yalnız açılışta bir kez; run sonraki tıklamalarda da aynı korumaları kullanır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Surface
      title={quick ? "Beş dakika başla" : "Pomodoro başlat"}
      modal
      returnTo={trigger}
      onClose={guard.requestClose}
      closeDisabled={start.pending || start.uncertain || start.workUncertain}
    >
      <div className="focus-form">
        <p>
          <strong>{selection.name}</strong> · {settingsLabel(selection.settings)}
        </p>
        <StartFields start={start} task={task} />
        <StartFeedback start={start} />
        {start.saved && (
          <p role="status">
            Odak oturumu başlatıldı.{" "}
            {quick
              ? "Beş dakikalık hedefi odak ekranından takip edebilirsin."
              : "Güncel durum ana alanda gösteriliyor."}
          </p>
        )}
        <div className="actions">
          <button className="primary" disabled={start.locked} onClick={() => void start.run()}>
            {start.pending ? "Başlatılıyor…" : "Pomodoroyu başlat"}
          </button>
          <button disabled={start.pending || start.uncertain || start.workUncertain} onClick={guard.requestClose}>
            {start.saved || start.reviewed ? (quick ? "Kapat" : "Pomodoroya dön") : "Vazgeç"}
          </button>
        </div>
      </div>
    </Surface>
  );
}
