import { BuildError } from "../errors.ts";

/** The message `run` fails with; any outcome but a BuildError fails the test instead. */
export function failure(run: () => unknown): string {
  try {
    run();
  } catch (err) {
    if (err instanceof BuildError) return err.message;
    throw err;
  }
  throw new Error("expected a BuildError, but nothing was thrown");
}

/** The message the promise `run` returns rejects with; any outcome but a BuildError fails the test instead. */
export async function asyncFailure(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (err) {
    if (err instanceof BuildError) return err.message;
    throw err;
  }
  throw new Error("expected a BuildError, but nothing was thrown");
}
