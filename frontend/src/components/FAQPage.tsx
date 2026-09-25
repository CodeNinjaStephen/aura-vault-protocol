"use client";

import { useState, useMemo } from "react";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { faqData, categories, type Locale } from "@/lib/faqData";

// Locales with FAQ content (faqData only has en/es/fr, but we map fr -> en
// gracefully when next-intl locale is not in faqData).
const SUPPORTED_FAQ_LOCALES: Locale[] = ["en", "es"];

function toFaqLocale(locale: string): Locale {
  if ((SUPPORTED_FAQ_LOCALES as string[]).includes(locale)) {
    return locale as Locale;
  }
  return "en";
}

export default function FAQPage() {
  const t = useTranslations("faq");
  // Derive FAQ locale from the current next-intl locale — no separate state needed.
  const nextLocale = useLocale();
  const locale = toFaqLocale(nextLocale);

  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const items = faqData[locale];
  const cats = categories[locale];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchCat =
        activeCategory === "all" || item.category === activeCategory;
      const matchQ =
        !q ||
        item.q.toLowerCase().includes(q) ||
        item.a.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [items, query, activeCategory]);

  // Group by category for display
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const item of filtered) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category)!.push(item);
    }
    return map;
  }, [filtered]);

  const categoryLabel = (id: string) =>
    cats.find((c) => c.id === id)?.label ?? id;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-black/[.08] dark:border-white/[.1] py-12 px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-semibold tracking-tight mb-2">
            {t("heading")}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-base mb-6">
            {t("subheading")}
          </p>

          {/* Search */}
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
              size={16}
            />
            <input
              type="search"
              placeholder={t("searchPlaceholder")}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveCategory("all");
                setOpenId(null);
              }}
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-black/[.1] dark:border-white/[.15] bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20"
            />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-8 sm:flex-row">
        {/* Category sidebar */}
        <nav className="sm:w-48 shrink-0">
          <ul className="flex flex-row flex-wrap gap-2 sm:flex-col sm:gap-1">
            <li>
              <button
                onClick={() => {
                  setActiveCategory("all");
                  setOpenId(null);
                }}
                className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
                  activeCategory === "all"
                    ? "bg-black/[.06] dark:bg-white/[.08] font-medium"
                    : "hover:bg-black/[.04] dark:hover:bg-white/[.05]"
                }`}
              >
                {t("allCategory")}
                <span className="ml-1 text-zinc-400 text-xs">
                  ({items.length})
                </span>
              </button>
            </li>
            {cats.map((cat) => {
              const count = items.filter((i) => i.category === cat.id).length;
              return (
                <li key={cat.id}>
                  <button
                    onClick={() => {
                      setActiveCategory(cat.id);
                      setOpenId(null);
                    }}
                    className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
                      activeCategory === cat.id
                        ? "bg-black/[.06] dark:bg-white/[.08] font-medium"
                        : "hover:bg-black/[.04] dark:hover:bg-white/[.05]"
                    }`}
                  >
                    {cat.label}
                    <span className="ml-1 text-zinc-400 text-xs">
                      ({count})
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* FAQ list */}
        <main className="flex-1 min-w-0">
          {filtered.length === 0 ? (
            <p className="text-zinc-500 text-sm py-8 text-center">
              {t("noResults")}
            </p>
          ) : (
            Array.from(grouped.entries()).map(([catId, catItems]) => (
              <section key={catId} className="mb-8">
                {query !== "" || activeCategory === "all" ? (
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-3">
                    {categoryLabel(catId)}
                  </h2>
                ) : null}
                <ul className="divide-y divide-black/[.06] dark:divide-white/[.08] border border-black/[.08] dark:border-white/[.1] rounded-xl overflow-hidden">
                  {catItems.map((item) => {
                    const isOpen = openId === item.id;
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => setOpenId(isOpen ? null : item.id)}
                          aria-expanded={isOpen}
                          className="w-full flex items-start justify-between gap-4 px-5 py-4 text-left hover:bg-black/[.02] dark:hover:bg-white/[.03] transition-colors"
                        >
                          <span className="text-sm font-medium leading-snug">
                            {item.q}
                          </span>
                          {isOpen ? (
                            <ChevronUp
                              size={16}
                              className="shrink-0 mt-0.5 text-zinc-400"
                            />
                          ) : (
                            <ChevronDown
                              size={16}
                              className="shrink-0 mt-0.5 text-zinc-400"
                            />
                          )}
                        </button>
                        {isOpen && (
                          <div className="px-5 pb-4 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                            {item.a}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}

          {/* Footer note */}
          <p className="text-xs text-zinc-400 mt-4">
            {t("cantFind")}{" "}
            <a
              href="https://github.com/aura-vault-protocol"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              {t("openIssue")}
            </a>
          </p>
        </main>
      </div>
    </div>
  );
}
