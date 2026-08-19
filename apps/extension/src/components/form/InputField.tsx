import { useId, useState, type ChangeEventHandler, type FocusEvent, type InputHTMLAttributes, type ReactNode } from 'react';

type InputFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'onChange' | 'required'> & {
  label: string;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  required?: boolean;
  error?: string;
  containerClassName?: string;
  inputWrapperClassName?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Strip all whitespace from the value as the user types. */
  stripWhitespace?: boolean;
};

export function InputField({
  label,
  value,
  onChange,
  required = false,
  maxLength,
  error,
  className = '',
  containerClassName = '',
  inputWrapperClassName = '',
  leading,
  trailing,
  stripWhitespace = false,
  onBlur,
  ...inputProps
}: InputFieldProps) {
  const generatedId = useId();
  const [touched, setTouched] = useState(false);
  const inputId = inputProps.name ? `${inputProps.name}-${generatedId}` : generatedId;
  const internalError = touched
    ? required && !value.trim()
      ? `${label} là bắt buộc, không được để trống`
      : maxLength !== undefined && value.length > maxLength
        ? `Vui lòng nhập tối đa ${maxLength} ký tự`
        : undefined
    : undefined;
  const displayedError = error || internalError;

  const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    let next = event.target.value.trim();
    if (stripWhitespace) next = next.replace(/\s+/g, '');
    event.target.value = next;
    onChange(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    setTouched(true);
    onBlur?.(event);
  };

  return (
    <div className={`input-field${containerClassName ? ` ${containerClassName}` : ''}`}>
      <label className="input-field-label" htmlFor={inputId}>
        {label}
        {required ? <span className="input-field-required" aria-hidden="true">*</span> : null}
      </label>
      <span className={`input-field-control-wrap${inputWrapperClassName ? ` ${inputWrapperClassName}` : ''}${leading ? ' has-leading' : ''}${trailing ? ' has-trailing' : ''}`}>
        {leading}
        <input
          {...inputProps}
          id={inputId}
          className={`input-field-control${className ? ` ${className}` : ''}${displayedError ? ' has-error' : ''}`}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          maxLength={maxLength}
          required={required}
          aria-invalid={Boolean(displayedError)}
          aria-describedby={displayedError ? `${inputId}-error` : undefined}
        />
        {trailing}
      </span>
      {displayedError ? <p className="input-field-error" id={`${inputId}-error`}>{displayedError}</p> : null}
    </div>
  );
}
