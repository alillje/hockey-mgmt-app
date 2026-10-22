export type History<T> = { past: T[]; present: T; future: T[] };
export const initialHistory = <T>(present: T): History<T> => ({
  past: [],
  present,
  future: [],
});
export function commit<T>(state: History<T>, present: T): History<T> {
  return JSON.stringify(present) === JSON.stringify(state.present)
    ? state
    : { past: [...state.past.slice(-79), state.present], present, future: [] };
}
export function undo<T>(s: History<T>): History<T> {
  return s.past.length
    ? {
        past: s.past.slice(0, -1),
        present: s.past[s.past.length - 1],
        future: [s.present, ...s.future],
      }
    : s;
}
export function redo<T>(s: History<T>): History<T> {
  return s.future.length
    ? {
        past: [...s.past, s.present],
        present: s.future[0],
        future: s.future.slice(1),
      }
    : s;
}
