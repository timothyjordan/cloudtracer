/**
 * Environment signals that decide telemetry before any config file is read.
 *
 * Kept platform-agnostic (it takes an env record rather than reading
 * `process.env`) so it stays testable and so the core imports no `node:*`.
 */

type Env = Record<string, string | undefined>;

function isTruthy(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

function isFalsy(value: string | undefined): boolean {
  return value === "0" || value === "false";
}

/**
 * Whether the environment forces telemetry on or off, or `undefined` to defer
 * to the stored config.
 *
 * Precedence is most-specific-first:
 *
 * 1. `CLOUDTRACER_TELEMETRY` is an explicit choice about this tool, so it wins
 *    outright, including over CI detection. Someone who sets it to `1` on a
 *    build agent means it.
 * 2. `DO_NOT_TRACK` is the conventional cross-tool opt-out signal. Note that
 *    `DO_NOT_TRACK=0` is treated as "no opinion", not as an opt-in: the
 *    convention only carries meaning when it is set.
 * 3. `CI` forces off, because a build agent is not a user and counting one is
 *    both noise and a surprise to whoever's pipeline it is.
 */
export function envOverride(env: Env): boolean | undefined {
  const explicit = env.CLOUDTRACER_TELEMETRY;
  if (isTruthy(explicit)) return true;
  if (isFalsy(explicit)) return false;

  if (isTruthy(env.DO_NOT_TRACK)) return false;

  if (env.CI !== undefined && env.CI !== "" && !isFalsy(env.CI)) return false;

  return undefined;
}
