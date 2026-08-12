'use client';

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmModal({ open, title, description, confirmLabel, onConfirm, onCancel }: ConfirmModalProps) {
  if (!open) return null;
  return (
    <div className="confirmModalBackdrop">
      <div className="confirmModalCard" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <h2 id="confirm-modal-title">{title}</h2>
        <p>{description}</p>
        <div className="confirmModalActions">
          <button type="button" className="confirmModalCancel" onClick={onCancel}>Cancel</button>
          <button type="button" className="confirmModalConfirm" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
