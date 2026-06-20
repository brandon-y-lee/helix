"use client";

import Link from "next/link";
import { useState } from "react";
import type { FooterLinkGroup } from "@/content/footer";

export function FooterMobileGroups({ groups }: { groups: FooterLinkGroup[] }) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  return (
    <div className="site-footer__mobile-groups" aria-label="Footer links">
      {groups.map((group) => {
        const panelId = `footer-mobile-${group.id}`;
        const isOpen = Boolean(openGroups[group.id]);
        return (
          <section key={group.id} className="site-footer__accordion">
            <button
              type="button"
              className="site-footer__accordion-trigger"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() =>
                setOpenGroups((current) => ({
                  ...current,
                  [group.id]: !current[group.id],
                }))
              }
            >
              <span>{group.label}</span>
              <span aria-hidden="true">{isOpen ? "-" : "+"}</span>
            </button>
            <ul id={panelId} hidden={!isOpen}>
              {group.links.map((link) => (
                <li key={`${group.id}-${link.href}`}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

