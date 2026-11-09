export declare function sign(body: string | Buffer, secret: string): string;
export declare function verifySignature(body: string | Buffer, header: string | null | undefined, secret: string): boolean;
export declare function parseEvent(body: string | Buffer, header: string | null | undefined, secret: string): Record<string, any>;
