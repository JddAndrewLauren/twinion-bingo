import { randomInt } from 'node:crypto';

/**
 * The 26 letters minus O and I, which are misheard and mistyped as 0 and 1 —
 * and no digits at all, so there is nothing for them to be confused with. 24
 * characters over 4 positions is ~331k codes, which is plenty for a room code
 * that only has to be unique among the handful of rooms alive on a race day.
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export const ROOM_CODE_LENGTH = 4;

const codePattern = new RegExp(
  `^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`,
);

export function generateRoomCode(): string {
  let code = '';
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    // randomInt over Math.random: unbiased, and the code is the only thing
    // standing between a stranger and someone else's room.
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Codes get read aloud and thumb-typed, so accept whatever case and stray
 * spaces arrive. Returns undefined for anything that is not a valid code —
 * including one containing the four characters the alphabet deliberately omits.
 */
export function normalizeRoomCode(input: string): string | undefined {
  const candidate = input.trim().toUpperCase();

  return codePattern.test(candidate) ? candidate : undefined;
}
