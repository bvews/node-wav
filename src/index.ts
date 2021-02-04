/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

type Decoder = (buffer: ArrayBuffer, offset: number, output: Float32Array[], channels: number, samples: number) => void;
type Encoder = (buffer: ArrayBuffer, offset: number, input: Float32Array[], channels: number, samples: number) => void;
type TypedArray = | Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array;

interface WavData {
  sampleRate: number;
  channelData: Float32Array[];
}

interface Options {
  sampleRate: number;
  bitDepth: number;
  float?: boolean;
  floatingPoint?: boolean;
}

const data_decoders: { [name: string]: Decoder } = {
  pcm8: (buffer, offset, output, channels, samples) => {
    let input = new Uint8Array(buffer, offset);
    let pos = 0;
    for (let i = 0; i < samples; ++i) {
      for (let ch = 0; ch < channels; ++ch) {
        let data = input[pos++] - 128;
        output[ch][i] = data < 0 ? data / 128 : data / 127;
      }
    }
  },
  pcm16: (buffer, offset, output, channels, samples) => {
    let input = new Int16Array(buffer, offset);
    let pos = 0;
    for (let i = 0; i < samples; ++i) {
      for (let ch = 0; ch < channels; ++ch) {
        let data = input[pos++];
        output[ch][i] = data < 0 ? data / 32768 : data / 32767;
      }
    }
  },
  pcm24: (buffer, offset, output, channels, samples) => {
    let input = new Uint8Array(buffer, offset);
    let pos = 0;
    for (let i = 0; i < samples; ++i) {
      for (let ch = 0; ch < channels; ++ch) {
        let x0 = input[pos++];
        let x1 = input[pos++];
        let x2 = input[pos++];
        let xx = (x0 + (x1 << 8) + (x2 << 16));
        let data = xx > 0x800000 ? xx - 0x1000000 : xx;
        output[ch][i] = data < 0 ? data / 8388608 : data / 8388607;
      }
    }
  },
  pcm32: (buffer, offset, output, channels, samples) => {
    let input = new Int32Array(buffer, offset);
    let pos = 0;
    for (let i = 0; i < samples; ++i) {
      for (let ch = 0; ch < channels; ++ch) {
        let data = input[pos++];
        output[ch][i] = data < 0 ? data / 2147483648 : data / 2147483647;
      }
    }
  },
  pcm32f: (buffer, offset, output, channels, samples) => {
    let input = new Float32Array(buffer, offset);
    let pos = 0;
    for (let i = 0; i < samples; ++i) {
      for (let ch = 0; ch < channels; ++ch)
        output[ch][i] = input[pos++];
    }
  },
  pcm64f: (buffer, offset, output, channels, samples) => {
    let input = new Float64Array(buffer, offset);
    let pos = 0;
    for (let i = 0; i < samples; ++i) {
      for (let ch = 0; ch < channels; ++ch)
        output[ch][i] = input[pos++];
    }
  },
};

const data_encoders = {
  pcm8: (buffer, offset, input, channels, samples) => {
    let output = new Uint8Array(buffer, offset);
    let pos = 0;
    for (let i = 0; i < samples; ++i) {
      for (let ch = 0; ch < channels; ++ch) {
        let v = Math.max(-1, Math.min(input[ch][i], 1));
        v = ((v * 0.5 + 0.5) * 255) | 0;
        output[pos++] = v;
      }
    }
  },
  pcm16: (buffer, offset, input, channels, samples) => {
    let output = new Int16Array(buffer, offset);
    let pos = 0;
    for (let i = 0; i < samples; ++i) {
      for (let ch = 0; ch < channels; ++ch) {
        let v = Math.max(-1, Math.min(input[ch][i], 1));
        v = ((v < 0) ? v * 32768 : v * 32767) | 0;
        output[pos++] = v;
      }
    }
  },
  pcm24: (buffer, offset, input, channels, samples) => {
    let output = new Uint8Array(buffer, offset);
    let pos = 0;
    for (let i = 0; i < samples; ++i) {
      for (let ch = 0; ch < channels; ++ch) {
        let v = Math.max(-1, Math.min(input[ch][i], 1));
        v = ((v < 0) ? 0x1000000 + v * 8388608 : v * 8388607) | 0;
        output[pos++] = (v >> 0) & 0xff;
        output[pos++] = (v >> 8) & 0xff;
        output[pos++] = (v >> 16) & 0xff;
      }
    }
  },
  pcm32: (buffer, offset, input, channels, samples) => {
    let output = new Int32Array(buffer, offset);
    let pos = 0;
    for (let i = 0; i < samples; ++i) {
      for (let ch = 0; ch < channels; ++ch) {
        let v = Math.max(-1, Math.min(input[ch][i], 1));
        v = ((v < 0) ? v * 2147483648 : v * 2147483647) | 0;
        output[pos++] = v;
      }
    }
  },
  pcm32f: (buffer, offset, input, channels, samples) => {
    let output = new Float32Array(buffer, offset);
    let pos = 0;
    for (let i = 0; i < samples; ++i) {
      for (let ch = 0; ch < channels; ++ch) {
        let v = Math.max(-1, Math.min(input[ch][i], 1));
        output[pos++] = v;
      }
    }
  },
  pcm64f: (buffer, offset, input, channels, samples) => {
    let output = new Float64Array(buffer, offset);
    let pos = 0;
    for (let i = 0; i < samples; ++i) {
      for (let ch = 0; ch < channels; ++ch) {
        let v = Math.max(-1, Math.min(input[ch][i], 1));
        output[pos++] = v;
      }
    }
  },
};

