export declare type BSONType = typeof BSONType[keyof typeof BSONType];
export declare type BSONTypeAlias = keyof typeof BSONType;
export declare type BinarySequence = Uint8Array | Buffer | number[];

export declare const BSONType: Readonly<{
  readonly double: 1;
  readonly string: 2;
  readonly object: 3;
  readonly array: 4;
  readonly binData: 5;
  readonly undefined: 6;
  readonly objectId: 7;
  readonly bool: 8;
  readonly date: 9;
  readonly null: 10;
  readonly regex: 11;
  readonly dbPointer: 12;
  readonly javascript: 13;
  readonly symbol: 14;
  readonly javascriptWithScope: 15;
  readonly int: 16;
  readonly timestamp: 17;
  readonly long: 18;
  readonly decimal: 19;
  readonly minKey: -1;
  readonly maxKey: 127;
}>;

export declare class BSONRegExp {
  _bsontype: 'BSONRegExp';
  pattern: string;
  options: string;
  /**
   * @param pattern - The regular expression pattern to match
   * @param options - The regular expression options
   */
  constructor(pattern: string, options?: string);
  static parseOptions(options?: string): string;
  /* Excluded from this release type: toExtendedJSON */
  /* Excluded from this release type: fromExtendedJSON */
}

export declare class Binary {
  _bsontype: 'Binary';
  /* Excluded from this release type: BSON_BINARY_SUBTYPE_DEFAULT */
  /** Initial buffer default size */
  static readonly BUFFER_SIZE = 256;
  /** Default BSON type */
  static readonly SUBTYPE_DEFAULT = 0;
  /** Function BSON type */
  static readonly SUBTYPE_FUNCTION = 1;
  /** Byte Array BSON type */
  static readonly SUBTYPE_BYTE_ARRAY = 2;
  /** Deprecated UUID BSON type @deprecated Please use SUBTYPE_UUID */
  static readonly SUBTYPE_UUID_OLD = 3;
  /** UUID BSON type */
  static readonly SUBTYPE_UUID = 4;
  /** MD5 BSON type */
  static readonly SUBTYPE_MD5 = 5;
  /** Encrypted BSON type */
  static readonly SUBTYPE_ENCRYPTED = 6;
  /** Column BSON type */
  static readonly SUBTYPE_COLUMN = 7;
  /** User BSON type */
  static readonly SUBTYPE_USER_DEFINED = 128;
  buffer: Buffer;
  sub_type: number;
  position: number;
  /**
   * Create a new Binary instance.
   *
   * This constructor can accept a string as its first argument. In this case,
   * this string will be encoded using ISO-8859-1, **not** using UTF-8.
   * This is almost certainly not what you want. Use `new Binary(Buffer.from(string))`
   * instead to convert the string to a Buffer using UTF-8 first.
   *
   * @param buffer - a buffer object containing the binary data.
   * @param subType - the option binary type.
   */
  constructor(buffer?: string | BinarySequence, subType?: number);
  /**
   * Updates this binary with byte_value.
   *
   * @param byteValue - a single byte we wish to write.
   */
  put(byteValue: string | number | Uint8Array | Buffer | number[]): void;
  /**
   * Writes a buffer or string to the binary.
   *
   * @param sequence - a string or buffer to be written to the Binary BSON object.
   * @param offset - specify the binary of where to write the content.
   */
  write(sequence: string | BinarySequence, offset: number): void;
  /**
   * Reads **length** bytes starting at **position**.
   *
   * @param position - read from the given position in the Binary.
   * @param length - the number of bytes to read.
   */
  read(position: number, length: number): BinarySequence;
  /**
   * Returns the value of this binary as a string.
   * @param asRaw - Will skip converting to a string
   * @remarks
   * This is handy when calling this function conditionally for some key value pairs and not others
   */
  value(asRaw?: boolean): string | BinarySequence;
  /** the length of the binary sequence */
  length(): number;
  toJSON(): string;
  toString(format?: string): string;
  /* Excluded from this release type: toExtendedJSON */
  toUUID(): UUID;
  /* Excluded from this release type: fromExtendedJSON */
  inspect(): string;
}

export declare class UUID extends Binary {
  static cacheHexString: boolean;
  /* Excluded from this release type: __id */
  /**
   * Create an UUID type
   *
   * @param input - Can be a 32 or 36 character hex string (dashes excluded/included) or a 16 byte binary Buffer.
   */
  constructor(input?: string | Buffer | UUID);
  /**
   * The UUID bytes
   * @readonly
   */
  get id(): Buffer;
  set id(value: Buffer);
  /**
   * Returns the UUID id as a 32 or 36 character hex string representation, excluding/including dashes (defaults to 36 character dash separated)
   * @param includeDashes - should the string exclude dash-separators.
   * */
  toHexString(includeDashes?: boolean): string;
  /**
   * Converts the id into a 36 character (dashes included) hex string, unless a encoding is specified.
   */
  toString(encoding?: string): string;
  /**
   * Converts the id into its JSON string representation.
   * A 36 character (dashes included) hex string in the format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   */
  toJSON(): string;
  /**
   * Compares the equality of this UUID with `otherID`.
   *
   * @param otherId - UUID instance to compare against.
   */
  equals(otherId: string | Buffer | UUID): boolean;
  /**
   * Creates a Binary instance from the current UUID.
   */
  toBinary(): Binary;
  /**
   * Generates a populated buffer containing a v4 uuid
   */
  static generate(): Buffer;
  /**
   * Checks if a value is a valid bson UUID
   * @param input - UUID, string or Buffer to validate.
   */
  static isValid(input: string | Buffer | UUID): boolean;
  /**
   * Creates an UUID from a hex string representation of an UUID.
   * @param hexString - 32 or 36 character hex string (dashes excluded/included).
   */
  static createFromHexString(hexString: string): UUID;
  inspect(): string;
}
