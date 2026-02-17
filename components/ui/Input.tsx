import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

interface BaseInputProps {
  label: string;
  error?: string;
  helpText?: string;
}

type TextInputProps = BaseInputProps &
  InputHTMLAttributes<HTMLInputElement> & {
    as?: "input";
  };

type TextareaProps = BaseInputProps &
  TextareaHTMLAttributes<HTMLTextAreaElement> & {
    as: "textarea";
  };

type InputProps = TextInputProps | TextareaProps;

const Input = forwardRef<HTMLInputElement | HTMLTextAreaElement, InputProps>(
  ({ label, error, helpText, className = "", ...props }, ref) => {
    const id = props.id || props.name || label.toLowerCase().replace(/\s+/g, "-");
    const isTextarea = props.as === "textarea";

    const inputClasses = [
      "w-full px-4 py-3 rounded-xl border text-base",
      "placeholder:text-gray-400",
      "transition-colors duration-200",
      "focus:outline-none focus:ring-2 focus:border-transparent",
      "min-h-[44px]", // WCAG touch target
      error
        ? "border-red-400 focus:ring-red-500"
        : "border-gray-300 focus:ring-primary-500",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    // Remove 'as' from props before spreading
    const { as: _as, ...restProps } = props as TextareaProps;
    void _as;

    return (
      <div className="space-y-1.5">
        <label htmlFor={id} className="block text-base font-medium text-gray-700">
          {label}
        </label>

        {isTextarea ? (
          <textarea
            ref={ref as React.Ref<HTMLTextAreaElement>}
            id={id}
            className={inputClasses}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : helpText ? `${id}-help` : undefined}
            {...(restProps as TextareaHTMLAttributes<HTMLTextAreaElement>)}
          />
        ) : (
          <input
            ref={ref as React.Ref<HTMLInputElement>}
            id={id}
            className={inputClasses}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : helpText ? `${id}-help` : undefined}
            {...(restProps as InputHTMLAttributes<HTMLInputElement>)}
          />
        )}

        {error && (
          <p id={`${id}-error`} className="text-red-600 text-base" role="alert">
            {error}
          </p>
        )}

        {helpText && !error && (
          <p id={`${id}-help`} className="text-gray-500 text-base">
            {helpText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;
