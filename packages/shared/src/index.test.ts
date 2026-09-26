import { describe, expect, it } from 'vitest'
import { healthSchema, ROLES } from './index'

describe('healthSchema', () => {
  it('正しい形を受け付ける', () => {
    const value = { status: 'ok', service: 'attendance-api', time: '2026-09-27T00:00:00.000Z' }
    expect(healthSchema.parse(value)).toEqual(value)
  })

  it('status が ok 以外なら拒否する', () => {
    expect(healthSchema.safeParse({ status: 'ng', service: 'x', time: 'x' }).success).toBe(false)
  })
})

describe('ROLES', () => {
  it('employee と admin の2つ', () => {
    expect(ROLES).toEqual(['employee', 'admin'])
  })
})
