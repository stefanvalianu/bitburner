export function hammingIntegerToEncodedBinary(data: number): string {
  const encoded: number[] = [0];

  const dataBits = data
    .toString(2)
    .split("")
    .reverse()
    .map((value) => Number.parseInt(value, 10));

  let remaining = dataBits.length;

  for (let index = 1; remaining > 0; index++) {
    if ((index & (index - 1)) !== 0) {
      encoded[index] = dataBits[--remaining] ?? 0;
    } else {
      encoded[index] = 0;
    }
  }

  let parityNumber = 0;

  for (let index = 0; index < encoded.length; index++) {
    if (encoded[index]) {
      parityNumber ^= index;
    }
  }

  const parityArray = parityNumber
    .toString(2)
    .split("")
    .reverse()
    .map((value) => Number.parseInt(value, 10));

  for (let index = 0; index < parityArray.length; index++) {
    encoded[2 ** index] = parityArray[index] ? 1 : 0;
  }

  parityNumber = 0;

  for (let index = 0; index < encoded.length; index++) {
    if (encoded[index]) {
      parityNumber++;
    }
  }

  encoded[0] = parityNumber % 2 === 0 ? 0 : 1;

  return encoded.join("");
}

export function hammingEncodedBinaryToInteger(data: string): number {
  let errorIndex = 0;
  const bits: number[] = [];

  const bitStringArray = data.split("");

  for (let index = 0; index < bitStringArray.length; index++) {
    const bit = Number.parseInt(bitStringArray[index]!, 10);
    bits[index] = bit;

    if (bit) {
      errorIndex ^= index;
    }
  }

  if (errorIndex !== 0 && errorIndex < bits.length) {
    bits[errorIndex] = bits[errorIndex] ? 0 : 1;
  }

  let answerBits = "";

  for (let index = 1; index < bits.length; index++) {
    if ((index & (index - 1)) !== 0) {
      answerBits += bits[index]!;
    }
  }

  return Number.parseInt(answerBits, 2);
}
