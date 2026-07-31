// The one bit of setup state that has to be readable from several places at
// once: the root redirect (a Server Component), the welcome screen, and the
// action that ends setup.
//
// It lives in its own module rather than in app/welcome/actions.ts because that
// file is "use server" — such a module may only export async functions, so a
// shared constant cannot live there. Small file, real reason.
export const WELCOMED_COOKIE = "grove-welcomed";

/** How long the gate stays answered on a device. */
export const WELCOMED_MAX_AGE = 60 * 60 * 24 * 365;
