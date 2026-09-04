const EMPTY_BYTES = new Uint8Array();

export default class ByteBuf {
    private bytes: Uint8Array;
    private view: DataView;
    private readerIndex = 0;
    private writerIndex: number;

    constructor(bytes: Uint8Array = EMPTY_BYTES) {
        this.bytes = bytes;
        this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        this.writerIndex = bytes.byteLength;
    }

    get capacity(): number {
        return this.bytes.byteLength;
    }

    get size(): number {
        return this.remaining;
    }

    get empty(): boolean {
        return this.remaining === 0;
    }

    get notEmpty(): boolean {
        return this.remaining > 0;
    }

    get remaining(): number {
        return this.writerIndex - this.readerIndex;
    }

    Replace(bytes: Uint8Array): void {
        this.bytes = bytes;
        this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        this.readerIndex = 0;
        this.writerIndex = bytes.byteLength;
    }

    Replace2(bytes: Uint8Array, beginPos: number, endPos: number): void {
        this.Replace(bytes.slice(beginPos, endPos));
    }

    getBytesNotSafe(): Uint8Array {
        return this.bytes;
    }

    addReadIndex(add: number): void {
        this.ensureRead(add);
        this.readerIndex += add;
    }

    copyData(): Uint8Array {
        return this.bytes.slice(this.readerIndex, this.writerIndex);
    }

    discardReadBytes(): void {
        this.bytes.copyWithin(0, this.readerIndex, this.writerIndex);
        this.writerIndex -= this.readerIndex;
        this.readerIndex = 0;
        this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    }

    clear(): void {
        this.readerIndex = 0;
        this.writerIndex = 0;
    }

    readBool(): boolean {
        return this.readByte() !== 0;
    }

    readByte(): number {
        this.ensureRead(1);
        return this.view.getUint8(this.readerIndex++);
    }

    readShort(): number {
        this.ensureRead(1);
        const head = this.view.getUint8(this.readerIndex);
        if (head < 0x80) {
            this.readerIndex += 1;
            return head;
        }
        if (head < 0xc0) {
            this.ensureRead(2);
            const value = this.view.getUint16(this.readerIndex) & 0x3fff;
            this.readerIndex += 2;
            return value;
        }
        if (head === 0xff) {
            this.ensureRead(3);
            const value = this.view.getInt16(this.readerIndex + 1);
            this.readerIndex += 3;
            return value;
        }
        throw new Error(`Invalid compressed short marker 0x${head.toString(16)}.`);
    }

    readInt(): number {
        this.ensureRead(1);
        const head = this.view.getUint8(this.readerIndex);
        let value: number;
        if (head < 0x80) {
            this.readerIndex += 1;
            return head;
        }
        if (head < 0xc0) {
            this.ensureRead(2);
            value = this.view.getUint16(this.readerIndex) & 0x3fff;
            this.readerIndex += 2;
        } else if (head < 0xe0) {
            this.ensureRead(3);
            value = ((head & 0x1f) << 16) | this.view.getUint16(this.readerIndex + 1);
            this.readerIndex += 3;
        } else if (head < 0xf0) {
            this.ensureRead(4);
            value = this.view.getInt32(this.readerIndex) & 0x0fffffff;
            this.readerIndex += 4;
        } else {
            this.ensureRead(5);
            value = this.view.getInt32(this.readerIndex + 1);
            this.readerIndex += 5;
        }
        return value;
    }

    readFint(): number {
        this.ensureRead(4);
        const value = this.view.getInt32(this.readerIndex, true);
        this.readerIndex += 4;
        return value;
    }

    readLongAsNumber(): number {
        const value = this.readLong();
        const numberValue = Number(value);
        if (!Number.isSafeInteger(numberValue)) {
            throw new Error(`Long value '${value.toString()}' exceeds Number safe integer range.`);
        }
        return numberValue;
    }

    readLong(): bigint {
        this.ensureRead(1);
        const head = this.view.getUint8(this.readerIndex);
        let value: bigint;
        if (head < 0x80) {
            this.readerIndex += 1;
            return BigInt(head);
        }
        if (head < 0xc0) {
            this.ensureRead(2);
            value = BigInt(this.view.getUint16(this.readerIndex) & 0x3fff);
            this.readerIndex += 2;
        } else if (head < 0xe0) {
            this.ensureRead(3);
            value = BigInt(((head & 0x1f) << 16) | this.view.getUint16(this.readerIndex + 1));
            this.readerIndex += 3;
        } else if (head < 0xf0) {
            this.ensureRead(4);
            value = BigInt(this.view.getInt32(this.readerIndex) & 0x0fffffff);
            this.readerIndex += 4;
        } else if (head < 0xf8) {
            this.ensureRead(5);
            value = (BigInt(head & 0x07) << BigInt(32)) | BigInt(this.view.getUint32(this.readerIndex + 1));
            this.readerIndex += 5;
        } else if (head < 0xfc) {
            this.ensureRead(6);
            value = (BigInt(this.view.getUint16(this.readerIndex) & 0x03ff) << BigInt(32))
                | BigInt(this.view.getUint32(this.readerIndex + 2));
            this.readerIndex += 6;
        } else if (head < 0xfe) {
            this.ensureRead(7);
            value = (BigInt((this.view.getUint32(this.readerIndex) >>> 8) & 0x01ffff) << BigInt(32))
                | BigInt(this.view.getUint32(this.readerIndex + 3));
            this.readerIndex += 7;
        } else if (head < 0xff) {
            this.ensureRead(8);
            value = (BigInt(this.view.getUint32(this.readerIndex) & 0x00ffffff) << BigInt(32))
                | BigInt(this.view.getUint32(this.readerIndex + 4));
            this.readerIndex += 8;
        } else {
            this.ensureRead(9);
            value = this.view.getBigInt64(this.readerIndex + 1);
            this.readerIndex += 9;
        }
        return value;
    }

    readFloat(): number {
        this.ensureRead(4);
        const value = this.view.getFloat32(this.readerIndex, true);
        this.readerIndex += 4;
        return value;
    }

    readDouble(): number {
        this.ensureRead(8);
        const value = this.view.getFloat64(this.readerIndex, true);
        this.readerIndex += 8;
        return value;
    }

    readSize(): number {
        return this.readInt();
    }

    readString(): string {
        const length = this.readSize();
        this.ensureRead(length);
        const value = new TextDecoder().decode(this.bytes.subarray(this.readerIndex, this.readerIndex + length));
        this.readerIndex += length;
        return value;
    }

    readBytes(): Uint8Array {
        const length = this.readSize();
        this.ensureRead(length);
        const value = this.bytes.slice(this.readerIndex, this.readerIndex + length);
        this.readerIndex += length;
        return value;
    }

    readArrayBuffer(): ArrayBuffer {
        const bytes = this.readBytes();
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    }

    SkipBytes(): void {
        this.addReadIndex(this.readSize());
    }

    private ensureRead(size: number): void {
        if (!Number.isInteger(size) || size < 0 || this.readerIndex + size > this.writerIndex) {
            throw new Error(`Luban buffer underflow at ${this.readerIndex}: need ${size}, remaining ${this.remaining}.`);
        }
    }
}
