import { ref } from "vue";

export default function useToggle(initialValue: boolean = false) {
  const state = ref(initialValue);

  function toggle() {
    state.value = !state.value;
  }

  return {
    state,
    toggle,
  };
}
