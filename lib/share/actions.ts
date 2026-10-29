'use server';

import { createShare } from './api';
import type { WorkspaceState } from './types';

export async function createShareAction(state: WorkspaceState): Promise<string> {
  return createShare(state);
}