function lookup(table: { [key: string]: Decoder | Encoder }, bitDepth: number, floatingPoint: boolean) {
  let name = 'pcm' + bitDepth + (floatingPoint ? 'f' : '');
  let fn = table[name];
  if (!fn)
    throw new TypeError('Unsupported data format: ' + name);
  return fn;
}

function decode(buffer: Buffer | TypedArray | ArrayBuffer): WavData | undefined {
  let pos = 0, end = 0;
  if ('buffer' in buffer) {
    // If we are handed a typed array or a buffer, then we have to consider the
    // offset and length into the underlying array buffer.
    pos = buffer.byteOffset;
    end = buffer.length;
    buffer = buffer.buffer;
  } else {
    // If we are handed a straight up array buffer, start at offset 0 and use
    // the full length of the buffer.
    pos = 0;
    end = buffer.byteLength;
  }

  let v = new DataView(buffer);

  function u8(): number {
    let x = v.getUint8(pos);
    pos++;
    return x;
  }

  function u16(): number {
    let x = v.getUint16(pos, true);
    pos += 2;
    return x;
  }

  function u32(): number {
    let x = v.getUint32(pos, true);
    pos += 4;
    return x;
  }

  function string(len: number): string {
    let str = '';
    for (let i = 0; i < len; ++i)
      str += String.fromCharCode(u8());
    return str;
  }

  if (string(4) !== 'RIFF')
    throw new TypeError('Invalid WAV file');
  u32();
  if (string(4) !== 'WAVE')
    throw new TypeError('Invalid WAV file');

  let fmt;
  
  while (pos < end) {
    let type = string(4);
    let size = u32();
    let next = pos + size;
    switch (type) {
    case 'fmt ':
      let formatId = u16();
      if (formatId !== 0x0001 && formatId !== 0x0003)
        throw new TypeError('Unsupported format in WAV file: ' + formatId.toString(16));
      fmt = {
        format: 'lpcm',
        floatingPoint: formatId === 0x0003,
        channels: u16(),
        sampleRate: u32(),
        byteRate: u32(),
        blockSize: u16(),
        bitDepth: u16(),
      };
      break;
    case 'data':
      if (!fmt)
        throw new TypeError('Missing "fmt " chunk.');
      let samples = Math.floor(size / fmt.blockSize);
      let channels = fmt.channels;
      let sampleRate = fmt.sampleRate;
      let channelData = [];
      for (let ch = 0; ch < channels; ++ch)
        channelData[ch] = new Float32Array(samples);
      lookup(data_decoders, fmt.bitDepth, fmt.floatingPoint)(buffer, pos, channelData, channels, samples);
      return {
        sampleRate: sampleRate,
        channelData: channelData
      };
      break;
    }
    pos = next;
  }
}

function encode(channelData: Float32Array[], opts: Options): Buffer {
  if (typeof window !== 'undefined' || typeof process === 'undefined') {
    // Called from browsers
    new Error('"encode" function can not be called from browser environment.');
  } else {
    // Called from Node.js
    return Buffer.from(encodeAsArrayBuffer(channelData, opts));
  }
}

function encodeAsArrayBuffer(channelData: Float32Array[], opts: Options): ArrayBuffer {
  let sampleRate = opts.sampleRate || 16000;
  let floatingPoint = !!(opts.float || opts.floatingPoint);
  let bitDepth = floatingPoint ? 32 : ((opts.bitDepth | 0) || 16);
  let channels = channelData.length;
  let samples = channelData[0].length;
  let buffer = new ArrayBuffer(44 + (samples * channels * (bitDepth >> 3)));

  let v = new DataView(buffer);
  let pos = 0;

  function u8(x: number): void {
    v.setUint8(pos++, x);
  }

  function u16(x: number): void {
    v.setUint16(pos, x, true);
    pos += 2;
  }

  function u32(x: number): void {
    v.setUint32(pos, x, true);
    pos += 4;
  }
  
  function string(s: string): void {
    for (var i = 0; i < s.length; ++i)
      u8(s.charCodeAt(i));
  }

  // write header
  string('RIFF');
  u32(buffer.byteLength - 8);
  string('WAVE');

  // write 'fmt ' chunk
  string('fmt ');
  u32(16);
  u16(floatingPoint ? 0x0003 : 0x0001);
  u16(channels);
  u32(sampleRate);
  u32(sampleRate * channels * (bitDepth >> 3));
  u16(channels * (bitDepth >> 3));
  u16(bitDepth);

  // write 'data' chunk
  string('data');
  u32(buffer.byteLength - 44);
  lookup(data_encoders, bitDepth, floatingPoint)(buffer, pos, channelData, channels, samples);

  return buffer;
}

module.exports = {
  decode: decode,
  encode: encode,
  encodeAsArrayBuffer: encodeAsArrayBuffer,
};
