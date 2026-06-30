import Link from "next/link";
import { User } from "lucide-react";
import { HEADER_BTN } from "./AppHeader";

export function AccountNavLink() {
  return (
    <Link href="/account" className={HEADER_BTN}>
      <User size={16} />
      회원정보
    </Link>
  );
}
