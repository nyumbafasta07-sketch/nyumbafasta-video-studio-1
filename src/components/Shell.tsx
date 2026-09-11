"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "./Icons";
import { ThemeToggle } from "./ThemeToggle";

type Item = { href: string; label: string; icon: IconName };
const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Studio",
    items: [
      { href: "/", label: "Dashboard", icon: "dashboard" },
      { href: "/projects", label: "Projects", icon: "folder" },
      { href: "/create", label: "Create Video", icon: "wand" },
    ],
  },
  {
    label: "Training",
    items: [{ href: "/training", label: "Training Studio", icon: "brain" }],
  },
  {
    label: "Library",
    items: [
      { href: "/assets", label: "Assets", icon: "layers" },
      { href: "/models", label: "Models", icon: "cube" },
    ],
  },
  {
    label: "System",
    items: [{ href: "/settings", label: "Settings", icon: "gear" }],
  },
];

export function Shell({
  active,
  title,
  subtitle,
  actions,
  children,
}: {
  active: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="app">
      {open ? <div className="scrim" onClick={() => setOpen(false)} /> : null}

      <aside className={`sidebar${open ? " open" : ""}`}>
        <div className="brand">
          <span className="logo">
            <Icon.film className="" />
          </span>
          <div>
            <b>Video Studio</b>
            <span>private · single-user</span>
          </div>
        </div>

        {GROUPS.map((g) => (
          <div className="nav-group" key={g.label}>
            <div className="label">{g.label}</div>
            {g.items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className={`nav-item${active === it.href ? " active" : ""}`}
                onClick={() => setOpen(false)}
              >
                {renderIcon(it.icon)}
                {it.label}
              </Link>
            ))}
          </div>
        ))}

        <div className="spacer" />
        <form action="/api/auth/logout" method="post">
          <button className="ghost block" type="submit">
            <Icon.logout /> Log out
          </button>
        </form>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="row" style={{ gap: 10 }}>
            <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Menu">
              <Icon.menu />
            </button>
            <div className="title">
              <h2>{title}</h2>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
          </div>
          <div className="actions">
            {actions}
            <ThemeToggle />
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

function renderIcon(name: IconName) {
  const C = Icon[name];
  return <C />;
}
