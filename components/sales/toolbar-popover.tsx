'use client';

import { ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import styles from './sales-bike-allocation-page.module.css';

type Props = {
  /** Trigger text. */
  label: ReactNode;
  /** Small count/state badge shown inside the trigger. */
  badge?: ReactNode;
  /** Extra class for the trigger, e.g. to mark it as active. */
  triggerClassName?: string;
  /** Extra class for the panel, e.g. to widen it or anchor it to the right. */
  panelClassName?: string;
  title?: string;
  /**
   * Position the panel with `position: fixed`, anchored to the trigger.
   *
   * Needed when the trigger sits inside a scroll container (the matrix header),
   * where an absolutely positioned panel would be clipped by `overflow: auto`.
   */
  anchorFixed?: boolean;
  /** Align the panel's right edge with the trigger's, for triggers near the viewport edge. */
  alignRight?: boolean;
  children: ReactNode;
};

/**
 * A compact dropdown panel for the allocation toolbar.
 *
 * Exists so filters cost no vertical space when closed — the previous full-width
 * expanding filter drawer pushed the matrix far down the page.
 *
 * Closes on outside pointer-down and on Escape, and returns focus to the trigger so
 * keyboard users are not dropped at the top of the document.
 */
export default function ToolbarPopover({
  label,
  badge,
  triggerClassName,
  panelClassName,
  title,
  anchorFixed,
  alignRight,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const [fixedPosition, setFixedPosition] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const positionPanel = useCallback(() => {
    if (!anchorFixed || !triggerRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const panelWidth = panelRef.current?.offsetWidth ?? 280;
    const gutter = 8;
    const preferredLeft = alignRight ? trigger.right - panelWidth : trigger.left;
    // Keep the panel inside the viewport on narrow screens.
    const left = Math.max(gutter, Math.min(preferredLeft, window.innerWidth - panelWidth - gutter));
    setFixedPosition({ top: trigger.bottom + 4, left });
  }, [anchorFixed, alignRight]);

  useLayoutEffect(() => {
    if (!open) {
      setFixedPosition(null);
      return;
    }
    positionPanel();
  }, [open, positionPanel]);

  useEffect(() => {
    if (!open || !anchorFixed) return;
    // The trigger can move while the matrix is scrolled or the window resized.
    const onReflow = () => positionPanel();
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open, anchorFixed, positionPanel]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.popoverRoot} ref={rootRef}>
      <button
        type='button'
        ref={triggerRef}
        className={`${styles.popoverTrigger} ${triggerClassName ?? ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        title={title}
      >
        <span>{label}</span>
        {badge ? <span className={styles.popoverBadge}>{badge}</span> : null}
        <span className={styles.popoverCaret} aria-hidden='true'>
          ▾
        </span>
      </button>
      {open ? (
        <div
          className={`${styles.popoverPanel} ${anchorFixed ? styles.popoverPanelFixed : ''} ${alignRight && !anchorFixed ? styles.popoverPanelRight : ''} ${panelClassName ?? ''}`}
          id={panelId}
          role='group'
          ref={panelRef}
          style={anchorFixed ? { top: fixedPosition?.top ?? -9999, left: fixedPosition?.left ?? -9999 } : undefined}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
