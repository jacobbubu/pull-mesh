const regExpChars = [
  // order matters for these
  '-',
  '[',
  ']',
  // order doesn't matter for any of these
  '/',
  '{',
  '}',
  '(',
  ')',
  '*',
  '+',
  '?',
  '.',
  '\\',
  '^',
  '$',
  '|',
]

const regex = RegExp('[' + regExpChars.join('\\') + ']', 'g')

export function escapeRegExp(str: string) {
  return str.replace(regex, '\\$&')
}
