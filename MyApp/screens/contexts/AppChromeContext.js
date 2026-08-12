import React, { createContext, useContext } from "react";

const noop = () => {};

export const AppChromeContext = createContext({
  openDrawer: noop,
  openNotifications: noop,
  unreadCount: 0,
});

export function useAppChrome() {
  return useContext(AppChromeContext);
}