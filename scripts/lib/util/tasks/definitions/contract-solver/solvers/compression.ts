export function rleCompression(data: string): string {
  if (data.length === 0) return "";

  let result = "";
  let count = 1;

  for (let i = 1; i < data.length; i++) {
    if (data.charAt(i) === data.charAt(i - 1) && count < 9) {
      count++;
    } else {
      result += `${count}${data.charAt(i - 1)}`;
      count = 1;
    }
  }

  result += `${count}${data.charAt(data.length - 1)}`;
  return result;
}

export function lzDecompression(data: string): string {
  let output = "";

  for (let index = 0; index < data.length; ) {
    const literalLength = data.charCodeAt(index) - 48;

    if (literalLength < 0 || literalLength > 9 || index + 1 + literalLength > data.length) {
      return "";
    }

    output += data.slice(index + 1, index + 1 + literalLength);
    index += 1 + literalLength;

    if (index >= data.length) {
      break;
    }

    const backrefLength = data.charCodeAt(index) - 48;

    if (backrefLength < 0 || backrefLength > 9) {
      return "";
    }

    if (backrefLength === 0) {
      index++;
      continue;
    }

    if (index + 1 >= data.length) {
      return "";
    }

    const backrefOffset = data.charCodeAt(index + 1) - 48;

    if (backrefOffset < 1 || backrefOffset > 9 || backrefOffset > output.length) {
      return "";
    }

    for (let j = 0; j < backrefLength; j++) {
      output += output.charAt(output.length - backrefOffset);
    }

    index += 2;
  }

  return output;
}

export function lzCompression(data: string): string {
  if (data.length === 0) return "";

  let currentState: (string | null)[][] = Array.from({ length: 10 }, () =>
    Array<string | null>(10).fill(null),
  );

  let nextState: (string | null)[][] = Array.from({ length: 10 }, () =>
    Array<string | null>(10).fill(null),
  );

  const setBest = (
    state: (string | null)[][],
    offset: number,
    length: number,
    encodedPrefix: string,
  ): void => {
    const row = state[offset]!;
    const current = row[length];

    if (current === null || encodedPrefix.length < current.length) {
      row[length] = encodedPrefix;
    }
  };

  currentState[0]![1] = "";

  for (let index = 1; index < data.length; index++) {
    for (const row of nextState) {
      row.fill(null);
    }

    const char = data.charAt(index);

    for (let literalLength = 1; literalLength <= 9; literalLength++) {
      const encodedPrefix = currentState[0]![literalLength];
      if (encodedPrefix === null) continue;

      if (literalLength < 9) {
        setBest(nextState, 0, literalLength + 1, encodedPrefix);
      } else {
        setBest(nextState, 0, 1, encodedPrefix + "9" + data.slice(index - 9, index) + "0");
      }

      for (let offset = 1; offset <= Math.min(9, index); offset++) {
        if (data.charAt(index - offset) === char) {
          setBest(
            nextState,
            offset,
            1,
            encodedPrefix + String(literalLength) + data.slice(index - literalLength, index),
          );
        }
      }
    }

    for (let offset = 1; offset <= 9; offset++) {
      for (let backrefLength = 1; backrefLength <= 9; backrefLength++) {
        const encodedPrefix = currentState[offset]![backrefLength];
        if (encodedPrefix === null) continue;

        if (data.charAt(index - offset) === char) {
          if (backrefLength < 9) {
            setBest(nextState, offset, backrefLength + 1, encodedPrefix);
          } else {
            setBest(nextState, offset, 1, encodedPrefix + "9" + String(offset) + "0");
          }
        }

        setBest(nextState, 0, 1, encodedPrefix + String(backrefLength) + String(offset));

        for (let newOffset = 1; newOffset <= Math.min(9, index); newOffset++) {
          if (data.charAt(index - newOffset) === char) {
            setBest(
              nextState,
              newOffset,
              1,
              encodedPrefix + String(backrefLength) + String(offset) + "0",
            );
          }
        }
      }
    }

    const swap = currentState;
    currentState = nextState;
    nextState = swap;
  }

  let best: string | null = null;

  const consider = (value: string): void => {
    if (best === null || value.length < best.length) {
      best = value;
    }
  };

  for (let literalLength = 1; literalLength <= 9; literalLength++) {
    const encodedPrefix = currentState[0]![literalLength];
    if (encodedPrefix === null) continue;

    consider(encodedPrefix + String(literalLength) + data.slice(data.length - literalLength));
  }

  for (let offset = 1; offset <= 9; offset++) {
    for (let backrefLength = 1; backrefLength <= 9; backrefLength++) {
      const encodedPrefix = currentState[offset]![backrefLength];
      if (encodedPrefix === null) continue;

      consider(encodedPrefix + String(backrefLength) + String(offset));
    }
  }

  return best ?? "";
}
