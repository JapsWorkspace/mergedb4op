// stores/bottomNavState.js
let prevKey = "MainCenter";
let currKey = "MainCenter";

/** Read both keys so a newly mounted bar can animate from prev -> curr. */
export function getKeys() {
  return { prevKey, currKey };
}

/** Call this when your bar initiates a tab press (BEFORE navigation). */
export function setNextKey(nextKey) {
  if (!nextKey || typeof nextKey !== "string") return;
  prevKey = currKey;
  currKey = nextKey;
}

/** Call this on mount/route sync (if navigation happened elsewhere). */
export function syncWithRoute(routeName) {
  if (!routeName || typeof routeName !== "string") return;
  if (routeName !== currKey) {
    prevKey = currKey;
    currKey = routeName;
  }
}
// stores/bottomNavState.js
let prevKey = "MainCenter";
let currKey = "MainCenter";

/** Read both keys so a newly mounted bar can animate from prev -> curr. */
export function getKeys() {
  return { prevKey, currKey };
}

/** Call this when your bar initiates a tab press (BEFORE navigation). */
export function setNextKey(nextKey) {
  if (!nextKey || typeof nextKey !== "string") return;
  prevKey = currKey;
  currKey = nextKey;
}

/** Call this on mount/route sync (if navigation happened elsewhere). */
export function syncWithRoute(routeName) {
  if (!routeName || typeof routeName !== "string") return;
  if (routeName !== currKey) {
    prevKey = currKey;
    currKey = routeName;
  }
}