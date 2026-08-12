import NetInfo from "@react-native-community/netinfo";

export const INTERNET_CONNECTION_MESSAGE =
  "Please check your internet connection and try again.";

export const isNetworkRequestError = (error) =>
  !error?.response || ["ERR_NETWORK", "ECONNABORTED", "ETIMEDOUT"].includes(error?.code);

export async function hasInternetConnection() {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected !== false && state.isInternetReachable !== false;
  } catch (error) {
    // Allow the real request to run if the native connectivity probe itself
    // is unavailable; request-level network handling remains the fallback.
    console.warn("Unable to check network state:", error);
    return true;
  }
}
