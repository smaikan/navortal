import { titleIssue } from "../model";

/** Yeni görevin alt görev taslağı: düz satır listesi, her satır 1..4 derinlikte (kök görev 0). Sınırlar API ile aynı: kök dahil 50 görev, 5 seviye. */
export type DraftRow = { id: string; text: string; depth: number };
export type TreeNode = { title: string; children?: TreeNode[] };
export const draftMaxDepth = 4;
export const draftMaxRows = 49;

/** Satırın kendisi ve altındaki satırlar: [i, end). */
function subtreeEnd(rows: readonly DraftRow[], i: number) {
  let end = i + 1;
  while (end < rows.length && rows[end].depth > rows[i].depth) end++;
  return end;
}

/** Kök "+": sona birinci seviye satır. Satır "+": satırın ilk alt satırı. */
export function addRow(rows: readonly DraftRow[], id: string, under?: string): DraftRow[] {
  if (rows.length >= draftMaxRows) return [...rows];
  if (under === undefined) return [...rows, { id, text: "", depth: 1 }];
  const i = rows.findIndex(row => row.id === under);
  if (i < 0 || rows[i].depth >= draftMaxDepth) return [...rows];
  return [...rows.slice(0, i + 1), { id, text: "", depth: rows[i].depth + 1 }, ...rows.slice(i + 1)];
}

/** Enter: aynı seviyede, satırın alt satırlarından sonra yeni satır. */
export function addSibling(rows: readonly DraftRow[], id: string, after: string): DraftRow[] {
  const i = rows.findIndex(row => row.id === after);
  if (i < 0 || rows.length >= draftMaxRows) return [...rows];
  const end = subtreeEnd(rows, i);
  return [...rows.slice(0, end), { id, text: "", depth: rows[i].depth }, ...rows.slice(end)];
}

/** Yazı değişir; son satır dolunca altında aynı seviyede boş satır açılır. */
export function editRow(rows: readonly DraftRow[], id: string, text: string, next: () => string): DraftRow[] {
  const changed = rows.map(row => (row.id === id ? { ...row, text } : row));
  const last = changed.at(-1);
  return last?.id === id && text.trim() && changed.length < draftMaxRows
    ? [...changed, { id: next(), text: "", depth: last.depth }]
    : changed;
}

/** Tab: satır alt satırlarıyla bir üsttekinin alt görevi olur. Olmuyorsa null; odak normal ilerler. */
export function indent(rows: readonly DraftRow[], id: string): DraftRow[] | null {
  const i = rows.findIndex(row => row.id === id);
  if (i <= 0 || rows[i].depth > rows[i - 1].depth) return null;
  const end = subtreeEnd(rows, i);
  if (rows.slice(i, end).some(row => row.depth >= draftMaxDepth)) return null;
  return rows.map((row, j) => (j >= i && j < end ? { ...row, depth: row.depth + 1 } : row));
}

/** Shift+Tab / "Bir seviye yukarı al": satır alt satırlarıyla bir seviye çıkar. */
export function outdent(rows: readonly DraftRow[], id: string): DraftRow[] | null {
  const i = rows.findIndex(row => row.id === id);
  if (i < 0 || rows[i].depth <= 1) return null;
  const end = subtreeEnd(rows, i);
  return rows.map((row, j) => (j >= i && j < end ? { ...row, depth: row.depth - 1 } : row));
}

/** Kaldır: yalnız bu satır gider; alt satırları bir seviye yukarı çıkar, yazılanlar kaybolmaz. */
export function removeRow(rows: readonly DraftRow[], id: string): DraftRow[] {
  const i = rows.findIndex(row => row.id === id);
  if (i < 0) return [...rows];
  const end = subtreeEnd(rows, i);
  return rows.flatMap((row, j) => (j === i ? [] : j > i && j < end ? [{ ...row, depth: row.depth - 1 }] : [row]));
}

export const draftFilled = (rows: readonly DraftRow[]) => rows.some(row => row.text.trim());

/** Gönderilecek ağaç. Boş satırlar atılır; boş satırın alt satırları bir üst dolu satıra bağlanır. */
export function draftTree(title: string, rows: readonly DraftRow[]): TreeNode {
  const root: TreeNode & { children: TreeNode[] } = { title: title.trim(), children: [] };
  const stack: { depth: number; node: TreeNode & { children: TreeNode[] } }[] = [{ depth: 0, node: root }];
  for (const row of rows) {
    const text = row.text.trim();
    if (!text) continue;
    while (stack.at(-1)!.depth >= row.depth) stack.pop();
    const node = { title: text, children: [] };
    stack.at(-1)!.node.children.push(node);
    stack.push({ depth: row.depth, node });
  }
  const strip = (node: TreeNode & { children: TreeNode[] }): TreeNode =>
    node.children.length
      ? { title: node.title, children: node.children.map(child => strip(child as typeof node)) }
      : { title: node.title };
  return strip(root);
}

/** İstemci tarafı yalnız girdi denetimi; sunucu ağacı yeniden doğrular. */
export function draftIssue(title: string, rows: readonly DraftRow[]) {
  const issue = titleIssue(title);
  if (issue) return issue;
  return rows.some(row => row.text.trim().length > 300) ? "Alt görev adı en fazla 300 karakter olabilir." : undefined;
}
