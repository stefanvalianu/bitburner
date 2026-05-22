export function generateIPAddresses(data: string): string[] {
  const result: string[] = [];

  const isValidPart = (part: string): boolean => {
    if (part.length === 0 || part.length > 3) return false;
    if (part.length > 1 && part.charAt(0) === "0") return false;
    return Number(part) <= 255;
  };

  for (let a = 1; a <= 3; a++) {
    for (let b = 1; b <= 3; b++) {
      for (let c = 1; c <= 3; c++) {
        const d = data.length - a - b - c;
        if (d < 1 || d > 3) continue;

        const parts = [
          data.slice(0, a),
          data.slice(a, a + b),
          data.slice(a + b, a + b + c),
          data.slice(a + b + c),
        ];

        if (parts.every(isValidPart)) {
          result.push(parts.join("."));
        }
      }
    }
  }

  return result;
}

export function sanitizeParenthesesInExpression(data: string): string[] {
  const isValid = (value: string): boolean => {
    let balance = 0;

    for (const char of value) {
      if (char === "(") balance++;
      else if (char === ")") balance--;

      if (balance < 0) return false;
    }

    return balance === 0;
  };

  const result = new Set<string>();
  const visited = new Set<string>([data]);
  const queue: string[] = [data];

  let found = false;

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;

    if (isValid(current)) {
      result.add(current);
      found = true;
    }

    if (found) continue;

    for (let i = 0; i < current.length; i++) {
      const char = current.charAt(i);

      if (char !== "(" && char !== ")") continue;

      const next = current.slice(0, i) + current.slice(i + 1);

      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }

  return result.size > 0 ? [...result] : [""];
}

export function findAllValidMathExpressions([digits, target]: [string, number]): string[] {
  const result: string[] = [];

  const dfs = (index: number, expression: string, value: number, previousOperand: number): void => {
    if (index === digits.length) {
      if (value === target) {
        result.push(expression);
      }

      return;
    }

    for (let end = index; end < digits.length; end++) {
      if (end > index && digits.charAt(index) === "0") break;

      const part = digits.slice(index, end + 1);
      const number = Number(part);

      if (index === 0) {
        dfs(end + 1, part, number, number);
      } else {
        dfs(end + 1, `${expression}+${part}`, value + number, number);
        dfs(end + 1, `${expression}-${part}`, value - number, -number);

        dfs(
          end + 1,
          `${expression}*${part}`,
          value - previousOperand + previousOperand * number,
          previousOperand * number,
        );
      }
    }
  };

  dfs(0, "", 0, 0);
  return result;
}
