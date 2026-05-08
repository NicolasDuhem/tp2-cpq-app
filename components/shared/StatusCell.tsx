'use client';

type StatusCellProps = {
  status: 'active' | 'inactive' | 'not_configured';
  onToggle: () => void;
  onPush: () => void;
  disabled?: boolean;
  pushDisabled?: boolean;
  statusLabel?: string;
  pushLabel?: string;
  title?: string;
  pushTitle?: string;
};

export default function StatusCell({ status, onToggle, onPush, disabled, pushDisabled, statusLabel, pushLabel = 'Push', title, pushTitle }: StatusCellProps) {
  const badgeClass = status === 'active' ? 'statusCellBadge statusCellActive' : status === 'inactive' ? 'statusCellBadge statusCellInactive' : 'statusCellBadge statusCellNotConfigured';
  const fallbackLabel = status === 'active' ? 'Active' : status === 'inactive' ? 'Inactive' : 'Not configured';
  return (
    <div className="statusCellWrap">
      <button type="button" className={badgeClass} onClick={onToggle} disabled={disabled} title={title}>
        {statusLabel ?? fallbackLabel}
      </button>
      <button type="button" className="statusCellPush" onClick={onPush} disabled={pushDisabled ?? disabled} title={pushTitle}>
        {pushLabel}
      </button>
    </div>
  );
}
