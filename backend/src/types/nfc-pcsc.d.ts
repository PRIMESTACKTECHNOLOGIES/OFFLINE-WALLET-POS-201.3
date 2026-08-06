declare module 'nfc-pcsc' {
  export class NFC {
    constructor();
    on(event: string, handler: (...args: any[]) => void): void;
    once(event: string, handler: (...args: any[]) => void): void;
  }
}
