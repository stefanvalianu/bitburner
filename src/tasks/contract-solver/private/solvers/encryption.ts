export function caesarCipher([text, shift]: [string, number]): string {
  return text
    .split("")
    .map((char) => {
      if (char === " ") return char;

      return String.fromCharCode(((char.charCodeAt(0) - 65 - shift + 26) % 26) + 65);
    })
    .join("");
}

export function vigenereCipher([text, keyword]: [string, string]): string {
  return text
    .split("")
    .map((char, index) => {
      if (char === " ") return char;

      return String.fromCharCode(
        ((char.charCodeAt(0) - 2 * 65 + keyword.charCodeAt(index % keyword.length)) % 26) + 65,
      );
    })
    .join("");
}
