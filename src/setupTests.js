// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
/* eslint-env es2020 */
import '@testing-library/jest-dom';
import { webcrypto } from 'node:crypto';

/* The jsdom environment CRA pins does not define the `crypto` global, so the
   room-code and player-id generator — which reaches for the CSPRNG on purpose,
   because a room code is the only thing guarding a live session — throws a
   ReferenceError the moment App mounts. Every browser this product targets has
   had it for a decade; this closes a hole in the test environment, not in the
   product, so it is wired to Node's real Web Crypto rather than to a stub. */
if (!globalThis.crypto?.getRandomValues) {
  globalThis.crypto = webcrypto;
}

/* Same shape of gap: jsdom declares window.scrollTo and then throws
   "Not implemented" from it, so every test that follows an internal link logs
   a stack trace for a call whose only job is to put a real browser back at the
   top of the page. Nothing asserts on scroll position, so a no-op is the whole
   behaviour — this silences the environment, not a product error. */
if (typeof window !== "undefined") {
  window.scrollTo = () => {};
}
