export const ControlsPosition = {
  TOP_RIGHT: "top-right",
  TOP_LEFT: "top-left",
} as const;

export type ControlsPosition =
  (typeof ControlsPosition)[keyof typeof ControlsPosition];