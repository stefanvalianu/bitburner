export function proper2ColoringOfGraph([nodeCount, edges]: [number, [number, number][]]): (
  | 1
  | 0
)[] {
  const graph = Array.from({ length: nodeCount }, () => [] as number[]);

  for (const [a, b] of edges) {
    graph[a]!.push(b);
    graph[b]!.push(a);
  }

  const colors = Array<number>(nodeCount).fill(-1);

  for (let start = 0; start < nodeCount; start++) {
    if (colors[start] !== -1) continue;

    colors[start] = 0;

    const queue = [start];

    for (let head = 0; head < queue.length; head++) {
      const node = queue[head]!;

      for (const neighbor of graph[node]!) {
        if (colors[neighbor] === -1) {
          colors[neighbor] = 1 - colors[node]!;
          queue.push(neighbor);
        } else if (colors[neighbor] === colors[node]) {
          return [];
        }
      }
    }
  }

  return colors as (1 | 0)[];
}
