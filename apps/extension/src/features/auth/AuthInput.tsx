import { forwardRef, type ChangeEvent, type InputHTMLAttributes, type ReactNode } from 'react';
import { ClearIcon } from '@/components/svg/ClearIcon';

export { ClearIcon } from '@/components/svg/ClearIcon';
export { UserIcon } from '@/components/svg/UserIcon';
export { LockIcon } from '@/components/svg/LockIcon';
export { EyeIcon } from '@/components/svg/EyeIcon';

export type AuthInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
  label?: string;
  required?: boolean;
  icon?: ReactNode;
  hasError?: boolean;
  errorMessage?: string | null;
  allowClear?: boolean;
  onClear?: () => void;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  trailing?: ReactNode;
  containerClassName?: string;
};

export const AuthInput = forwardRef<HTMLInputElement, AuthInputProps>(({
  label,
  required = false,
  icon,
  hasError = false,
  errorMessage,
  allowClear = true,
  onClear,
  onChange,
  value,
  type = 'text',
  trailing,
  containerClassName = '',
  className = '',
  id,
  placeholder,
  ...inputProps
}, ref) => {
  const showClear = allowClear && Boolean(value && String(value).length > 0);

  const handleClear = () => {
    if (onClear) {
      onClear();
    } else if (onChange) {
      const syntheticEvent = {
        target: { value: '' },
        currentTarget: { value: '' },
      } as ChangeEvent<HTMLInputElement>;
      onChange(syntheticEvent);
    }
  };

  const inputContent = (
    <span className={`extension-input-shell${hasError ? ' has-error' : ''}${className ? ` ${className}` : ''}`}>
      {icon ? (
        <>
          <span className="extension-input-icon" aria-hidden="true">{icon}</span>
          <span className="extension-input-divider" aria-hidden="true" />
        </>
      ) : null}
      <input
        ref={ref}
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        {...inputProps}
      />
      {showClear ? (
        <button
          type="button"
          className="extension-input-clear-btn"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleClear();
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          tabIndex={-1}
          aria-label="Xóa nội dung"
        >
          <ClearIcon />
        </button>
      ) : null}
      {trailing}
    </span>
  );

  if (!label) {
    return (
      <>
        {inputContent}
        {errorMessage ? <p className="auth-field-error">{errorMessage}</p> : null}
      </>
    );
  }

  return (
    <label className={`extension-field-wrap${containerClassName ? ` ${containerClassName}` : ''}`} htmlFor={id}>
      <span className="extension-field-label">
        {label}
        {required ? <span className="required-mark"> *</span> : null}
      </span>
      {inputContent}
      {errorMessage ? <p className="auth-field-error">{errorMessage}</p> : null}
    </label>
  );
});

AuthInput.displayName = 'AuthInput';
