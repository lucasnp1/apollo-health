// The recovery codes from sign-up, handed to the screen that shows them once.
let codes: string[] = []
export const setCodes = (c: string[]) => void (codes = c)
export const takeCodes = () => {
  const c = codes
  codes = []
  return c
}
