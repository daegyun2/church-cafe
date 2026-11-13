/**
 * 순수 TypeScript 기반 표준 QR Code (ISO/IEC 18004) 2D 매트릭스 생성기
 * 외부 이미지 서버에 의존하지 않고 브라우저에서 즉시 SVG QR 코드를 렌더링합니다.
 */

// GF(256) 연산 테이블 (primitive polynomial 0x11D)
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    LOG_TABLE[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    EXP_TABLE[i] = EXP_TABLE[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}

function getGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = EXP_TABLE[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function computeReedSolomon(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = getGeneratorPoly(ecLen);
  const res = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ res[0];
    res.copyWithin(0, 1);
    res[ecLen - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecLen; j++) {
        res[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return res;
}

// Version 1 ~ 10 (ECC Level L, 단일 블록 구성 버전 위주)
interface VersionSpec {
  version: number;
  totalDataBytes: number;
  ecBytesPerBlock: number;
  numBlocks: number;
  alignment: number[];
}

const VERSION_SPECS: VersionSpec[] = [
  { version: 1, totalDataBytes: 19, ecBytesPerBlock: 7, numBlocks: 1, alignment: [] },
  { version: 2, totalDataBytes: 34, ecBytesPerBlock: 10, numBlocks: 1, alignment: [6, 18] },
  { version: 3, totalDataBytes: 55, ecBytesPerBlock: 15, numBlocks: 1, alignment: [6, 22] },
  { version: 4, totalDataBytes: 80, ecBytesPerBlock: 20, numBlocks: 1, alignment: [6, 26] },
  { version: 5, totalDataBytes: 108, ecBytesPerBlock: 26, numBlocks: 1, alignment: [6, 30] },
  { version: 6, totalDataBytes: 136, ecBytesPerBlock: 18, numBlocks: 2, alignment: [6, 34] },
  { version: 7, totalDataBytes: 156, ecBytesPerBlock: 20, numBlocks: 2, alignment: [6, 22, 38] },
  { version: 8, totalDataBytes: 194, ecBytesPerBlock: 24, numBlocks: 2, alignment: [6, 24, 42] },
  { version: 9, totalDataBytes: 232, ecBytesPerBlock: 30, numBlocks: 2, alignment: [6, 26, 46] },
];

export function generateQrMatrix(text: string): boolean[][] {
  const utf8 = new TextEncoder().encode(text);

  // 적합한 버전 선택
  let spec = VERSION_SPECS[VERSION_SPECS.length - 1];
  for (const s of VERSION_SPECS) {
    const headerBits = s.version <= 9 ? 4 + 8 : 4 + 16;
    const maxBytes = Math.floor((s.totalDataBytes * 8 - headerBits) / 8);
    if (utf8.length <= maxBytes) {
      spec = s;
      break;
    }
  }

  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >>> i) & 1);
    }
  };

  // Byte mode (0100)
  pushBits(0b0100, 4);
  pushBits(utf8.length, spec.version <= 9 ? 8 : 16);
  for (const b of utf8) pushBits(b, 8);

  const maxDataBits = spec.totalDataBytes * 8;
  const terminator = Math.min(4, maxDataBits - bits.length);
  pushBits(0, terminator);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataBytes = new Uint8Array(spec.totalDataBytes);
  for (let i = 0; i < bits.length / 8; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | bits[i * 8 + b];
    }
    dataBytes[i] = byte;
  }

  let padToggle = true;
  for (let i = bits.length / 8; i < spec.totalDataBytes; i++) {
    dataBytes[i] = padToggle ? 0xec : 0x11;
    padToggle = !padToggle;
  }

  // 블록 분할 및 Reed-Solomon 계산
  const blockDataLen = Math.floor(spec.totalDataBytes / spec.numBlocks);
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (let b = 0; b < spec.numBlocks; b++) {
    const block = dataBytes.slice(offset, offset + blockDataLen);
    offset += blockDataLen;
    dataBlocks.push(block);
    ecBlocks.push(computeReedSolomon(block, spec.ecBytesPerBlock));
  }

  // 인터리빙
  const finalBytes: number[] = [];
  for (let i = 0; i < blockDataLen; i++) {
    for (let b = 0; b < spec.numBlocks; b++) {
      finalBytes.push(dataBlocks[b][i]);
    }
  }
  for (let i = 0; i < spec.ecBytesPerBlock; i++) {
    for (let b = 0; b < spec.numBlocks; b++) {
      finalBytes.push(ecBlocks[b][i]);
    }
  }

  const size = spec.version * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false)
  );
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false)
  );

  const setFunctionModule = (r: number, c: number, dark: boolean) => {
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    modules[r][c] = dark;
    isFunction[r][c] = true;
  };

  // Finder patterns
  const drawFinder = (row: number, col: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = row + dr;
        const c = col + dc;
        const isBorder =
          dr === -1 || dr === 7 || dc === -1 || dc === 7;
        const isOuter =
          dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const isInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFunctionModule(r, c, !isBorder && (isOuter || isInner));
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFunctionModule(6, i, i % 2 === 0);
    setFunctionModule(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  const align = spec.alignment;
  for (const r of align) {
    for (const c of align) {
      if (
        (r === 6 && c === 6) ||
        (r === 6 && c === size - 7) ||
        (r === size - 7 && c === 6)
      ) {
        continue;
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark =
            Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          setFunctionModule(r + dr, c + dc, dark);
        }
      }
    }
  }

  // Dark module & Format reserved areas
  setFunctionModule(size - 8, 8, true);
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      if (!isFunction[8][i]) setFunctionModule(8, i, false);
      if (!isFunction[i][8]) setFunctionModule(i, 8, false);
    }
  }
  for (let i = 0; i < 8; i++) {
    setFunctionModule(8, size - 1 - i, false);
    setFunctionModule(size - 1 - i, 8, false);
  }

  // Zigzag 데이터 배치
  let bitIdx = 0;
  const totalBits = finalBytes.length * 8;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      const r = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (!isFunction[r][c]) {
          let dark = false;
          if (bitIdx < totalBits) {
            const byte = finalBytes[bitIdx >>> 3];
            dark = ((byte >>> (7 - (bitIdx & 7))) & 1) === 1;
            bitIdx++;
          }
          // Mask pattern 0: (r + c) % 2 === 0
          if ((r + c) % 2 === 0) dark = !dark;
          modules[r][c] = dark;
        }
      }
    }
    upward = !upward;
  }

  // Format information for ECC Level L (01) + Mask 0 (000) -> 0x77c4
  const formatBits = 0x77c4;
  const getFormatBit = (i: number) => ((formatBits >>> i) & 1) === 1;

  for (let i = 0; i <= 5; i++) setFunctionModule(8, i, getFormatBit(i));
  setFunctionModule(8, 7, getFormatBit(6));
  setFunctionModule(8, 8, getFormatBit(7));
  setFunctionModule(7, 8, getFormatBit(8));
  for (let i = 9; i < 15; i++) setFunctionModule(14 - i, 8, getFormatBit(i));

  for (let i = 0; i < 8; i++)
    setFunctionModule(size - 1 - i, 8, getFormatBit(i));
  for (let i = 8; i < 15; i++)
    setFunctionModule(8, size - 15 + i, getFormatBit(i));

  return modules;
}
