import { useCallback, useEffect, useRef } from "react";
import { Keyboard, Platform } from "react-native";

export default function useFormAutoScroll(offset = 180) {
  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  const fieldRefs = useRef({});
  const inputPositions = useRef({});
  const scrollTimerRef = useRef(null);
  const targetScrollRef = useRef(null);

  useEffect(() => {
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const hideSub = Keyboard.addListener(hideEvent, () => {
      targetScrollRef.current = null;
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = null;
      }
    });

    return () => {
      hideSub.remove();
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, []);

  const handleScroll = useCallback(() => {}, []);

  const registerInput = useCallback((key) => (event) => {
    inputPositions.current[key] = event.nativeEvent.layout.y;
  }, []);

  const registerField = useCallback((key) => (ref) => {
    fieldRefs.current[key] = ref;
  }, []);

  const scheduleSmoothScroll = useCallback((targetY, delay = 90) => {
    targetScrollRef.current = Math.max(0, Number(targetY) || 0);

    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);

    scrollTimerRef.current = setTimeout(() => {
      const y = targetScrollRef.current || 0;
      scrollTimerRef.current = null;
      targetScrollRef.current = null;

      scrollRef.current?.scrollTo({
        y: Math.max(0, y),
        animated: true,
      });
    }, delay);
  }, []);

  const scrollToInput = useCallback(
    (key) => {
      const alignFieldHigh = (delay = 180) => {
        const fieldRef = fieldRefs.current[key];

        if (fieldRef && contentRef.current && scrollRef.current) {
          fieldRef.measureLayout(
            contentRef.current,
            (_x, y) => scheduleSmoothScroll(y - offset, delay),
            () => scheduleSmoothScroll((inputPositions.current[key] || 0) - offset, delay)
          );
          return;
        }

        scheduleSmoothScroll((inputPositions.current[key] || 0) - offset, delay);
      };

      // Let Android finish resizing for the keyboard, then do one smooth final align.
      // Earlier measurements only update the final target; the last one performs the movement.
      [90, 230, 370].forEach((delay) => {
        setTimeout(() => alignFieldHigh(180), delay);
      });
    },
    [offset, scheduleSmoothScroll]
  );

  return {
    scrollRef,
    contentRef,
    registerInput,
    registerField,
    scrollToInput,
    handleScroll,
  };
}
