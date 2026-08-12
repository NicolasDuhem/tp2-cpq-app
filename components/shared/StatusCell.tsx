'use client';

type ExternalSyncTone = 'pushed' | 'pending' | 'error' | 'unknown' | 'outOfSync';

type StatusCellProps = {
  status: 'active' | 'inactive' | 'not_configured';
  onToggle: () => void;
  onPush?: () => void;
  disabled?: boolean;
  pushDisabled?: boolean;
  statusLabel?: string;
  pushLabel?: string;
  title?: string;
  pushTitle?: string;
  pushTone?: 'default' | 'active' | 'inactive';
  syncLabel?: string;
  syncTone?: ExternalSyncTone;
};

export default function StatusCell({
  status,
  onToggle,
  onPush,
  disabled,
  pushDisabled,
  statusLabel,
  pushLabel = 'Unknown',
  title,
  pushTitle,
  pushTone = 'default',
  syncLabel,
  syncTone,
}: StatusCellProps) {
  const badgeClass = status === 'active' ? 'statusCellBadge statusCellActive' : status === 'inactive' ? 'statusCellBadge statusCellInactive' : 'statusCellBadge statusCellNotConfigured';
  const fallbackLabel = status === 'active' ? 'Active' : status === 'inactive' ? 'Inactive' : 'Not configured';
  const resolvedSyncLabel = syncLabel ?? pushLabel;
  const resolvedSyncTone = syncTone ?? (pushTone === 'active' ? 'pushed' : pushTone === 'inactive' ? 'outOfSync' : 'unknown');
  return (
    <div className="statusCellWrap">
      <button type="button" className={badgeClass} onClick={onToggle} disabled={disabled} title={title}>
        {statusLabel ?? fallbackLabel}
      </button>
      {onPush ? (
        <button
          type="button"
          className={`statusCellSync statusCellSync-${resolvedSyncTone}`}
          onClick={onPush}
          disabled={pushDisabled ?? disabled}
          title={pushTitle ?? 'External PostgreSQL sync state'}
        >
          {resolvedSyncLabel}
        </button>
      ) : syncLabel ? (
        <span className={`statusCellSync statusCellSync-${resolvedSyncTone}`} title={pushTitle ?? 'External PostgreSQL sync state'}>
          {resolvedSyncLabel}
        </span>
      ) : null}
    </div>
  );
}
