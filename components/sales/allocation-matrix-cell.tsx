'use client';

import styles from './sales-bike-allocation-page.module.css';

export type MatrixCellStatus = 'active' | 'not_active' | 'not_configured';
export type MatrixSyncTone = 'pushed' | 'pending' | 'error' | 'outOfSync' | 'unknown';

type Props = {
  status: MatrixCellStatus;
  /** Toggle Active/Inactive, or launch the CPQ configurator when not configured. */
  onToggle: () => void;
  /** Manual external push. Omitted when the row has no BC ids or the user is read-only. */
  onPush?: () => void;
  toggleDisabled?: boolean;
  pushDisabled?: boolean;
  busy?: boolean;
  pushBusy?: boolean;
  syncTone: MatrixSyncTone;
  /** Full wording for the sync state, shown on hover and to screen readers. */
  syncTitle: string;
  toggleTitle: string;
  /** Accessible sentence for the cell, e.g. "C001 GB: Active". */
  ariaLabel: string;
};

/**
 * One allocation cell, optimized for a matrix that can be 30+ countries wide.
 *
 * Density decisions:
 * - `not_configured` renders as a small dot rather than the words "Not configured".
 *   It stays a real button with the same CPQ-launch behaviour and a full accessible
 *   name, so nothing is lost but the visual noise.
 * - the external-sync state is an icon, not a word, and the neutral "unknown" state is
 *   a faint push affordance instead of the literal text "Unknown".
 * - status is never carried by colour alone: Active/Inactive keep their words and the
 *   sync icons are distinct glyphs.
 */
export default function AllocationMatrixCell({
  status,
  onToggle,
  onPush,
  toggleDisabled,
  pushDisabled,
  busy,
  pushBusy,
  syncTone,
  syncTitle,
  toggleTitle,
  ariaLabel,
}: Props) {
  const syncGlyph =
    syncTone === 'pushed' ? '✓' : syncTone === 'pending' ? 'BC' : syncTone === 'error' ? '!' : syncTone === 'outOfSync' ? '≠' : '⤴';

  return (
    <div className={styles.cellWrap}>
      {status === 'not_configured' ? (
        <button
          type='button'
          className={styles.cellDot}
          onClick={onToggle}
          disabled={toggleDisabled}
          title={toggleTitle}
          aria-label={ariaLabel}
        >
          <span aria-hidden='true'>{busy ? '…' : '•'}</span>
        </button>
      ) : (
        <button
          type='button'
          className={`${styles.cellPill} ${status === 'active' ? styles.cellPillActive : styles.cellPillInactive}`}
          onClick={onToggle}
          disabled={toggleDisabled}
          title={toggleTitle}
          aria-label={ariaLabel}
        >
          {busy ? '…' : status === 'active' ? 'Active' : 'Inactive'}
        </button>
      )}

      {status === 'not_configured' ? null : onPush ? (
        <button
          type='button'
          className={`${styles.cellSync} ${styles[`cellSync_${syncTone}`]}`}
          onClick={onPush}
          disabled={pushDisabled}
          title={syncTitle}
          aria-label={syncTitle}
        >
          <span aria-hidden='true'>{pushBusy ? '…' : syncGlyph}</span>
        </button>
      ) : syncTone === 'unknown' ? null : (
        <span className={`${styles.cellSync} ${styles[`cellSync_${syncTone}`]}`} title={syncTitle}>
          <span aria-hidden='true'>{syncGlyph}</span>
          <span className={styles.srOnly}>{syncTitle}</span>
        </span>
      )}
    </div>
  );
}
