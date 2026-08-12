'use client';

import { useEffect, useRef, useState } from 'react';

type MultiSelectDropdownProps = {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder: string;
};

export default function MultiSelectDropdown({ options, selected, onChange, placeholder }: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const toggle = (option: string, checked: boolean) => {
    onChange(checked ? [...selected, option] : selected.filter((value) => value !== option));
  };

  return (
    <div className="multiSelectDropdown" ref={rootRef}>
      <button type="button" className="multiSelectTrigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {selected.length === 0 ? placeholder : `${selected.length} selected`}
      </button>
      {open ? (
        <div className="multiSelectPanel">
          {options.map((option) => {
            const checked = selected.includes(option);
            return (
              <label key={option} className="multiSelectOption">
                <input type="checkbox" checked={checked} onChange={(event) => toggle(option, event.target.checked)} />
                <span>{option}</span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
