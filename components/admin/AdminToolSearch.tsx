"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import { findAdminTools, type AdminTool } from "@/lib/admin-tool-search";

interface Props {
  tools: AdminTool[];
  hidden: boolean;
  onRequestOpen?: () => void;
  children: ReactNode;
}

export default function AdminToolSearch({ tools, hidden, onRequestOpen, children }: Props) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [shortcut, setShortcut] = useState("Ctrl K");
  const input = useRef<HTMLInputElement>(null);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const pendingFocus = useRef(false);
  const resultsId = useId();
  const searching = query.trim().length > 0;
  const results = findAdminTools(tools, query);

  useEffect(() => { setQuery(""); }, [pathname]);

  useEffect(() => {
    setShortcut(/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K");
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      // The sidebar is desktop-only; never steal a shortcut for an invisible input.
      if (event.defaultPrevented || event.isComposing || event.altKey ||
          !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k" ||
          !window.matchMedia("(min-width: 768px)").matches) return;
      if (hidden && !onRequestOpen) return;
      event.preventDefault();
      if (hidden) {
        pendingFocus.current = true;
        onRequestOpen?.();
      } else {
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hidden, onRequestOpen]);

  useEffect(() => {
    if (!hidden && pendingFocus.current) {
      pendingFocus.current = false;
      input.current?.focus();
      input.current?.select();
    }
  }, [hidden]);

  function clear() {
    setQuery("");
    input.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape" && query) {
      event.preventDefault();
      event.stopPropagation();
      clear();
    }
    if (!searching || !results.length) return;
    const index = links.current.findIndex((link) => link === document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = index < 0
        ? event.key === "ArrowDown" ? 0 : results.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
      links.current[next]?.focus();
    } else if (event.key === "Enter" && event.target === input.current) {
      event.preventDefault();
      links.current[0]?.click();
    }
  }

  return (
    <div onKeyDown={handleKeyDown}>
      <div className="mb-3 flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50/60 px-2 focus-within:border-teal-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-teal-500/15">
        <Search aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        <input
          ref={input}
          type="text"
          value={query}
          onChange={(event) => { setQuery(event.target.value); links.current = []; }}
          aria-label="Find an admin tool"
          aria-controls={searching ? resultsId : undefined}
          placeholder="Find a tool…"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent py-2 text-[13px] text-gray-900 outline-none placeholder:text-gray-400"
        />
        {query ? (
          <button type="button" onClick={clear} aria-label="Clear tool search" className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        ) : <kbd aria-hidden="true" className="shrink-0 rounded border border-gray-200 px-1 text-[10px] font-sans text-gray-400">{shortcut}</kbd>}
      </div>
      <p role="status" className="sr-only">{searching ? `${results.length} ${results.length === 1 ? "tool" : "tools"} found` : ""}</p>
      {searching ? (
        <div id={resultsId}>
          {results.length ? (
            <ul aria-label="Matching admin tools" className="space-y-1">
              {results.map((tool, index) => (
                <li key={tool.href}>
                  <Link
                    ref={(link) => { links.current[index] = link; }}
                    href={tool.href}
                    prefetch={false}
                    onNavigate={clear}
                    aria-current={pathname === tool.href ? "page" : undefined}
                    className="block rounded-lg px-2.5 py-2 hover:bg-gray-50 focus:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-600"
                  >
                    <span className="block text-[10px] font-medium uppercase tracking-wide text-gray-400">{tool.section}</span>
                    <span className="block text-[13px] font-medium text-gray-900">{tool.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">{tool.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-2.5 py-3">
              <p className="text-[13px] font-medium text-gray-700">No tools found</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">Try a name or task, like “campaigns” or “claims”.</p>
              <button type="button" onClick={clear} className="mt-3 rounded text-xs font-medium text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">Clear search</button>
            </div>
          )}
        </div>
      ) : children}
    </div>
  );
}
