import Image from "next/image";
import { brand } from "@config/brand";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";
import { UserNav } from "./user-nav";

export function SiteHeader() {
  return (
    <header className="border-b border-gold/30">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Image src={brand.logo.mark} alt="" width={28} height={28} />
          <span className="font-semibold tracking-[0.25em]">
            {brand.wordmark}
          </span>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <UserNav />
          <LocaleSwitcher />
        </div>
      </nav>
    </header>
  );
}
