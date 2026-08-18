import { forwardRef, type ChangeEvent, type InputHTMLAttributes, type ReactNode } from 'react';

export type AuthInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
  label?: string;
  required?: boolean;
  icon?: ReactNode;
  hasError?: boolean;
  allowClear?: boolean;
  onClear?: () => void;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  trailing?: ReactNode;
  containerClassName?: string;
};

export function ClearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 4L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UserIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C10.6739 2 9.40215 2.52678 8.46447 3.46447C7.52678 4.40215 7 5.67392 7 7C7 8.32608 7.52678 9.59785 8.46447 10.5355C9.40215 11.4732 10.6739 12 12 12C13.3261 12 14.5979 11.4732 15.5355 10.5355C16.4732 9.59785 17 8.32608 17 7C17 5.67392 16.4732 4.40215 15.5355 3.46447C14.5979 2.52678 13.3261 2 12 2ZM4 22H20C20.55 22 21 21.55 21 21V20C21 16.14 17.86 13 14 13H10C6.14 13 3 16.14 3 20V21C3 21.55 3.45 22 4 22Z" fill="currentColor" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 22C5.45 22 4.97933 21.8043 4.588 21.413C4.19667 21.0217 4.00067 20.5507 4 20V10C4 9.45 4.196 8.97933 4.588 8.588C4.98 8.19667 5.45067 8.00067 6 8H7V6C7 4.61667 7.48767 3.43767 8.463 2.463C9.43833 1.48833 10.6173 1.00067 12 1C13.3827 0.999334 14.562 1.487 15.538 2.463C16.514 3.439 17.0013 4.618 17 6V8H18C18.55 8 19.021 8.196 19.413 8.588C19.805 8.98 20.0007 9.45067 20 10V20C20 20.55 19.8043 21.021 19.413 21.413C19.0217 21.805 18.5507 22.0007 18 22H6ZM6 20H18V10H6V20ZM13.413 16.412C13.8043 16.0213 14 15.5507 14 15C14 14.4493 13.8043 13.9787 13.413 13.588C13.0217 13.1973 12.5507 13.0013 12 13C11.4493 12.9987 10.9787 13.1947 10.588 13.588C10.1973 13.9813 10.0013 14.452 10 15C9.99867 15.548 10.1947 16.019 10.588 16.413C10.9813 16.807 11.452 17.0027 12 17C12.548 16.9973 13.019 16.8007 13.413 16.412ZM9 8H15V6C15 5.16667 14.7083 4.45833 14.125 3.875C13.5417 3.29167 12.8333 3 12 3C11.1667 3 10.4583 3.29167 9.875 3.875C9.29167 4.45833 9 5.16667 9 6V8Z" fill="currentColor" />
    </svg>
  );
}

