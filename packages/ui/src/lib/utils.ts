// Class-name merging for the design system's components (shadcn's `cn`: clsx plus tailwind-merge), taught the theme's
// text sizes (DS-13). Without them it took `text-small` or `text-title` for a color, so merging one dropped an
// element's text color, as a small danger button's red, and kept two sizes where the later should replace the other.

import { createCn } from "cn/config";

import { textSizes } from "../styles/text-sizes";

export const cn = createCn({ extend: { theme: { text: [...textSizes] } } });
