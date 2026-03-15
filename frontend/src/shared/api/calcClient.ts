import type { CalcOutput, CalcPayload } from '../../entities/calculation/schema'
import {
  calcPayloadSchema,
  calcResponseSchema,
} from '../../entities/calculation/schema'
import { mapResponseToViewModel } from '../../entities/calculation/mappers/responseToViewModel'
import { mapDraftToPayload } from '../../entities/case-draft/mappers/draftToPayload'
import type { CaseDraft } from '../../entities/case-draft/schema'
import type { ResultsViewModel } from '../../entities/calculation/mappers/responseToViewModel'

export interface CalculationResult {
  payload: CalcPayload
  rawOutput: CalcOutput
  viewModel: ResultsViewModel
}

export class CalculationClientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CalculationClientError'
  }
}

function resolveAppBaseUrl(pathname: string): string {
  const publicMarker = '/public'
  const publicIndex = pathname.indexOf(publicMarker)
  const basePath =
    publicIndex >= 0
      ? pathname.slice(0, publicIndex + publicMarker.length)
      : pathname

  const normalizedPath = basePath.endsWith('/') ? basePath : `${basePath}/`
  return `${window.location.origin}${normalizedPath}`
}

export function resolveCalcEndpoint(pathname = window.location.pathname): string {
  return new URL('api/calc.php', resolveAppBaseUrl(pathname)).toString()
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const body = await response.text()

  if (body.trim() === '') {
    throw new CalculationClientError('El servidor ha devuelto una respuesta vacia.')
  }

  try {
    return JSON.parse(body) as unknown
  } catch {
    if (!response.ok) {
      throw new CalculationClientError(
        `El backend ha respondido con ${response.status}, pero no ha devuelto JSON valido.`,
      )
    }

    throw new CalculationClientError(
      'El backend ha devuelto una respuesta no valida para la UI.',
    )
  }
}

export function buildPayloadFromDraft(draft: CaseDraft): CalcPayload {
  return calcPayloadSchema.parse(mapDraftToPayload(draft))
}

export async function calculateInheritance(
  draft: CaseDraft,
): Promise<CalculationResult> {
  const payload = buildPayloadFromDraft(draft)

  const response = await fetch(resolveCalcEndpoint(), {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const json = await parseJsonResponse(response)
  const parsedResponse = calcResponseSchema.safeParse(json)

  if (!parsedResponse.success) {
    throw new CalculationClientError(
      'La respuesta del motor no cumple el contrato esperado por ui-next.',
    )
  }

  if (!parsedResponse.data.ok) {
    throw new CalculationClientError(parsedResponse.data.error)
  }

  return {
    payload,
    rawOutput: parsedResponse.data.output,
    viewModel: mapResponseToViewModel(parsedResponse.data.output),
  }
}
