import Link from "next/link";

const NAV = [
  ["/", "Dashboard"],
  ["/projects", "Projects"],
  ["/create", "Create Video"],
  ["/assets", "Assets"],
  ["/models", "Models"],
  ["/settings", "Settings"],
] as const;

export function Shell({
  active,
  title,
  subtitle,
  children,
}: {
  active: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="app">
      <aside className="sidebar">
        <h1>Video Studio</h1>
        <div className="tag">private · single-user · mock</div>
        <nav>
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className={active === href ? "active" : ""}>
              {label}
            </Link>
          ))}
        </nav>
        <form action="/api/auth/logout" method="post" style={{ marginTop: 24 }}>
          <button className="secondary" style={{ width: "100%" }} type="submit">
            Log out
          </button>
        </form>
      </aside>
      <main className="main">
        <h2>{title}</h2>
        {subtitle ? <p className="sub">{subtitle}</p> : null}
        {children}
      </main>
    </div>
  );
}
