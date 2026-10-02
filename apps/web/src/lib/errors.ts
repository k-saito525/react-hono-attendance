import { isHttpError } from './api'

/** 画面に入る前の権限チェックで投げる。errorComponent で「権限がありません」を表示する */
export class ForbiddenError extends Error {
  constructor() {
    super('権限がありません')
    this.name = 'ForbiddenError'
  }
}

/**
 * 権限不足か。
 * 画面に入る前のチェック（ForbiddenError）と、API の 403 の両方を同じ扱いにする。
 * 後者は、表示中に権限が外された場合などに起こる。
 */
export const isForbidden = (error: unknown) =>
  error instanceof ForbiddenError || isHttpError(error, 403)
