/**
 * Minimal PHP `serialize()` reader.
 *
 * WordPress stores structured post meta as PHP-serialized strings, so the
 * export is full of values like:
 *   a:1:{i:0;a:3:{s:4:"name";s:14:"New-folder.zip";...}}
 *
 * We only need to read them once, during import. Rather than pull in a
 * dependency, this parses the five types that actually appear in the export:
 * array, string, int, float, bool (plus null).
 *
 * String lengths in PHP are BYTE lengths, not character counts. Any product
 * title with an accent or emoji would desync a naive character-based reader,
 * so strings are measured against a Buffer.
 */

export type PhpValue =
  | string
  | number
  | boolean
  | null
  | PhpValue[]
  | { [key: string]: PhpValue };

class Reader {
  private buf: Buffer;
  private pos = 0;

  constructor(input: string) {
    this.buf = Buffer.from(input, "utf8");
  }

  private expect(char: string) {
    const got = String.fromCharCode(this.buf[this.pos]);
    if (got !== char) {
      throw new Error(
        `php-unserialize: expected '${char}' at byte ${this.pos}, got '${got}'`,
      );
    }
    this.pos += 1;
  }

  /** Reads bytes up to (not including) `stop`, returning them as a string. */
  private readUntil(stop: string): string {
    const stopCode = stop.charCodeAt(0);
    const start = this.pos;
    while (this.pos < this.buf.length && this.buf[this.pos] !== stopCode) {
      this.pos += 1;
    }
    const out = this.buf.toString("utf8", start, this.pos);
    this.pos += 1; // consume the stop byte
    return out;
  }

  parse(): PhpValue {
    const type = String.fromCharCode(this.buf[this.pos]);

    switch (type) {
      case "N": {
        this.pos += 2; // "N;"
        return null;
      }
      case "b": {
        this.pos += 2; // "b:"
        const v = this.readUntil(";");
        return v === "1";
      }
      case "i": {
        this.pos += 2; // "i:"
        return Number.parseInt(this.readUntil(";"), 10);
      }
      case "d": {
        this.pos += 2; // "d:"
        return Number.parseFloat(this.readUntil(";"));
      }
      case "s": {
        this.pos += 2; // "s:"
        const byteLen = Number.parseInt(this.readUntil(":"), 10);
        this.expect('"');
        const value = this.buf.toString("utf8", this.pos, this.pos + byteLen);
        this.pos += byteLen;
        this.expect('"');
        this.expect(";");
        return value;
      }
      case "a": {
        this.pos += 2; // "a:"
        const count = Number.parseInt(this.readUntil(":"), 10);
        this.expect("{");

        const entries: [PhpValue, PhpValue][] = [];
        for (let i = 0; i < count; i += 1) {
          const key = this.parse();
          const value = this.parse();
          entries.push([key, value]);
        }
        this.expect("}");

        // PHP conflates lists and maps. Treat sequential integer keys starting
        // at 0 as a JS array, everything else as an object.
        const isList = entries.every(([k], i) => k === i);
        if (isList) return entries.map(([, v]) => v);

        const obj: { [key: string]: PhpValue } = {};
        for (const [k, v] of entries) obj[String(k)] = v;
        return obj;
      }
      default:
        throw new Error(
          `php-unserialize: unsupported type '${type}' at byte ${this.pos}`,
        );
    }
  }
}

/**
 * Returns the parsed value, or `null` if the input is empty or malformed.
 * Import data is never trustworthy enough to justify throwing.
 */
export function phpUnserialize(input: string | null | undefined): PhpValue {
  if (!input) return null;
  try {
    return new Reader(input).parse();
  } catch {
    return null;
  }
}

/** Coerces a parsed value into an array, since PHP arrays may arrive as objects. */
export function asArray(value: PhpValue): PhpValue[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return Object.values(value);
  return [value];
}
