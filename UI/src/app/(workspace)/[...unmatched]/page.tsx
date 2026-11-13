import { notFound } from "next/navigation";

/** Çalışma alanında tanımsız bir adres: 404 sayfası kenar çubuğu ve üst çubukla birlikte görünsün. */
export default function Page() {
  notFound();
}
