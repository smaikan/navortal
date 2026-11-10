"use client";

import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Surface } from "../ui/surface";
import { InlineError } from "../ui/inline-error";
import { taskPanelUrl, validTaskId } from "./task-panel-url";
import { subscribeTraversal } from "../../lib/navigation/traversal";
import { createPanelSaves, type PanelSave } from "./task-panel-saves";

const SaveContext = createContext<(entry: PanelSave) => () => void>(() => () => {});
export function useTaskPanelSave(entry: PanelSave) {
  const register = useContext(SaveContext);
  const latest = useRef(entry);
  useEffect(() => {
    latest.current = entry;
  }, [entry]);
  useEffect(() => register({ dirty: () => latest.current.dirty(), save: () => latest.current.save() }), [register]);
}

const TaskDetail = lazy(() => import("../../features/tasks/detail").then(module => ({ default: module.TaskDetail })));
const GuardContext = createContext<(dirty: boolean) => void>(() => {});
export function useTaskDraftGuard(dirty: boolean) {
  const setDirty = useContext(GuardContext);
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
}

const TaskPanelContext = createContext<(id: string, trigger: HTMLElement) => void>(() => {
  throw new Error("TaskPanelProvider gerekli.");
});
const media = "(min-width: 768px)";
function subscribe(callback: () => void) {
  const query = window.matchMedia(media);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const desktop = () => window.matchMedia(media).matches;
const serverDesktop = () => false;

export function useTaskPanel() {
  return useContext(TaskPanelContext);
}
const CurrentTaskContext = createContext<string | null>(null);
export function useCurrentTask() {
  return useContext(CurrentTaskContext);
}
const CloseContext = createContext<() => void>(() => {});
/** Silme makbuzu gelince panel kapanabilir; taslağın kaydedileceği görev artık yok. */
export function useCloseTaskPanel() {
  return useContext(CloseContext);
}

export function TaskPanelProvider({ children, after }: { children: React.ReactNode; after?: React.ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const wide = useSyncExternalStore(subscribe, desktop, serverDesktop);
  const [returnTo, setReturnTo] = useState<HTMLElement | null>(null);
  const dirty = useRef(false);
  const [saves] = useState(createPanelSaves);
  const closing = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const setDirty = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);
  const hasDraft = useCallback(() => dirty.current || saves.dirty(), [saves]);
  const allow = useCallback(() => {
    if (
      !hasDraft() ||
      window.confirm("Kaydedilmemiş görev değişikliklerin var. Ayrılırsan taslak silinir. Devam edilsin mi?")
    ) {
      dirty.current = false;
      return true;
    }
    return false;
  }, [hasDraft]);
  const selected = search.get("taskId");
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  const saveThen = useCallback(
    (next: () => void) => {
      if (closing.current) return;
      const expected = selectedRef.current;
      closing.current = true;
      void saves
        .flush()
        .then(saved => {
          if (saved && mounted.current && selectedRef.current === expected && allow()) next();
        })
        .finally(() => {
          closing.current = false;
        });
    },
    [allow, saves],
  );
  const visible = selected !== null && search.get("menu") !== "more";
  useEffect(() => {
    if (!visible) return;
    const href = location.href;
    const marker = history.state?.adhdPanel;
    const unsubscribe = subscribeTraversal(event => {
      if (!hasDraft() || location.href === href) return;
      if (saves.dirty()) {
        event.stopImmediatePropagation();
        history.pushState({ adhdPanel: marker }, "", href);
        saveThen(() => router.back());
        return;
      }
      if (allow()) return;
      event.stopImmediatePropagation();
      // Yönlendirici bu geçmiş geçişini henüz görmedi. Mevcut taslağın
      // adresini yerel köprüyle geri alıyoruz; başka sayfanın Next ağacını karıştırmıyoruz.
      history.pushState({ adhdPanel: marker }, "", href);
    });
    const unload = (event: BeforeUnloadEvent) => {
      if (hasDraft()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const logout = (event: Event) => {
      if (!allow()) event.preventDefault();
    };
    const click = (event: MouseEvent) => {
      if (
        !hasDraft() ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.download || (anchor.target && anchor.target !== "_self") || anchor.href === location.href)
        return;
      if (!allow()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("adhd:before-local-logout", logout);
    document.addEventListener("click", click, true);
    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("adhd:before-local-logout", logout);
      document.removeEventListener("click", click, true);
    };
  }, [allow, hasDraft, saves, saveThen, router, visible, selected, pathname, search]);
  function open(id: string, trigger: HTMLElement) {
    if (id === selected || !allow()) return;
    setReturnTo(trigger);
    const base = taskPanelUrl(pathname, search.toString(), null, window.location.hash);
    const url = taskPanelUrl(pathname, search.toString(), id, window.location.hash);
    // Next kendi yönlendirme alanlarını kopyalıyor. __NA değerini biz verirsek
    // geçmiş bildirimi atlanır ve useSearchParams eski kalır.
    if (selected === null) window.history.pushState({ adhdPanel: { base, path: pathname } }, "", url);
    else window.history.replaceState({ adhdPanel: window.history.state?.adhdPanel }, "", url);
  }
  function navigateClose() {
    const marker = window.history.state?.adhdPanel as { base?: string; path?: string } | undefined;
    const base = taskPanelUrl(pathname, search.toString(), null, window.location.hash);
    if (marker?.path === pathname && marker.base === base) router.back();
    else window.history.replaceState({}, "", base);
  }
  function close() {
    if (saves.dirty() || closing.current) {
      saveThen(navigateClose);
      return false;
    }
    if (!allow()) return false;
    navigateClose();
  }
  const surface = (content: React.ReactNode) => (
    <Surface
      title="Görev ayrıntısı"
      modal={!wide}
      placement="full"
      onClose={close}
      returnTo={returnTo}
      keepOpenOn="[data-task-panel-target]"
    >
      {content}
    </Surface>
  );
  return (
    <TaskPanelContext value={open}>
      <CloseContext
        value={() => {
          dirty.current = false;
          navigateClose();
        }}
      >
        <SaveContext value={saves.register}>
          <GuardContext value={setDirty}>
            <div className={`workspace-columns${visible && wide ? " has-task-panel" : ""}`}>
              <CurrentTaskContext value={visible ? selected : null}>{children}</CurrentTaskContext>
              {visible &&
                (validTaskId(selected) ? (
                  <Suspense fallback={surface(<p role="status">Görev okunuyor…</p>)}>
                    <TaskDetail key={selected} id={selected} surface={surface} />
                  </Suspense>
                ) : (
                  surface(
                    <InlineError>
                      Görev bağlantısı geçersiz. Paneli kapatıp görev listesinden tekrar açabilirsin.
                    </InlineError>,
                  )
                ))}
            </div>
            {after}
          </GuardContext>
        </SaveContext>
      </CloseContext>
    </TaskPanelContext>
  );
}
