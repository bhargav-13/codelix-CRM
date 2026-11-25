// Class-name helpers, the same two AlignUI components are written against:
//   cn(...)  – clsx + tailwind-merge (later classes win over earlier ones)
//   tv(...)  – tailwind-variants, taught about the AlignUI text/shadow/radius tokens
import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { createTV } from 'tailwind-variants';

const TEXT = ['title-h1', 'title-h2', 'title-h3', 'title-h4', 'title-h5', 'title-h6',
  'label-xl', 'label-lg', 'label-md', 'label-sm', 'label-xs', 'label-2xs',
  'paragraph-xl', 'paragraph-lg', 'paragraph-md', 'paragraph-sm', 'paragraph-xs',
  'subheading-md', 'subheading-sm', 'subheading-xs', 'subheading-2xs', 'doc-label', 'doc-paragraph'];
const SHADOW = ['regular-xs', 'regular-sm', 'regular-md', 'regular-lg', 'focus-ring', 'tooltip',
  'button-primary-focus', 'button-important-focus', 'button-error-focus', 'toggle-switch', 'switch-thumb'];
const RADIUS = ['10', '12', '16', '20'];

export const twMergeConfig = {
  extend: {
    classGroups: {
      'font-size': [{ text: TEXT }],
      shadow: [{ shadow: SHADOW }],
      rounded: [{ rounded: RADIUS }],
    },
  },
};

const twMerge = extendTailwindMerge(twMergeConfig);
export const cn = (...classes) => twMerge(clsx(...classes));
// tailwind-variants merges with the same token-aware function
export const tv = createTV({ twMerge });
