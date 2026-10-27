'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders children into document.body via a React portal.
 *
 * `position: fixed` is relative to the nearest ancestor that has a CSS
 * transform, perspective, filter, or will-change property — NOT the viewport.
 * Portalling the overlay to <body> escapes that containment, so the backdrop
 * always covers the full screen regardless of how deeply nested the trigger is.
 */
export function Modal({
  onBackdropClick,
  children,
}: {
  onBackdropClick?: () => void
  children: ReactNode
}) {
  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const backdropRef = useRef<HTMLDivElement>(null)

  function handleBackdropPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.target === backdropRef.current) onBackdropClick?.()
  }

  return createPortal(
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#172033]/40 p-4"
      onPointerDown={handleBackdropPointerDown}
    >
      {children}
    </div>,
    document.body,
  )
}
