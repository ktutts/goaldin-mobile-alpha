/** Offline YIN-inspired difference-function pitch detection. No network/audio storage. */
export type PitchReading = { frequency: number; note: string; octave: number; cents: number; midi: number };
const NAMES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
export function pitchFromSamples(input: Float32Array, sampleRate: number): PitchReading | null {
  if (input.length < 2048 || sampleRate < 8000) return null;
  const size = Math.min(input.length, 8192);
  const data = input.subarray(input.length - size);
  let mean = 0, power = 0;
  for (let i = 0; i < size; i++) mean += data[i];
  mean /= size;
  for (let i = 0; i < size; i++) { const x = data[i] - mean; power += x*x; }
  if (Math.sqrt(power / size) < 0.008) return null;
  const minLag = Math.max(2, Math.floor(sampleRate / 1100));
  const maxLag = Math.min(Math.floor(sampleRate / 65), Math.floor(size / 2) - 1);
  const diff = new Float64Array(maxLag + 1);
  const cmnd = new Float64Array(maxLag + 1);
  let running = 0;
  const span = size - maxLag;
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < span; i += 2) {
      const d = data[i] - data[i + lag]; sum += d * d;
    }
    diff[lag] = sum;
    running += sum;
    cmnd[lag] = running > 0 ? (sum * lag) / running : 1;
  }
  let candidate = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (cmnd[lag] < 0.16) {
      while (lag + 1 <= maxLag && cmnd[lag + 1] < cmnd[lag]) lag++;
      candidate = lag;
      break;
    }
  }
  if (candidate < 0 || cmnd[candidate] > 0.22) return null;
  const a = cmnd[candidate - 1] ?? cmnd[candidate];
  const b = cmnd[candidate];
  const c = cmnd[candidate + 1] ?? cmnd[candidate];
  const denominator = a - 2*b + c;
  const correction = Math.abs(denominator) > 1e-9 ? Math.max(-1, Math.min(1, 0.5 * (a-c) / denominator)) : 0;
  const frequency = sampleRate / (candidate + correction);
  const exactMidi = 69 + 12 * Math.log2(frequency / 440);
  const midi = Math.round(exactMidi);
  if (!Number.isFinite(exactMidi) || midi < 24 || midi > 96) return null;
  return { frequency, note: NAMES[((midi % 12) + 12) % 12], octave: Math.floor(midi / 12) - 1, cents: Math.round((exactMidi - midi) * 100), midi };
}
