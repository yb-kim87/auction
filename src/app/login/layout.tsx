import "./login-theme.css";

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="login-theme">{children}</div>;
}
