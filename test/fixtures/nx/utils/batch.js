// Mock batch.js for tests — splits an array into a single batch
export default function makeBatches(items, size = 5) {
  const result = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}
