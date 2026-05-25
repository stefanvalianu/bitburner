export function ipv4ToUint32Fast(ip: string): number {
  let result = 0;
  let octet = 0;

  for (let i = 0; i < ip.length; i++) {
    const c = ip.charCodeAt(i);

    if (c === 46) { // "."
      result = ((result << 8) | octet) >>> 0;
      octet = 0;
    } else {
      octet = octet * 10 + c - 48; // "0" = 48
    }
  }

  return ((result << 8) | octet) >>> 0;
}
