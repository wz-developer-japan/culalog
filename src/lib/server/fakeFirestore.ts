// 試験のための、メモリの中だけの小さな置き場所（Firestore の使う分だけをまねる）。
// 🔴 本番では使わない（store.ts が CULALOG_FAKE_STORE=1 かつ本番でないときだけ使う）。

type Data = Record<string, unknown>;

const isObj = (x: unknown): x is Data => typeof x === "object" && x !== null && !Array.isArray(x);

function merge(base: Data, change: Data): Data {
  const out: Data = { ...base };
  for (const [k, v] of Object.entries(change)) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k] as Data, v) : v;
  return out;
}

const clone = <T>(x: T): T => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

class FakeSnap {
  constructor(
    public id: string,
    private value: Data | undefined,
  ) {}
  get exists() {
    return this.value !== undefined;
  }
  data() {
    return clone(this.value);
  }
}

class FakeDoc {
  constructor(
    private db: FakeDb,
    public path: string,
  ) {}
  get id() {
    return this.path.split("/").pop()!;
  }
  collection(name: string) {
    return new FakeCollection(this.db, `${this.path}/${name}`);
  }
  async get() {
    return new FakeSnap(this.id, this.db.docs.get(this.path));
  }
  async set(value: Data, options?: { merge?: boolean }) {
    const prev = this.db.docs.get(this.path);
    this.db.docs.set(this.path, clone(options?.merge && prev ? merge(prev, value) : value));
  }
  async delete() {
    this.db.docs.delete(this.path);
  }
}

class FakeQuery {
  constructor(
    protected db: FakeDb,
    public path: string,
    private filters: [string, string, unknown][] = [],
  ) {}
  where(field: string, op: string, value: unknown) {
    return new FakeQuery(this.db, this.path, [...this.filters, [field, op, value]]);
  }
  async get() {
    const prefix = `${this.path}/`;
    const docs = [...this.db.docs.entries()]
      .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
      .filter(([, v]) =>
        this.filters.every(([f, op, val]) => {
          const x = (v as Data)[f] as never;
          if (op === ">") return x !== undefined && x > (val as never);
          if (op === "==") return x === val;
          if (op === "<=") return x !== undefined && x <= (val as never);
          if (op === "<") return x !== undefined && x < (val as never);
          return true;
        }),
      )
      .map(([p, v]) => new FakeSnap(p.split("/").pop()!, v));
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

class FakeCollection extends FakeQuery {
  doc(id: string) {
    return new FakeDoc(this.db, `${this.path}/${id}`);
  }
}

class FakeDb {
  docs = new Map<string, Data>();
  collection(name: string) {
    return new FakeCollection(this, name);
  }
  async runTransaction<T>(fn: (tx: { get: (d: FakeDoc) => Promise<FakeSnap>; set: (d: FakeDoc, v: Data, o?: { merge?: boolean }) => void; delete: (d: FakeDoc) => void }) => Promise<T>): Promise<T> {
    const writes: (() => Promise<void>)[] = [];
    const result = await fn({
      get: (d) => d.get(),
      set: (d, v, o) => void writes.push(() => d.set(v, o)),
      delete: (d) => void writes.push(() => d.delete()),
    });
    for (const w of writes) await w();
    return result;
  }
  batch() {
    const writes: (() => Promise<void>)[] = [];
    return {
      set: (d: FakeDoc, v: Data, o?: { merge?: boolean }) => void writes.push(() => d.set(v, o)),
      delete: (d: FakeDoc) => void writes.push(() => d.delete()),
      commit: async () => {
        for (const w of writes) await w();
      },
    };
  }
}

const g = globalThis as unknown as { __culalogFakeDb?: FakeDb };
export function fakeFirestore(): FakeDb {
  return (g.__culalogFakeDb ??= new FakeDb());
}
/** 試験用: 置き場所を空にする */
export function resetFakeFirestore() {
  g.__culalogFakeDb = new FakeDb();
}
