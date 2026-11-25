/* eslint-disable react-refresh/only-export-components */
// Text input — AlignUI Input shape (Root › Wrapper › Icon + Input), plus a
// one-line <TextInput> for the common case.
//   <TextInput leftIcon={RiMailLine} type="email" name="email" hasError={!!err} />
//   <Textarea rows={4} />
import { tv } from './cn';

export const inputVariants = tv({
  slots: {
    root: [
      'group relative flex w-full overflow-hidden bg-bg-white-0 text-text-strong-950 shadow-regular-xs',
      'ring-1 ring-inset ring-stroke-soft-200 transition-[box-shadow,background-color] duration-150 ease-out',
      'hover:not-focus-within:bg-bg-weak-25 hover:not-focus-within:ring-stroke-sub-300',
      'focus-within:ring-2 focus-within:ring-primary-logo focus-within:shadow-[0_0_0_4px_var(--color-primary-alpha-16)]',
      'has-disabled:pointer-events-none has-disabled:bg-bg-weak-50 has-disabled:shadow-none has-disabled:ring-transparent',
    ],
    wrapper: 'flex w-full min-w-0 items-center gap-2 px-3',
    input: [
      'h-full w-full min-w-0 bg-transparent text-paragraph-sm text-text-strong-950 outline-none',
      'placeholder:text-text-soft-400 disabled:text-text-disabled-300',
      // browser autofill: never let the browser paint its own box inside the field (the delay
      // keeps its background from ever arriving), so the field stays one colour edge to edge
      'autofill:[transition:background-color_99999s_ease-out_99999s] autofill:[-webkit-text-fill-color:var(--color-text-strong-950)] autofill:[caret-color:var(--color-text-strong-950)]',
    ],
    icon: 'flex size-5 shrink-0 items-center justify-center text-text-soft-400 transition-colors duration-150 group-focus-within:text-primary-text',
    affix: 'shrink-0 text-paragraph-sm text-text-sub-600',
  },
  variants: {
    size: {
      medium: { root: 'h-10 rounded-10' },
      small: { root: 'h-9 rounded-lg', wrapper: 'px-2.5' },
      xsmall: { root: 'h-8 rounded-lg', wrapper: 'px-2' },
    },
    hasError: {
      true: { root: 'ring-red-500 hover:not-focus-within:ring-red-500 focus-within:ring-red-500 focus-within:shadow-[0_0_0_4px_var(--color-red-alpha-16)]', icon: 'group-focus-within:text-(--bad)' },
    },
  },
  defaultVariants: { size: 'medium' },
});

function InputRoot({ size, hasError, className, children, ...rest }) {
  const { root } = inputVariants({ size, hasError });
  return <div className={root({ class: className })} {...rest}>{children}</div>;
}
function InputWrapper({ size, className, children, ...rest }) {
  const { wrapper } = inputVariants({ size });
  return <div className={wrapper({ class: className })} {...rest}>{children}</div>;
}
function InputIcon({ as: Comp = 'span', hasError, className, children, ...rest }) {
  const { icon } = inputVariants({ hasError });
  return <Comp className={icon({ class: className })} {...rest}>{children}</Comp>;
}
function InputAffix({ className, children, ...rest }) {
  const { affix } = inputVariants();
  return <span className={affix({ class: className })} {...rest}>{children}</span>;
}
function InputEl({ className, type = 'text', ref, ...rest }) {
  const { input } = inputVariants();
  return <input ref={ref} type={type} className={input({ class: className })} {...rest} />;
}

export function TextInput({ size, hasError, leftIcon: Left, right, className, inputClassName, ref, ...rest }) {
  return (
    <InputRoot size={size} hasError={hasError} className={className}>
      <InputWrapper size={size}>
        {Left && <InputIcon hasError={hasError}><Left size={18} aria-hidden="true" /></InputIcon>}
        <InputEl ref={ref} aria-invalid={hasError || undefined} className={inputClassName} {...rest} />
      </InputWrapper>
      {right && <div className="flex shrink-0 items-center pr-1.5">{right}</div>}
    </InputRoot>
  );
}

const textareaClass = tv({
  base: [
    'block w-full min-h-24 resize-y rounded-10 bg-bg-white-0 px-3 py-2.5 text-paragraph-sm text-text-strong-950 shadow-regular-xs outline-none',
    'ring-1 ring-inset ring-stroke-soft-200 transition-[box-shadow,background-color] duration-150 ease-out',
    'placeholder:text-text-soft-400 hover:not-focus:bg-bg-weak-25 hover:not-focus:ring-stroke-sub-300',
    'focus:ring-2 focus:ring-primary-logo focus:shadow-[0_0_0_4px_var(--color-primary-alpha-16)]',
    'disabled:pointer-events-none disabled:bg-bg-weak-50 disabled:text-text-disabled-300 disabled:shadow-none disabled:ring-transparent',
  ],
  variants: { hasError: { true: 'ring-red-500 hover:not-focus:ring-red-500 focus:ring-red-500 focus:shadow-[0_0_0_4px_var(--color-red-alpha-16)]' } },
});
export function Textarea({ hasError, className, ref, ...rest }) {
  return <textarea ref={ref} aria-invalid={hasError || undefined} className={textareaClass({ hasError, class: className })} {...rest} />;
}

export const Input = Object.assign(TextInput, { Root: InputRoot, Wrapper: InputWrapper, Icon: InputIcon, Affix: InputAffix, Input: InputEl });
export { InputRoot as Root, InputWrapper as Wrapper, InputIcon as Icon, InputAffix as Affix, InputEl };
export default Input;
