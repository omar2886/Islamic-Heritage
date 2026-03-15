import { caseDraftSchema, type CaseDraft } from '../../entities/case-draft/schema'

export type StoredStepId =
  | 'profile'
  | 'closest-family'
  | 'extended-family'
  | 'review'

export interface StoredWorkspaceState {
  draft: CaseDraft
  step: StoredStepId
}

const STORAGE_KEY = 'heritage.ui-next.workspace.v1'
const allowedSteps = new Set<StoredStepId>([
  'profile',
  'closest-family',
  'extended-family',
  'review',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function persistWorkspaceState(state: StoredWorkspaceState): void {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function restoreWorkspaceState(): StoredWorkspaceState | null {
  if (typeof window === 'undefined') return null

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed) || !('draft' in parsed) || !('step' in parsed)) {
      return null
    }

    const draft = caseDraftSchema.safeParse(parsed.draft)
    const step = parsed.step

    if (!draft.success || typeof step !== 'string' || !allowedSteps.has(step as StoredStepId)) {
      return null
    }

    return {
      draft: draft.data,
      step: step as StoredStepId,
    }
  } catch {
    return null
  }
}

export function clearWorkspaceState(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}
