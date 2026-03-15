import { beforeEach, describe, expect, it } from 'vitest'
import { createInitialDraft } from '../../../entities/case-draft/createInitialDraft'
import {
  clearWorkspaceState,
  persistWorkspaceState,
  restoreWorkspaceState,
} from '../storage'

describe('workspace storage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('persiste y restaura un estado valido del builder', () => {
    const draft = createInitialDraft()
    draft.causante.sex = 'female'

    persistWorkspaceState({
      draft,
      step: 'review',
    })

    expect(restoreWorkspaceState()).toEqual({
      draft,
      step: 'review',
    })
  })

  it('descarta contenido corrupto o incompatible', () => {
    window.localStorage.setItem(
      'heritage.ui-next.workspace.v1',
      JSON.stringify({
        draft: { bad: true },
        step: 'x',
      }),
    )

    expect(restoreWorkspaceState()).toBeNull()
  })

  it('limpia el almacenamiento local cuando se solicita', () => {
    persistWorkspaceState({
      draft: createInitialDraft(),
      step: 'profile',
    })

    clearWorkspaceState()
    expect(restoreWorkspaceState()).toBeNull()
  })
})
