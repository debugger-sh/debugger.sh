import type { Lang } from '@/components/constants';

/** Serializable workspace snapshot stored in `shares.state`. Extend freely. */
export type WorkspaceState = {
  lang: Lang;
  code: string;
};
