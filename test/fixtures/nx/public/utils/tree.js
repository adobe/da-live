export class Queue {
  constructor() { this.items = []; }

  push(item) { this.items.push(item); }

  shift() { return this.items.shift(); }
}

export function crawl() { return []; }
