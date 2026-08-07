
import type { LayoutFrame } from '../src/render/layout';
import type { UiRect } from '../src/render/ui-probe';

declare global {
  interface Window {
    __uiAudit?: {
      rects: Array<UiRect & { source?: string; synthetic?: boolean }>;
      synthetic?: boolean;
      frame?: LayoutFrame | null;
    };
  }
}
