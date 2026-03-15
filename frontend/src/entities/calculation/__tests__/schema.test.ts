import { describe, expect, it } from 'vitest'
import { calcPayloadSchema, calcResponseSchema } from '../schema'

describe('B-003 schema: calc.php response contract', () => {
  it('rechaza payloads vacios, cantidades no enteras y monedas invalidas', () => {
    expect(() => calcPayloadSchema.parse({ heirs: [] })).toThrow()

    expect(() =>
      calcPayloadSchema.parse({
        heirs: [{ role: 'son', count: 1.5 }],
      }),
    ).toThrow()

    expect(() =>
      calcPayloadSchema.parse({
        heirs: [{ role: 'son', count: 1 }],
        currency: 'eur',
      }),
    ).toThrow()

    expect(() =>
      calcPayloadSchema.parse({
        heirs: [{ role: 'son', count: 1 }],
        estate_value: 1_000_000_000_000_000_000,
      }),
    ).toThrow()
  })

  it('acepta estate_value numerico mientras siga el formato real del backend', () => {
    expect(() =>
      calcPayloadSchema.parse({
        heirs: [{ role: 'daughter', count: 2 }],
        estate_value: 125000.123456,
      }),
    ).not.toThrow()
  })

  it('rechaza acumulados por rol que superan el limite del backend', () => {
    expect(() =>
      calcPayloadSchema.parse({
        heirs: [
          { role: 'son', count: 60 },
          { role: 'son', count: 41 },
        ],
      }),
    ).toThrow()
  })

  it('rechaza decedentId por encima del maximo permitido en calc.php', () => {
    expect(() =>
      calcPayloadSchema.parse({
        heirs: [{ role: 'mother', count: 1 }],
        ui_meta: {
          decedentId: 'P123456789012345678901234567890123',
        },
      }),
    ).toThrow()
  })

  it('acepta respuestas del backend con roles normalizados en plural', () => {
    const backendResponse = {
      ok: true,
      output: {
        input: {
          heirs: [
            { role: 'wives', count: 1 },
            { role: 'mother', count: 1 },
            { role: 'son', count: 2 },
          ],
          estate_value: '120000',
          currency: 'EUR',
        },
        shares: {
          final: {
            groups: {
              mother: '1/6',
              sons: '17/24',
              wife: '1/8',
            },
            individuals: {
              mother: ['1/6'],
              sons: ['17/48', '17/48'],
              wife: ['1/8'],
            },
          },
        },
        warnings: [
          "merged 'wife' and 'wives' entries into canonical 'wives' group",
        ],
      },
    }

    expect(() => calcResponseSchema.parse(backendResponse)).not.toThrow()
  })
})
