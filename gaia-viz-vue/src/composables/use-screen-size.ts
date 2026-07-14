import { reactive, computed, onMounted, onUnmounted, toRefs } from "vue";

/**
 * Composable to detect whether the current device is mobile, tablet, laptop,
 * or a large screen based on the window width.
 *
 * Tracks the window width and updates reactively as the window is resized.
 *
 * @returns reactive refs for isMobile, isTablet, isLaptop, isLargeScreen,
 *          screenWidth, plus the derived isSmallViewport and isLargeViewPort.
 */
const useScreenSize = () => {
  const screenSize = reactive({
    isMobile: false,
    isTablet: false,
    isLaptop: false,
    isLargeScreen: false,
    screenWidth: 0,
  });

  const handleResize = () => {
    screenSize.isMobile = window.innerWidth < 640;
    screenSize.isTablet = window.innerWidth > 640 && window.innerWidth < 768;
    screenSize.isLaptop = window.innerWidth > 768 && window.innerWidth < 1024;
    screenSize.isLargeScreen = window.innerWidth > 1300;
    screenSize.screenWidth = window.innerWidth;
  };

  onMounted(() => {
    handleResize();
    window.addEventListener("resize", handleResize);
  });

  onUnmounted(() => {
    window.removeEventListener("resize", handleResize);
  });

  const isSmallViewport = computed(
    () => screenSize.isMobile || screenSize.isTablet,
  );
  const isLargeViewPort = computed(
    () => screenSize.isLaptop || screenSize.isLargeScreen,
  );

  return {
    ...toRefs(screenSize),
    isSmallViewport,
    isLargeViewPort,
  };
};

export default useScreenSize;