export function EyeIcon({ visible }: { visible: boolean }) {
  if (visible) {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" clipRule="evenodd" d="M10 16.5C14.897 16.5 19 14.192 19 11C19 7.808 14.897 5.5 10 5.5C5.103 5.5 1 7.808 1 11C1 14.192 5.103 16.5 10 16.5ZM10 7.5C13.94 7.5 17 9.222 17 11C17 12.778 13.94 14.5 10 14.5C6.06 14.5 3 12.778 3 11C3 9.222 6.06 7.5 10 7.5Z" fill="currentColor" />
        <path fillRule="evenodd" clipRule="evenodd" d="M10 14C10.9283 14 11.8185 13.6313 12.4749 12.9749C13.1313 12.3185 13.5 11.4283 13.5 10.5C13.5 9.57174 13.1313 8.6815 12.4749 8.02513C11.8185 7.36875 10.9283 7 10 7C9.07174 7 8.1815 7.36875 7.52513 8.02513C6.86875 8.6815 6.5 9.57174 6.5 10.5C6.5 11.4283 6.86875 12.3185 7.52513 12.9749C8.1815 13.6313 9.07174 14 10 14ZM10 9C10.3978 9 10.7794 9.15804 11.0607 9.43934C11.342 9.72064 11.5 10.1022 11.5 10.5C11.5 10.8978 11.342 11.2794 11.0607 11.5607C10.7794 11.842 10.3978 12 10 12C9.60218 12 9.22064 11.842 8.93934 11.5607C8.65804 11.2794 8.5 10.8978 8.5 10.5C8.5 10.1022 8.65804 9.72064 8.93934 9.43934C9.22064 9.15804 9.60218 9 10 9Z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3.0498 9.30995C3.00729 9.18301 2.9907 9.04882 3.00102 8.91534C3.01134 8.78187 3.04836 8.65183 3.10987 8.53292C3.17139 8.41402 3.25615 8.30868 3.35914 8.22315C3.46213 8.13762 3.58124 8.07363 3.70941 8.03499C3.83759 7.99635 3.97222 7.98384 4.10532 7.9982C4.23842 8.01256 4.36728 8.0535 4.48427 8.11859C4.60125 8.18369 4.70397 8.2716 4.78634 8.37714C4.86871 8.48267 4.92906 8.60366 4.9638 8.73295C7.0498 15.719 16.9458 15.72 19.0338 8.73695C19.0712 8.61102 19.1331 8.49368 19.2159 8.39165C19.2986 8.28962 19.4007 8.2049 19.5162 8.14231C19.6317 8.07972 19.7584 8.0405 19.8891 8.02689C20.0198 8.01327 20.1519 8.02553 20.2778 8.06295C20.4037 8.10038 20.5211 8.16225 20.6231 8.24502C20.7251 8.32779 20.8099 8.42985 20.8724 8.54536C20.935 8.66088 20.9742 8.78759 20.9879 8.91826C21.0015 9.04894 20.9892 9.18102 20.9518 9.30695C20.5882 10.5582 19.9711 11.7213 19.1388 12.724L20.4138 14C20.596 14.1886 20.6967 14.4412 20.6945 14.7034C20.6922 14.9656 20.587 15.2164 20.4016 15.4018C20.2162 15.5872 19.9654 15.6923 19.7032 15.6946C19.441 15.6969 19.1884 15.5961 18.9998 15.414L17.6888 14.103C16.9814 14.6367 16.1998 15.0642 15.3688 15.372L15.7258 16.707C15.7639 16.835 15.7759 16.9694 15.7612 17.1022C15.7465 17.2349 15.7053 17.3634 15.6401 17.48C15.5749 17.5966 15.487 17.699 15.3816 17.7811C15.2762 17.8631 15.1554 17.9233 15.0264 17.9579C14.8974 17.9925 14.7627 18.0009 14.6304 17.9826C14.498 17.9643 14.3707 17.9197 14.2559 17.8514C14.1411 17.783 14.0411 17.6924 13.9619 17.5848C13.8827 17.4772 13.8259 17.3549 13.7948 17.225L13.4308 15.868C12.4838 16.008 11.5158 16.008 10.5688 15.868L10.2048 17.225C10.1737 17.3549 10.1168 17.4772 10.0376 17.5848C9.95845 17.6924 9.8585 17.783 9.7437 17.8514C9.6289 17.9197 9.50157 17.9643 9.36923 17.9826C9.2369 18.0009 9.10224 17.9925 8.97321 17.9579C8.84418 17.9233 8.72339 17.8631 8.61797 17.7811C8.51256 17.699 8.42466 17.5966 8.35947 17.48C8.29427 17.3634 8.2531 17.2349 8.23839 17.1022C8.22367 16.9694 8.23571 16.835 8.2738 16.707L8.6308 15.372C7.79974 15.0639 7.01815 14.636 6.3108 14.102L5.0008 15.414C4.81329 15.6017 4.55887 15.7073 4.2935 15.7075C4.02814 15.7077 3.77357 15.6025 3.5858 15.415C3.39802 15.2274 3.29243 14.973 3.29224 14.7077C3.29205 14.4423 3.39729 14.1877 3.5848 14L4.8598 12.725C4.0758 11.789 3.4498 10.651 3.0478 9.31095L3.0498 9.30995Z" fill="currentColor" />
    </svg>
  );
}

export const AuthInput = forwardRef<HTMLInputElement, AuthInputProps>(({
  label,
  required = false,
  icon,
  hasError = false,
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
    return inputContent;
  }

  return (
    <label className={`extension-field-wrap${containerClassName ? ` ${containerClassName}` : ''}`} htmlFor={id}>
      <span className="extension-field-label">
        {label}
        {required ? <span className="required-mark"> *</span> : null}
      </span>
      {inputContent}
    </label>
  );
});

AuthInput.displayName = 'AuthInput';
