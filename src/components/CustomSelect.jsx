import React, { useState, useRef, useEffect } from 'react';

export default function CustomSelect({
  value,
  onChange,
  options = [],       // [{ value, label }] or [{ group, options: [{ value, label }] }]
  placeholder = '请选择',
  disabled = false,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const listRef = useRef(null);

  // 点击外部关闭
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // 获取当前选中项的 label
  const getLabel = () => {
    if (!value) return placeholder;
    for (const opt of options) {
      if (opt.group) {
        const found = opt.options.find(o => o.value === value);
        if (found) return found.label;
      } else {
        if (opt.value === value) return opt.label;
      }
    }
    return placeholder;
  };

  const handleSelect = (val) => {
    onChange({ target: { value: val } });
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!disabled) setOpen(prev => !prev);
    }
    if (e.key === 'Escape') setOpen(false);
  };

  const hasValue = value !== '' && value !== undefined && value !== null;

  return (
    <div
      className={`custom-select ${open ? 'open' : ''} ${disabled ? 'disabled' : ''} ${className}`}
      ref={ref}
    >
      <div
        className="custom-select-trigger"
        onClick={() => { if (!disabled) setOpen(prev => !prev); }}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={`custom-select-value ${!hasValue ? 'placeholder' : ''}`}>
          {getLabel()}
        </span>
        <span className="custom-select-arrow">
          <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
            <path d="M1.41 0L6 4.58L10.59 0L12 1.41L6 7.41L0 1.41L1.41 0Z" fill="currentColor"/>
          </svg>
        </span>
      </div>

      {open && !disabled && (
        <div className="custom-select-dropdown" role="listbox" ref={listRef}>
          <div className="custom-select-dropdown-inner">
            {options.map((opt, idx) => {
              if (opt.group) {
                return (
                  <div key={idx} className="custom-select-group">
                    <div className="custom-select-group-label">{opt.group}</div>
                    {opt.options.map(sub => (
                      <div
                        key={sub.value}
                        className={`custom-select-option ${sub.value === value ? 'selected' : ''}`}
                        role="option"
                        aria-selected={sub.value === value}
                        onClick={() => handleSelect(sub.value)}
                      >
                        {sub.label}
                        {sub.value === value && (
                          <svg className="custom-select-check" width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M11.6666 3.5L5.24992 9.91667L2.33325 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    ))}
                  </div>
                );
              }
              return (
                <div
                  key={opt.value}
                  className={`custom-select-option ${opt.value === value ? 'selected' : ''}`}
                  role="option"
                  aria-selected={opt.value === value}
                  onClick={() => handleSelect(opt.value)}
                >
                  {opt.label}
                  {opt.value === value && (
                    <svg className="custom-select-check" width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M11.6666 3.5L5.24992 9.91667L2.33325 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
