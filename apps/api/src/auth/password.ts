import { hash, verify } from '@node-rs/argon2'

/** argon2id でハッシュ化する（@node-rs/argon2 の既定は argon2id） */
export const hashPassword = (password: string) => hash(password)

/**
 * 存在しないユーザーのときに照合させるダミーのハッシュ。
 * 初回に1回だけ計算して使い回す。
 */
let dummyHash: Promise<string> | undefined
const getDummyHash = () => {
  dummyHash ??= hash('dummy-password-for-timing')
  return dummyHash
}

/**
 * パスワードを照合する。
 *
 * ユーザーが存在しない場合（storedHash が null）でも、ダミーのハッシュで照合を走らせる。
 * argon2 は意図的に遅いので、存在しないメールのときだけ照合を省くと応答が明らかに速くなり、
 * 「そのメールアドレスが登録されているか」が応答時間から分かってしまう（ユーザー列挙）。
 */
export const verifyPassword = async (
  storedHash: string | null,
  password: string,
): Promise<boolean> => {
  if (storedHash === null) {
    await verify(await getDummyHash(), password)
    return false
  }
  return verify(storedHash, password)
}
