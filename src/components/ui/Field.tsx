import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

const inputClassName = 'ui-input px-(--input-padding-x) py-(--input-padding-y) type-body';

const selectClassName = `${inputClassName} ui-select`;

export function FieldLabel({
  children,
  htmlFor,
  hint,
}: {
  children: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
}) {
  return (
    <div className="ui-field-row">
      <label htmlFor={htmlFor} className="type-heading">
        {children}
      </label>
      {hint ? <p className="type-caption">{hint}</p> : null}
    </div>
  );
}

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClassName} ${className}`.trim()} {...props} />;
}

export function SelectInput({
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${selectClassName} ${className}`.trim()} {...props}>
      {children}
    </select>
  );
}

export function TextArea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`${inputClassName} resize-y py-3 type-body-lg ${className}`.trim()}
      {...props}
    />
  );
}

export function MonoTextArea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`${inputClassName} ui-input-mono resize-y py-3 ${className}`.trim()}
      {...props}
    />
  );
}

export function FieldError({ children }: { children: ReactNode }) {
  if (!children) {
    return null;
  }

  return <p className="ui-alert-danger">{children}</p>;
}

export function FieldDivider() {
  return <div className="ui-divider" />;
}

export function ChipButton({
  active,
  onClick,
  children,
  className = '',
  disabled = false,
  title,
  'data-testid': dataTestId,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
  'data-testid'?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={dataTestId}
      data-active={active ? 'true' : 'false'}
      className={`ui-chip ${className}`.trim()}
    >
      {children}
    </button>
  );
}

/** On/off option styled as a switch (role="switch") — distinct from pick-one chips. */
export function SwitchButton({
  checked,
  onChange,
  children,
  className = '',
  disabled = false,
  title,
  'data-testid': dataTestId,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
  'data-testid'?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      title={title}
      data-testid={dataTestId}
      data-active={checked ? 'true' : 'false'}
      className={`ui-switch ${className}`.trim()}
    >
      <span className="ui-switch-track" aria-hidden="true" />
      {children}
    </button>
  );
}
