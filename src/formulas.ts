/** Local FairHelm hydro formulas (parity with frontend formula-interactive). No CapEx. */

export function hullSpeedKn(lwlM: number): number | null {
  if (!(lwlM > 0)) return null;
  return 2.43 * Math.sqrt(lwlM);
}

export function capsizeScreening(beamM: number, displacementKg: number): number | null {
  if (!(beamM > 0) || !(displacementKg > 0)) return null;
  return beamM / (displacementKg / 1025) ** (1 / 3);
}

export function comfortRatio(input: {
  displacementKg: number;
  lwlM: number;
  loaM: number;
  beamM: number;
}): number | null {
  const { displacementKg, lwlM, loaM, beamM } = input;
  if (!(displacementKg > 0 && lwlM > 0 && loaM > 0 && beamM > 0)) return null;
  const dispLb = displacementKg * 2.20462;
  const lwlFt = lwlM * 3.28084;
  const loaFt = loaM * 3.28084;
  const beamFt = beamM * 3.28084;
  const denom = 0.65 * (0.7 * lwlFt + 0.3 * loaFt) * beamFt ** 1.333;
  if (denom <= 0) return null;
  return dispLb / denom;
}

export function displacementLengthRatio(dispKg: number, lwlM: number): number | null {
  if (!(dispKg > 0 && lwlM > 0)) return null;
  return (dispKg / lwlM ** 3) * 27.87;
}

export function sailAreaDisplacement(saM2: number, dispKg: number): number | null {
  if (!(saM2 > 0 && dispKg > 0)) return null;
  return (saM2 * 101.65) / dispKg ** (2 / 3);
}
