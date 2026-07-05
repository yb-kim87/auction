import Link from "next/link";
import { User } from "lucide-react";

export function AccountNavLink({ name }: { name?: string }) {
  return (
    <Link href="/account" className="flex items-center gap-2 pl-2 border-l border-border ml-1 hover:opacity-80 transition-opacity">
      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <User className="w-3.5 h-3.5 text-primary" />
      </div>
      <span className="text-sm text-foreground/70 hidden sm:block whitespace-nowrap">
        {name ? `${name}님` : "회원정보"}
      </span>
    </Link>
  );
}
