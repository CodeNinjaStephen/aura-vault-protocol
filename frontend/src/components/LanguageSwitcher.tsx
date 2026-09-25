"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { useTransition } from "react";

const FLAG: Record<string, string> = {
  en: "🇬🇧",
  es: "🇪🇸",
};

export default function LanguageSwitcher() {
  const t = useTranslations("languageSwitcher");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  };

  return (
    <div className="relative flex items-center">
      <label htmlFor="language-select" className="sr-only">
        {t("label")}
      </label>
      <select
        id="language-select"
        value={locale}
        onChange={handleChange}
        disabled={isPending}
        className="appearance-none cursor-pointer rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 py-1 pl-2 pr-6 text-sm font-medium hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
      >
        {routing.locales.map((loc) => (
          <option key={loc} value={loc}>
            {FLAG[loc]} {t(loc as "en" | "es")}
          </option>
        ))}
      </select>
      {/* Custom chevron */}
      <span className="pointer-events-none absolute right-1.5 text-zinc-400 text-xs">▾</span>
    </div>
  );
}
