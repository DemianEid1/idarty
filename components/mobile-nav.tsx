'use client'

import { useState } from 'react'
import Link from 'next/link'

export function MobileNav({
  locale,
  labels,
}: {
  locale: 'ar' | 'en'
  labels: { open: string; close: string; links: { label: string; href: string }[] }
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-xl p-2 text-[#516078]"
        aria-label={open ? labels.close : labels.open}
        aria-expanded={open}
      >
        <span className="sr-only">{open ? labels.close : labels.open}</span>
        <span aria-hidden="true" className="flex w-5 flex-col gap-1.5">
          {open ? (
            <>
              <span className="h-0.5 w-5 rotate-45 bg-current" />
              <span className="-mt-2 h-0.5 w-5 -rotate-45 bg-current" />
            </>
          ) : (
            <>
              <span className="h-0.5 w-5 bg-current" />
              <span className="h-0.5 w-5 bg-current" />
              <span className="h-0.5 w-5 bg-current" />
            </>
          )}
        </span>
      </button>

      {open && (
        <nav
          className="absolute inset-x-0 top-[76px] border-t border-[#e9edf5] bg-paper px-6 py-4 shadow-lg"
          aria-label={labels.open}
        >
          <div className="flex flex-col gap-2">
            {labels.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-3 text-sm font-semibold text-[#516078] hover:bg-[#f3f6ff]"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}

