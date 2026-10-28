import { Folder, Inbox, Shapes, Tag } from "lucide-react";
import type { ResourceKind } from "./model";

const icons = { projects: Folder, pools: Inbox, categories: Shapes, tags: Tag };

export function ResourceTile({ kind, size = 20 }: { kind: ResourceKind; size?: number }) {
  const Icon = icons[kind];
  return (
    <span className={`resource-tile ${kind}`} aria-hidden="true">
      <Icon size={size} />
    </span>
  );
}
